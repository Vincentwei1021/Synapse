// src/services/experiment-run.service.ts
// ExperimentRun Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatAssigneeComplete, formatCreatedBy, batchGetActorNames, batchFormatCreatedBy } from "@/lib/uuid-resolver";
import { eventBus } from "@/lib/event-bus";
import { AlreadyClaimedError, NotClaimedError, isPrismaNotFound } from "@/lib/errors";
import { batchCommentCounts } from "@/services/comment.service";
import * as mentionService from "@/services/mention.service";
import * as activityService from "@/services/activity.service";
import { releaseGpuReservationsForRun } from "@/services/compute.service";
import { refreshProjectSynthesis } from "@/services/project-synthesis.service";

// ===== Type Definitions =====

export interface ExperimentRunListParams {
  companyUuid: string;
  researchProjectUuid: string;
  skip: number;
  take: number;
  status?: string;
  priority?: string;
  experimentDesignUuids?: string[];
}

export interface ExperimentRunCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  title: string;
  description?: string | null;
  priority?: string;
  computeBudgetHours?: number | null;
  acceptanceCriteria?: string | null;  // acceptance criteria
  experimentDesignUuid?: string | null;
  createdByUuid: string;
}

export interface ExperimentRunClaimParams {
  runUuid: string;
  companyUuid: string;
  assigneeType: string;
  assigneeUuid: string;
  assignedByUuid?: string | null;
}

export interface ExperimentRunUpdateParams {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  computeBudgetHours?: number | null;
  acceptanceCriteria?: string | null;  // acceptance criteria
  outcome?: string | null;
  experimentResults?: unknown;
}

// Dependency summary info
export interface RunDependencyInfo {
  uuid: string;
  title: string;
  status: string;
}

// API response format
export interface AcceptanceCriterionResponse {
  uuid: string;
  description: string;
  required: boolean;
  devStatus: string;  // pending | passed | failed
  devEvidence: string | null;
  devMarkedByType: string | null;
  devMarkedBy: string | null;
  devMarkedAt: string | null;
  status: string;  // pending | passed | failed
  evidence: string | null;
  markedByType: string | null;
  markedBy: string | null;
  markedAt: string | null;
  sortOrder: number;
}

export interface AcceptanceSummary {
  total: number;
  required: number;
  passed: number;
  failed: number;
  pending: number;
  requiredPassed: number;
  requiredFailed: number;
  requiredPending: number;
}

export interface ExperimentRunResponse {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  computeBudgetHours: number | null;
  acceptanceCriteria: string | null;  // acceptance criteria (Markdown, legacy)
  outcome: string | null;
  experimentResults: unknown;
  acceptanceCriteriaItems: AcceptanceCriterionResponse[];
  acceptanceStatus: string;  // not_started | in_progress | passed | failed
  acceptanceSummary: AcceptanceSummary;
  assignee: {
    type: string;
    uuid: string;
    name: string;
    assignedAt: string | null;
    assignedBy: { type: string; uuid: string; name: string } | null;
  } | null;
  experimentDesignUuid: string | null;
  project?: { uuid: string; name: string };
  createdBy: { type: string; uuid: string; name: string } | null;
  dependsOn: RunDependencyInfo[];
  dependedBy: RunDependencyInfo[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

// ExperimentRun status transition rules (ARCHITECTURE.md §7.2)
export const EXPERIMENT_RUN_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["to_verify", "closed"],
  to_verify: ["done", "in_progress", "closed"],
  done: ["closed"],
  closed: [],
};

// Validate whether a status transition is valid
export function isValidExperimentRunStatusTransition(from: string, to: string): boolean {
  const allowed = EXPERIMENT_RUN_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ===== Acceptance Criteria Helpers =====

const emptySummary: AcceptanceSummary = {
  total: 0, required: 0, passed: 0, failed: 0, pending: 0,
  requiredPassed: 0, requiredFailed: 0, requiredPending: 0,
};

export function computeAcceptanceStatus(
  items: Array<{ required: boolean; status: string }>,
): { status: string; summary: AcceptanceSummary } {
  if (items.length === 0) {
    return { status: "not_started", summary: { ...emptySummary } };
  }

  const summary: AcceptanceSummary = { ...emptySummary, total: items.length };
  for (const item of items) {
    if (item.required) summary.required++;
    if (item.status === "passed") {
      summary.passed++;
      if (item.required) summary.requiredPassed++;
    } else if (item.status === "failed") {
      summary.failed++;
      if (item.required) summary.requiredFailed++;
    } else {
      summary.pending++;
      if (item.required) summary.requiredPending++;
    }
  }

  if (summary.requiredFailed > 0) return { status: "failed", summary };
  if (summary.requiredPassed === summary.required && summary.required > 0) return { status: "passed", summary };
  if (summary.passed > 0 || summary.failed > 0) return { status: "in_progress", summary };
  return { status: "not_started", summary };
}

function formatCriterionResponse(
  c: { uuid: string; description: string; required: boolean; devStatus: string; devEvidence: string | null; devMarkedByType: string | null; devMarkedBy: string | null; devMarkedAt: Date | null; status: string; evidence: string | null; markedByType: string | null; markedBy: string | null; markedAt: Date | null; sortOrder: number },
): AcceptanceCriterionResponse {
  return {
    uuid: c.uuid,
    description: c.description,
    required: c.required,
    devStatus: c.devStatus,
    devEvidence: c.devEvidence,
    devMarkedByType: c.devMarkedByType,
    devMarkedBy: c.devMarkedBy,
    devMarkedAt: c.devMarkedAt?.toISOString() ?? null,
    status: c.status,
    evidence: c.evidence,
    markedByType: c.markedByType,
    markedBy: c.markedBy,
    markedAt: c.markedAt?.toISOString() ?? null,
    sortOrder: c.sortOrder,
  };
}

// ===== Internal Helper Functions =====

// Format a single Task into API response format
async function formatExperimentRunResponse(
  task: {
    uuid: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    computeBudgetHours: number | null;
    acceptanceCriteria: string | null;
    outcome?: string | null;
    experimentResults?: unknown;
    assigneeType: string | null;
    assigneeUuid: string | null;
    assignedAt: Date | null;
    assignedByUuid: string | null;
    experimentDesignUuid: string | null;
    createdByUuid: string;
    createdAt: Date;
    updatedAt: Date;
    researchProject?: { uuid: string; name: string };
    dependsOn?: Array<{ dependsOnRun: { uuid: string; title: string; status: string } }>;
    dependedBy?: Array<{ run: { uuid: string; title: string; status: string } }>;
    acceptanceCriteriaItems?: Array<{ uuid: string; description: string; required: boolean; devStatus: string; devEvidence: string | null; devMarkedByType: string | null; devMarkedBy: string | null; devMarkedAt: Date | null; status: string; evidence: string | null; markedByType: string | null; markedBy: string | null; markedAt: Date | null; sortOrder: number }>;
  },
  commentCount: number = 0,
): Promise<ExperimentRunResponse> {
  const [assignee, createdBy] = await Promise.all([
    formatAssigneeComplete(task.assigneeType, task.assigneeUuid, task.assignedAt, task.assignedByUuid),
    formatCreatedBy(task.createdByUuid),
  ]);

  const dependsOn: RunDependencyInfo[] = (task.dependsOn || []).map((d) => ({
    uuid: d.dependsOnRun.uuid,
    title: d.dependsOnRun.title,
    status: d.dependsOnRun.status,
  }));

  const dependedBy: RunDependencyInfo[] = (task.dependedBy || []).map((d) => ({
    uuid: d.run.uuid,
    title: d.run.title,
    status: d.run.status,
  }));

  const criteriaItems = (task.acceptanceCriteriaItems || []).map(formatCriterionResponse);
  const { status: acceptanceStatus, summary: acceptanceSummary } = computeAcceptanceStatus(
    task.acceptanceCriteriaItems || [],
  );

  return {
    uuid: task.uuid,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    computeBudgetHours: task.computeBudgetHours,
    acceptanceCriteria: task.acceptanceCriteria,
    outcome: task.outcome ?? null,
    experimentResults: task.experimentResults ?? null,
    acceptanceCriteriaItems: criteriaItems,
    acceptanceStatus,
    acceptanceSummary,
    assignee,
    experimentDesignUuid: task.experimentDesignUuid,
    ...(task.researchProject && { project: task.researchProject }),
    createdBy,
    dependsOn,
    dependedBy,
    commentCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// Batch format multiple tasks - 2 batch queries instead of N * (3-4) individual queries
type RawExperimentRunForBatch = {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  computeBudgetHours: number | null;
  acceptanceCriteria: string | null;
  outcome?: string | null;
  experimentResults?: unknown;
  assigneeType: string | null;
  assigneeUuid: string | null;
  assignedAt: Date | null;
  assignedByUuid: string | null;
  experimentDesignUuid: string | null;
  createdByUuid: string;
  createdAt: Date;
  updatedAt: Date;
  researchProject?: { uuid: string; name: string };
  dependsOn?: Array<{ dependsOnRun: { uuid: string; title: string; status: string } }>;
  dependedBy?: Array<{ run: { uuid: string; title: string; status: string } }>;
  acceptanceCriteriaItems?: Array<{ uuid: string; description: string; required: boolean; devStatus: string; devEvidence: string | null; devMarkedByType: string | null; devMarkedBy: string | null; devMarkedAt: Date | null; status: string; evidence: string | null; markedByType: string | null; markedBy: string | null; markedAt: Date | null; sortOrder: number }>;
};

async function formatExperimentRunResponsesBatch(
  tasks: RawExperimentRunForBatch[],
  commentCounts: Record<string, number>,
): Promise<ExperimentRunResponse[]> {
  if (tasks.length === 0) return [];

  // Collect all unique actors for batch resolution
  const actors: Array<{ type: string; uuid: string }> = [];
  const createdByUuids: string[] = [];

  for (const task of tasks) {
    if (task.assigneeType && task.assigneeUuid) {
      actors.push({ type: task.assigneeType, uuid: task.assigneeUuid });
    }
    if (task.assignedByUuid) {
      actors.push({ type: "user", uuid: task.assignedByUuid });
    }
    createdByUuids.push(task.createdByUuid);
  }

  // 2 batch queries instead of N * (3-4) individual queries
  const [actorNames, createdByMap] = await Promise.all([
    batchGetActorNames(actors),
    batchFormatCreatedBy(createdByUuids),
  ]);

  // Build responses synchronously from lookup maps
  return tasks.map((task) => {
    let assignee: ExperimentRunResponse["assignee"] = null;
    if (task.assigneeType && task.assigneeUuid) {
      const assigneeName = actorNames.get(task.assigneeUuid);
      if (assigneeName) {
        let assignedBy: { type: string; uuid: string; name: string } | null = null;
        if (task.assignedByUuid) {
          const assignedByName = actorNames.get(task.assignedByUuid);
          if (assignedByName) {
            assignedBy = { type: "user", uuid: task.assignedByUuid, name: assignedByName };
          }
        }
        assignee = {
          type: task.assigneeType,
          uuid: task.assigneeUuid,
          name: assigneeName,
          assignedAt: task.assignedAt?.toISOString() ?? null,
          assignedBy,
        };
      }
    }

    const createdBy = createdByMap.get(task.createdByUuid) ?? null;

    const dependsOn: RunDependencyInfo[] = (task.dependsOn || []).map((d: { dependsOnRun: { uuid: string; title: string; status: string } }) => ({
      uuid: d.dependsOnRun.uuid,
      title: d.dependsOnRun.title,
      status: d.dependsOnRun.status,
    }));

    const dependedBy: RunDependencyInfo[] = (task.dependedBy || []).map((d: { run: { uuid: string; title: string; status: string } }) => ({
      uuid: d.run.uuid,
      title: d.run.title,
      status: d.run.status,
    }));

    const criteriaItems = (task.acceptanceCriteriaItems || []).map(formatCriterionResponse);
    const { status: acceptanceStatus, summary: acceptanceSummary } = computeAcceptanceStatus(
      task.acceptanceCriteriaItems || [],
    );

    return {
      uuid: task.uuid,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      computeBudgetHours: task.computeBudgetHours,
      acceptanceCriteria: task.acceptanceCriteria,
      outcome: task.outcome ?? null,
      experimentResults: task.experimentResults ?? null,
      acceptanceCriteriaItems: criteriaItems,
      acceptanceStatus,
      acceptanceSummary,
      assignee,
      experimentDesignUuid: task.experimentDesignUuid,
      ...(task.researchProject && { project: task.researchProject }),
      createdBy,
      dependsOn,
      dependedBy,
      commentCount: commentCounts[task.uuid] ?? 0,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  });
}

// ===== Dependency relation include template =====

const dependencyInclude = {
  dependsOn: {
    select: {
      dependsOnRun: { select: { uuid: true, title: true, status: true } },
    },
  },
  dependedBy: {
    select: {
      run: { select: { uuid: true, title: true, status: true } },
    },
  },
  acceptanceCriteriaItems: {
    orderBy: { sortOrder: "asc" as const },
  },
} as const;

// ===== Service Methods =====

// List experiment runs query
export async function listExperimentRuns({
  companyUuid,
  researchProjectUuid,
  skip,
  take,
  status,
  priority,
  experimentDesignUuids,
}: ExperimentRunListParams): Promise<{ tasks: ExperimentRunResponse[]; total: number }> {
  const where = {
    researchProjectUuid,
    companyUuid,
    ...(status && { status }),
    ...(priority && { priority }),
    ...(experimentDesignUuids && experimentDesignUuids.length > 0 && { experimentDesignUuid: { in: experimentDesignUuids } }),
  };

  const [rawTasks, total] = await Promise.all([
    prisma.experimentRun.findMany({
      where,
      skip,
      take,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        computeBudgetHours: true,
        acceptanceCriteria: true,
        outcome: true,
        experimentResults: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        experimentDesignUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
        ...dependencyInclude,
      },
    }),
    prisma.experimentRun.count({ where }),
  ]);

  // Batch-fetch comment counts for all tasks in one query
  const commentCounts = await batchCommentCounts(
    companyUuid,
    "experiment_run",
    rawTasks.map((t) => t.uuid),
  );

  // Batch format: 2 queries total instead of N * (3-4)
  const tasks = await formatExperimentRunResponsesBatch(rawTasks, commentCounts);
  return { tasks, total };
}

// Get ExperimentRun details
export async function getExperimentRun(
  companyUuid: string,
  uuid: string
): Promise<ExperimentRunResponse | null> {
  const task = await prisma.experimentRun.findFirst({
    where: { uuid, companyUuid },
    include: {
      researchProject: { select: { uuid: true, name: true } },
      ...dependencyInclude,
    },
  });

  if (!task) return null;

  const commentCount = await prisma.comment.count({
    where: { companyUuid, targetType: "experiment_run", targetUuid: uuid },
  });

  return formatExperimentRunResponse(task, commentCount);
}

// Get raw Task data by UUID (internal use, for permission checks etc.)
export async function getExperimentRunByUuid(companyUuid: string, uuid: string) {
  return prisma.experimentRun.findFirst({
    where: { uuid, companyUuid },
  });
}

// Create ExperimentRun
export async function createExperimentRun(params: ExperimentRunCreateParams): Promise<ExperimentRunResponse> {
  const task = await prisma.experimentRun.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      title: params.title,
      description: params.description,
      status: "open",
      priority: params.priority || "medium",
      computeBudgetHours: params.computeBudgetHours,
      acceptanceCriteria: params.acceptanceCriteria,
      outcome: null,
      experimentDesignUuid: params.experimentDesignUuid,
      createdByUuid: params.createdByUuid,
    },
    select: {
      uuid: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      computeBudgetHours: true,
      acceptanceCriteria: true,
      outcome: true,
      experimentResults: true,
      assigneeType: true,
      assigneeUuid: true,
      assignedAt: true,
      assignedByUuid: true,
      experimentDesignUuid: true,
      createdByUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  eventBus.emitChange({ companyUuid: params.companyUuid, researchProjectUuid: params.researchProjectUuid, entityType: "experiment_run", entityUuid: task.uuid, action: "created" });

  return formatExperimentRunResponse(task);
}

// Update ExperimentRun
export async function updateExperimentRun(
  uuid: string,
  data: ExperimentRunUpdateParams,
  actorContext?: { actorType: string; actorUuid: string }
): Promise<ExperimentRunResponse> {
  // If description is being updated and we have actor context, capture old description for mention diffing
  let oldDescription: string | null = null;
  if (data.description !== undefined && actorContext) {
    const existing = await prisma.experimentRun.findUnique({ where: { uuid }, select: { description: true } });
    oldDescription = existing?.description ?? null;
  }

  // If moving FROM to_verify to any status EXCEPT done, reset acceptance criteria
  // Wrapped in transaction to prevent TOCTOU race condition
  const updateData: Record<string, unknown> = { ...data };
  if (data.experimentResults !== undefined) {
    updateData.experimentResults =
      data.experimentResults === null
        ? Prisma.JsonNull
        : (data.experimentResults as Prisma.InputJsonValue);
  }

  let previousStatus: string | null = null;
  const task = await prisma.$transaction(async (tx) => {
    if (data.status) {
      const current = await tx.experimentRun.findUnique({ where: { uuid }, select: { status: true } });
      previousStatus = current?.status ?? null;

      if (data.status !== "done" && current?.status === "to_verify") {
        await tx.acceptanceCriterion.updateMany({
          where: { runUuid: uuid },
          data: {
            status: "pending",
            evidence: null,
            markedByType: null,
            markedBy: null,
            markedAt: null,
            devStatus: "pending",
            devEvidence: null,
            devMarkedByType: null,
            devMarkedBy: null,
            devMarkedAt: null,
          },
        });
      }
    }

    return tx.experimentRun.update({
      where: { uuid },
      data: updateData,
      include: {
        researchProject: { select: { uuid: true, name: true } },
      },
    });
  });

  eventBus.emitChange({ companyUuid: task.companyUuid, researchProjectUuid: task.researchProject.uuid, entityType: "experiment_run", entityUuid: task.uuid, action: "updated" });

  const terminalStatuses = new Set(["done", "closed"]);
  const enteredTerminalStatus =
    previousStatus !== null &&
    data.status !== undefined &&
    terminalStatuses.has(task.status) &&
    previousStatus !== task.status;

  if (enteredTerminalStatus) {
    await releaseGpuReservationsForRun(task.companyUuid, task.uuid);
    await refreshProjectSynthesis(
      task.companyUuid,
      task.researchProject.uuid,
      actorContext?.actorUuid ?? task.createdByUuid,
    );
  }

  // Process new @mentions in description (append-only: only new mentions)
  if (data.description !== undefined && actorContext && data.description) {
    processNewMentions(
      task.companyUuid,
      task.researchProject.uuid,
      "experiment_run",
      task.uuid,
      task.title,
      oldDescription,
      data.description,
      actorContext.actorType,
      actorContext.actorUuid,
    ).catch((err) => console.error("[ExperimentRun] Failed to process mentions:", err));
  }

  return formatExperimentRunResponse(task);
}

export async function submitExperimentRunResults(
  companyUuid: string,
  runUuid: string,
  input: {
    outcome?: string | null;
    experimentResults?: unknown;
  },
  actorContext?: { actorType: string; actorUuid: string }
): Promise<ExperimentRunResponse> {
  const updated = await updateExperimentRun(
    runUuid,
    {
      status: "to_verify",
      outcome: input.outcome ?? null,
      experimentResults: input.experimentResults ?? null,
    },
    actorContext,
  );

  await releaseGpuReservationsForRun(companyUuid, runUuid);
  return updated;
}

// Claim ExperimentRun (atomic: only succeeds if status is "open")
export async function claimExperimentRun({
  runUuid,
  companyUuid,
  assigneeType,
  assigneeUuid,
  assignedByUuid,
}: ExperimentRunClaimParams): Promise<ExperimentRunResponse> {
  try {
    const task = await prisma.experimentRun.update({
      where: { uuid: runUuid, status: "open" },
      data: {
        status: "assigned",
        assigneeType,
        assigneeUuid,
        assignedAt: new Date(),
        assignedByUuid,
      },
      include: {
        researchProject: { select: { uuid: true, name: true } },
      },
    });

    eventBus.emitChange({ companyUuid, researchProjectUuid: task.researchProject.uuid, entityType: "experiment_run", entityUuid: task.uuid, action: "updated" });

    return formatExperimentRunResponse(task);
  } catch (e: unknown) {
    if (isPrismaNotFound(e)) {
      throw new AlreadyClaimedError("ExperimentRun");
    }
    throw e;
  }
}

// Release ExperimentRun (atomic: only succeeds if status is "assigned")
export async function releaseExperimentRun(uuid: string): Promise<ExperimentRunResponse> {
  try {
    const task = await prisma.experimentRun.update({
      where: { uuid, status: "assigned" },
      data: {
        status: "open",
        assigneeType: null,
        assigneeUuid: null,
        assignedAt: null,
        assignedByUuid: null,
      },
      include: {
        researchProject: { select: { uuid: true, name: true } },
      },
    });

    eventBus.emitChange({ companyUuid: task.companyUuid, researchProjectUuid: task.researchProject.uuid, entityType: "experiment_run", entityUuid: task.uuid, action: "updated" });

    return formatExperimentRunResponse(task);
  } catch (e: unknown) {
    if (isPrismaNotFound(e)) {
      throw new NotClaimedError("ExperimentRun");
    }
    throw e;
  }
}

// Delete ExperimentRun
export async function deleteExperimentRun(uuid: string) {
  const task = await prisma.experimentRun.delete({ where: { uuid } });
  eventBus.emitChange({ companyUuid: task.companyUuid, researchProjectUuid: task.researchProjectUuid, entityType: "experiment_run", entityUuid: task.uuid, action: "deleted" });
  return task;
}

// Batch create ExperimentRuns (used for Proposal approval)
// Accepts a task list with draftUuids, returns { tasks, draftToTaskUuidMap }
export async function createExperimentRunsFromDesign(
  companyUuid: string,
  researchProjectUuid: string,
  experimentDesignUuid: string,
  createdByUuid: string,
  tasks: Array<{ uuid?: string; title: string; description?: string; priority?: string; computeBudgetHours?: number; acceptanceCriteria?: string }>
): Promise<{ tasks: ExperimentRunResponse[]; draftToTaskUuidMap: Map<string, string> }> {
  const draftToTaskUuidMap = new Map<string, string>();

  const createPromises = tasks.map((task) =>
    prisma.experimentRun.create({
      data: {
        companyUuid,
        researchProjectUuid,
        title: task.title,
        description: task.description || null,
        status: "open",
        priority: task.priority || "medium",
        computeBudgetHours: task.computeBudgetHours || null,
        acceptanceCriteria: task.acceptanceCriteria || null,
        outcome: null,
        experimentDesignUuid,
        createdByUuid,
      },
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        computeBudgetHours: true,
        acceptanceCriteria: true,
        outcome: true,
        experimentResults: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        experimentDesignUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  );

  const rawTasks = await Promise.all(createPromises);

  // Build draftUuid → runUuid mapping
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].uuid) {
      draftToTaskUuidMap.set(tasks[i].uuid!, rawTasks[i].uuid);
    }
  }

  const formattedTasks = await Promise.all(rawTasks.map(formatExperimentRunResponse));
  return { tasks: formattedTasks, draftToTaskUuidMap };
}

// ===== Acceptance Criteria CRUD =====

// Bulk create acceptance criteria for a task (used by proposal approval flow)
export async function createAcceptanceCriteria(
  runUuid: string,
  items: Array<{ description: string; required?: boolean; sortOrder?: number }>,
): Promise<AcceptanceCriterionResponse[]> {
  if (items.length === 0) return [];

  const createPromises = items.map((item, index) =>
    prisma.acceptanceCriterion.create({
      data: {
        runUuid,
        description: item.description,
        required: item.required ?? true,
        sortOrder: item.sortOrder ?? index,
      },
    })
  );

  const created = await Promise.all(createPromises);
  return created.map(formatCriterionResponse);
}

// Admin/user marks verification status on acceptance criteria
export async function markAcceptanceCriteria(
  companyUuid: string,
  runUuid: string,
  criteria: Array<{ uuid: string; status: "passed" | "failed"; evidence?: string }>,
  auth: { type: string; actorUuid: string },
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  // Validate task belongs to company
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  // Pre-validate all criterion UUIDs belong to this task
  const validUuids = new Set(
    (await prisma.acceptanceCriterion.findMany({ where: { runUuid }, select: { uuid: true } })).map((r) => r.uuid),
  );
  for (const c of criteria) {
    if (!validUuids.has(c.uuid)) throw new Error(`Criterion ${c.uuid} does not belong to task ${runUuid}`);
  }

  // Update each criterion
  for (const c of criteria) {
    await prisma.acceptanceCriterion.update({
      where: { uuid: c.uuid },
      data: {
        status: c.status,
        evidence: c.evidence ?? null,
        markedByType: auth.type,
        markedBy: auth.actorUuid,
        markedAt: new Date(),
      },
    });
  }

  // Notify UI of criteria change
  eventBus.emitChange({ companyUuid, researchProjectUuid: task.researchProjectUuid, entityType: "experiment_run", entityUuid: runUuid, action: "updated" });

  // Return updated state
  return getAcceptanceStatus(companyUuid, runUuid);
}

// Dev agent reports self-check on acceptance criteria
export async function reportCriteriaSelfCheck(
  companyUuid: string,
  runUuid: string,
  criteria: Array<{ uuid: string; devStatus: "passed" | "failed"; devEvidence?: string }>,
  auth: { type: string; actorUuid: string },
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  // Validate task belongs to company
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  // Pre-validate all criterion UUIDs belong to this task
  const validUuids = new Set(
    (await prisma.acceptanceCriterion.findMany({ where: { runUuid }, select: { uuid: true } })).map((r) => r.uuid),
  );
  for (const c of criteria) {
    if (!validUuids.has(c.uuid)) throw new Error(`Criterion ${c.uuid} does not belong to task ${runUuid}`);
  }

  // Update each criterion
  for (const c of criteria) {
    await prisma.acceptanceCriterion.update({
      where: { uuid: c.uuid },
      data: {
        devStatus: c.devStatus,
        devEvidence: c.devEvidence ?? null,
        devMarkedByType: auth.type,
        devMarkedBy: auth.actorUuid,
        devMarkedAt: new Date(),
      },
    });
  }

  // Notify UI of criteria change
  eventBus.emitChange({ companyUuid, researchProjectUuid: task.researchProjectUuid, entityType: "experiment_run", entityUuid: runUuid, action: "updated" });

  // Return updated state
  return getAcceptanceStatus(companyUuid, runUuid);
}

// Reset a single acceptance criterion back to pending (admin/user undo)
export async function resetAcceptanceCriterion(
  companyUuid: string,
  runUuid: string,
  criterionUuid: string,
): Promise<void> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  // Validate criterion belongs to this task
  const criterion = await prisma.acceptanceCriterion.findFirst({ where: { uuid: criterionUuid, runUuid } });
  if (!criterion) throw new Error("Criterion not found for this task");

  await prisma.acceptanceCriterion.update({
    where: { uuid: criterionUuid },
    data: {
      status: "pending",
      evidence: null,
      markedByType: null,
      markedBy: null,
      markedAt: null,
    },
  });

  eventBus.emitChange({ companyUuid, researchProjectUuid: task.researchProjectUuid, entityType: "experiment_run", entityUuid: runUuid, action: "updated" });
}

// Get acceptance status for a task
export async function getAcceptanceStatus(
  companyUuid: string,
  runUuid: string,
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  // Validate task belongs to company
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  const rows = await prisma.acceptanceCriterion.findMany({
    where: { runUuid },
    orderBy: { sortOrder: "asc" },
  });

  const items = rows.map(formatCriterionResponse);
  const { status, summary } = computeAcceptanceStatus(rows);

  return { items, status, summary };
}

// Check acceptance criteria gate for verify→done transition
export async function checkAcceptanceCriteriaGate(
  runUuid: string,
): Promise<{ allowed: boolean; reason?: string; summary?: AcceptanceSummary; unresolvedCriteria?: AcceptanceCriterionResponse[] }> {
  const rows = await prisma.acceptanceCriterion.findMany({
    where: { runUuid },
    orderBy: { sortOrder: "asc" },
  });

  // No criteria rows = backward compat, allow transition
  if (rows.length === 0) {
    return { allowed: true };
  }

  const requiredRows = rows.filter((r) => r.required);
  const allRequiredPassed = requiredRows.every((r) => r.status === "passed");

  if (allRequiredPassed) {
    return { allowed: true };
  }

  const { summary } = computeAcceptanceStatus(rows);

  // Return unresolved criteria — required items that are not passed (these block the gate)
  const unresolved = rows
    .filter((r) => r.required && r.status !== "passed")
    .map(formatCriterionResponse);

  return {
    allowed: false,
    reason: `Not all required acceptance criteria are passed. Required: ${summary.required}, Passed: ${summary.requiredPassed}, Failed: ${summary.requiredFailed}, Pending: ${summary.requiredPending}`,
    summary,
    unresolvedCriteria: unresolved,
  };
}

// ===== Mention Processing (append-only) =====

// Process new @mentions by diffing old vs new content
async function processNewMentions(
  companyUuid: string,
  researchProjectUuid: string,
  sourceType: "experiment_run" | "research_question",
  sourceUuid: string,
  entityTitle: string,
  oldContent: string | null,
  newContent: string,
  actorType: string,
  actorUuid: string,
): Promise<void> {
  const oldMentions = oldContent ? mentionService.parseMentions(oldContent) : [];
  const newMentions = mentionService.parseMentions(newContent);

  // Find only truly new mentions (not in old set)
  const oldKeys = new Set(oldMentions.map((m) => `${m.type}:${m.uuid}`));
  const brandNewMentions = newMentions.filter((m) => !oldKeys.has(`${m.type}:${m.uuid}`));

  if (brandNewMentions.length === 0) return;

  // Build content with only new mentions for createMentions to process
  // We pass the full new content and let createMentions handle it, but we
  // need to ensure only new mentions create records. We do this by calling
  // createMentions with full new content (it deduplicates internally) and
  // then the records are created. Since this is append-only, we only run
  // when there are truly new mentions detected above.
  await mentionService.createMentions({
    companyUuid,
    sourceType,
    sourceUuid,
    content: newContent,
    actorType,
    actorUuid,
    researchProjectUuid,
    entityTitle,
  });

  // Log activity for each new mention
  for (const mention of brandNewMentions) {
    if (mention.type === actorType && mention.uuid === actorUuid) continue;
    await activityService.createActivity({
      companyUuid,
      researchProjectUuid,
      targetType: sourceType,
      targetUuid: sourceUuid,
      actorType,
      actorUuid,
      action: "mentioned",
      value: {
        mentionedType: mention.type,
        mentionedUuid: mention.uuid,
        mentionedName: mention.displayName,
        sourceType,
        sourceUuid,
      },
    });
  }
}

// ===== Dependency Management =====

// DFS cycle detection: check if targetUuid is reachable from startUuid via existing edges
async function wouldCreateCycle(
  startUuid: string,
  targetUuid: string
): Promise<boolean> {
  // Get all dependency edges within the project
  const allDeps = await prisma.runDependency.findMany({
    select: { runUuid: true, dependsOnRunUuid: true },
  });

  // Build adjacency list: runUuid depends on dependsOnRunUuid
  // If adding edge: runUuid=targetUuid -> dependsOnRunUuid=startUuid
  // Need to check if startUuid can reach targetUuid via existing edges
  const adjacency = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!adjacency.has(dep.runUuid)) {
      adjacency.set(dep.runUuid, []);
    }
    adjacency.get(dep.runUuid)!.push(dep.dependsOnRunUuid);
  }

  // DFS from startUuid following existing edges (runUuid -> dependsOnRunUuid)
  const visited = new Set<string>();
  const stack = [startUuid];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetUuid) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

// Add run dependency
export async function addRunDependency(
  companyUuid: string,
  runUuid: string,
  dependsOnRunUuid: string
): Promise<{ runUuid: string; dependsOnRunUuid: string; createdAt: Date }> {
  // Cannot depend on itself
  if (runUuid === dependsOnRunUuid) {
    throw new Error("An experiment run cannot depend on itself");
  }

  // Verify both tasks exist and belong to the same project
  const [task, dependsOnTask] = await Promise.all([
    prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } }),
    prisma.experimentRun.findFirst({ where: { uuid: dependsOnRunUuid, companyUuid } }),
  ]);

  if (!task) throw new Error("ExperimentRun not found");
  if (!dependsOnTask) throw new Error("Dependency experiment run not found");

  if (task.researchProjectUuid !== dependsOnTask.researchProjectUuid) {
    throw new Error("Experiment runs must belong to the same project");
  }

  // Cycle detection: if adding the edge runUuid -> dependsOnRunUuid,
  // check if dependsOnRunUuid can reach runUuid via existing edges (forming a cycle)
  const cycleDetected = await wouldCreateCycle(dependsOnRunUuid, runUuid);
  if (cycleDetected) {
    throw new Error("Adding this dependency would create a cycle");
  }

  const dep = await prisma.runDependency.create({
    data: { runUuid, dependsOnRunUuid },
  });

  return { runUuid: dep.runUuid, dependsOnRunUuid: dep.dependsOnRunUuid, createdAt: dep.createdAt };
}

// Remove run dependency
export async function removeRunDependency(
  companyUuid: string,
  runUuid: string,
  dependsOnRunUuid: string
): Promise<void> {
  // Verify task belongs to this company
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  await prisma.runDependency.deleteMany({
    where: { runUuid, dependsOnRunUuid },
  });
}

// Get run dependencies
export async function getRunDependencies(
  companyUuid: string,
  runUuid: string
): Promise<{ dependsOn: RunDependencyInfo[]; dependedBy: RunDependencyInfo[] }> {
  const task = await prisma.experimentRun.findFirst({
    where: { uuid: runUuid, companyUuid },
    include: dependencyInclude,
  });

  if (!task) throw new Error("ExperimentRun not found");

  return {
    dependsOn: task.dependsOn.map((d: { dependsOnRun: { uuid: string; title: string; status: string } }) => ({
      uuid: d.dependsOnRun.uuid,
      title: d.dependsOnRun.title,
      status: d.dependsOnRun.status,
    })),
    dependedBy: task.dependedBy.map((d: { run: { uuid: string; title: string; status: string } }) => ({
      uuid: d.run.uuid,
      title: d.run.title,
      status: d.run.status,
    })),
  };
}

// Get unblocked experiment runs (all dependencies are resolved)
export async function getUnblockedExperimentRuns({
  companyUuid,
  researchProjectUuid,
  experimentDesignUuids,
}: {
  companyUuid: string;
  researchProjectUuid: string;
  experimentDesignUuids?: string[];
}): Promise<{ tasks: ExperimentRunResponse[]; total: number }> {
  const where = {
    researchProjectUuid,
    companyUuid,
    status: { in: ["open", "assigned"] },
    ...(experimentDesignUuids && experimentDesignUuids.length > 0 && { experimentDesignUuid: { in: experimentDesignUuids } }),
    // Exclude tasks that have any dependency NOT in done/closed
    NOT: {
      dependsOn: {
        some: {
          dependsOnRun: {
            status: { notIn: ["done", "closed"] },
          },
        },
      },
    },
  };

  const [rawTasks, total] = await Promise.all([
    prisma.experimentRun.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        computeBudgetHours: true,
        acceptanceCriteria: true,
        outcome: true,
        experimentResults: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        experimentDesignUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
        ...dependencyInclude,
      },
    }),
    prisma.experimentRun.count({ where }),
  ]);

  const commentCounts = await batchCommentCounts(
    companyUuid,
    "experiment_run",
    rawTasks.map((t) => t.uuid),
  );

  // Batch format: 2 queries total instead of N * (3-4)
  const tasks = await formatExperimentRunResponsesBatch(rawTasks, commentCounts);
  return { tasks, total };
}

// Blocker info for unresolved dependencies
export interface BlockerInfo {
  uuid: string;
  title: string;
  status: string;
  assignee: { type: string; uuid: string; name: string } | null;
  sessionCheckin: { sessionUuid: string; sessionName: string } | null;
}

// Check if all dependencies of a task are resolved (done or closed)
export async function checkDependenciesResolved(
  runUuid: string
): Promise<{ resolved: boolean; blockers: BlockerInfo[] }> {
  const deps = await prisma.runDependency.findMany({
    where: { runUuid },
    select: {
      dependsOnRun: {
        select: {
          uuid: true,
          title: true,
          status: true,
          assigneeType: true,
          assigneeUuid: true,
        },
      },
    },
  });

  if (deps.length === 0) {
    return { resolved: true, blockers: [] };
  }

  const unresolvedDeps = deps.filter(
    (d) => d.dependsOnRun.status !== "done" && d.dependsOnRun.status !== "closed"
  );

  if (unresolvedDeps.length === 0) {
    return { resolved: true, blockers: [] };
  }

  // Get assignee names and session checkins for unresolved deps
  const unresolvedUuids = unresolvedDeps.map((d) => d.dependsOnRun.uuid);

  const [checkins, actorNames] = await Promise.all([
    prisma.sessionRunCheckin.findMany({
      where: {
        runUuid: { in: unresolvedUuids },
        checkoutAt: null,
      },
      select: {
        runUuid: true,
        sessionUuid: true,
        session: { select: { name: true } },
      },
    }),
    batchGetActorNames(
      unresolvedDeps
        .filter((d) => d.dependsOnRun.assigneeType && d.dependsOnRun.assigneeUuid)
        .map((d) => ({ type: d.dependsOnRun.assigneeType!, uuid: d.dependsOnRun.assigneeUuid! }))
    ),
  ]);

  // Build checkin lookup by runUuid
  const checkinMap = new Map<string, { sessionUuid: string; sessionName: string }>();
  for (const c of checkins) {
    checkinMap.set(c.runUuid, { sessionUuid: c.sessionUuid, sessionName: c.session.name });
  }

  const blockers: BlockerInfo[] = unresolvedDeps.map((d) => {
    const task = d.dependsOnRun;
    let assignee: BlockerInfo["assignee"] = null;
    if (task.assigneeType && task.assigneeUuid) {
      const name = actorNames.get(task.assigneeUuid);
      if (name) {
        assignee = { type: task.assigneeType, uuid: task.assigneeUuid, name };
      }
    }

    return {
      uuid: task.uuid,
      title: task.title,
      status: task.status,
      assignee,
      sessionCheckin: checkinMap.get(task.uuid) ?? null,
    };
  });

  return { resolved: false, blockers };
}

// Get all run dependencies within a project (for DAG visualization)
export async function getProjectRunDependencies(
  companyUuid: string,
  researchProjectUuid: string
): Promise<{
  nodes: Array<{
    uuid: string;
    title: string;
    status: string;
    priority: string;
    experimentDesignUuid: string | null;
    goNoGoCriteria: Array<{
      metricName: string | null;
      threshold: number | null;
      operator: string | null;
      actualValue: number | null;
      required: boolean;
      isEarlyStop: boolean;
    }>;
  }>;
  edges: Array<{ from: string; to: string }>;
}> {
  const [tasks, dependencies] = await Promise.all([
    prisma.experimentRun.findMany({
      where: { companyUuid, researchProjectUuid },
      select: {
        uuid: true,
        title: true,
        status: true,
        priority: true,
        experimentDesignUuid: true,
        acceptanceCriteriaItems: {
          select: {
            metricName: true,
            threshold: true,
            operator: true,
            actualValue: true,
            required: true,
            isEarlyStop: true,
          },
        },
      },
    }),
    prisma.runDependency.findMany({
      where: {
        run: { companyUuid, researchProjectUuid },
      },
      select: { runUuid: true, dependsOnRunUuid: true },
    }),
  ]);

  return {
    nodes: tasks.map((t) => ({
      uuid: t.uuid,
      title: t.title,
      status: t.status,
      priority: t.priority,
      experimentDesignUuid: t.experimentDesignUuid ?? null,
      goNoGoCriteria: (t.acceptanceCriteriaItems ?? []).map((c) => ({
        metricName: c.metricName,
        threshold: c.threshold,
        operator: c.operator,
        actualValue: c.actualValue,
        required: c.required,
        isEarlyStop: c.isEarlyStop,
      })),
    })),
    edges: dependencies.map((d) => ({
      from: d.runUuid,
      to: d.dependsOnRunUuid,
    })),
  };
}

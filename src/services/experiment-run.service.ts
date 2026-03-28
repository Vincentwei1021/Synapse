// src/services/experiment-run.service.ts
// ExperimentRun service entrypoint. Read/query logic and side effects are
// split into focused modules, while this file keeps the public surface stable.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AlreadyClaimedError, NotClaimedError, isPrismaNotFound } from "@/lib/errors";
import {
  checkAcceptanceCriteriaGate,
  checkDependenciesResolved,
  formatExperimentRunResponse,
  getAcceptanceStatus,
  getExperimentRun,
  getExperimentRunByUuid,
  getProjectRunDependencies,
  getRunDependencies,
  getUnblockedExperimentRuns,
  listExperimentRuns,
} from "@/services/experiment-run-query.service";
import {
  emitExperimentRunChange,
  handleExperimentRunTerminalTransition,
  queueExperimentRunMentionProcessing,
} from "@/services/experiment-run-side-effects.service";
import {
  computeAcceptanceStatus,
  formatCriterionResponse,
  isValidExperimentRunStatusTransition,
  type AcceptanceCriterionResponse,
  type AcceptanceSummary,
  type BlockerInfo,
  type ExperimentRunClaimParams,
  type ExperimentRunCreateParams,
  type ExperimentRunListParams,
  type ExperimentRunResponse,
  type ExperimentRunUpdateParams,
  type RunDependencyInfo,
  EXPERIMENT_RUN_STATUS_TRANSITIONS,
} from "@/services/experiment-run.types";
import { releaseGpuReservationsForRun } from "@/services/compute.service";

export {
  checkAcceptanceCriteriaGate,
  checkDependenciesResolved,
  computeAcceptanceStatus,
  getAcceptanceStatus,
  getExperimentRun,
  getExperimentRunByUuid,
  getProjectRunDependencies,
  getRunDependencies,
  getUnblockedExperimentRuns,
  isValidExperimentRunStatusTransition,
  listExperimentRuns,
  EXPERIMENT_RUN_STATUS_TRANSITIONS,
};

export type {
  AcceptanceCriterionResponse,
  AcceptanceSummary,
  BlockerInfo,
  ExperimentRunClaimParams,
  ExperimentRunCreateParams,
  ExperimentRunListParams,
  ExperimentRunResponse,
  ExperimentRunUpdateParams,
  RunDependencyInfo,
};

export async function createExperimentRun(
  params: ExperimentRunCreateParams,
): Promise<ExperimentRunResponse> {
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

  emitExperimentRunChange({
    companyUuid: params.companyUuid,
    researchProjectUuid: params.researchProjectUuid,
    entityUuid: task.uuid,
    action: "created",
  });

  return formatExperimentRunResponse(task);
}

export async function updateExperimentRun(
  uuid: string,
  data: ExperimentRunUpdateParams,
  actorContext?: { actorType: string; actorUuid: string },
): Promise<ExperimentRunResponse> {
  let oldDescription: string | null = null;
  if (data.description !== undefined && actorContext) {
    const existing = await prisma.experimentRun.findUnique({
      where: { uuid },
      select: { description: true },
    });
    oldDescription = existing?.description ?? null;
  }

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
      const current = await tx.experimentRun.findUnique({
        where: { uuid },
        select: { status: true },
      });
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

  emitExperimentRunChange({
    companyUuid: task.companyUuid,
    researchProjectUuid: task.researchProject.uuid,
    entityUuid: task.uuid,
    action: "updated",
  });

  await handleExperimentRunTerminalTransition({
    companyUuid: task.companyUuid,
    researchProjectUuid: task.researchProject.uuid,
    runUuid: task.uuid,
    previousStatus,
    nextStatus: data.status,
    fallbackActorUuid: task.createdByUuid,
    actorContext,
  });

  queueExperimentRunMentionProcessing({
    companyUuid: task.companyUuid,
    researchProjectUuid: task.researchProject.uuid,
    runUuid: task.uuid,
    title: task.title,
    oldDescription,
    newDescription: data.description,
    actorContext,
  });

  return formatExperimentRunResponse(task);
}

export async function submitExperimentRunResults(
  companyUuid: string,
  runUuid: string,
  input: {
    outcome?: string | null;
    experimentResults?: unknown;
  },
  actorContext?: { actorType: string; actorUuid: string },
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

    emitExperimentRunChange({
      companyUuid,
      researchProjectUuid: task.researchProject.uuid,
      entityUuid: task.uuid,
      action: "updated",
    });

    return formatExperimentRunResponse(task);
  } catch (error: unknown) {
    if (isPrismaNotFound(error)) {
      throw new AlreadyClaimedError("ExperimentRun");
    }
    throw error;
  }
}

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

    emitExperimentRunChange({
      companyUuid: task.companyUuid,
      researchProjectUuid: task.researchProject.uuid,
      entityUuid: task.uuid,
      action: "updated",
    });

    return formatExperimentRunResponse(task);
  } catch (error: unknown) {
    if (isPrismaNotFound(error)) {
      throw new NotClaimedError("ExperimentRun");
    }
    throw error;
  }
}

export async function deleteExperimentRun(uuid: string) {
  const task = await prisma.experimentRun.delete({ where: { uuid } });
  emitExperimentRunChange({
    companyUuid: task.companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: task.uuid,
    action: "deleted",
  });
  return task;
}

export async function createExperimentRunsFromDesign(
  companyUuid: string,
  researchProjectUuid: string,
  experimentDesignUuid: string,
  createdByUuid: string,
  tasks: Array<{
    uuid?: string;
    title: string;
    description?: string;
    priority?: string;
    computeBudgetHours?: number;
    acceptanceCriteria?: string;
  }>,
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
    }),
  );

  const rawTasks = await Promise.all(createPromises);
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].uuid) {
      draftToTaskUuidMap.set(tasks[i].uuid!, rawTasks[i].uuid);
    }
  }

  const formattedTasks = await Promise.all(rawTasks.map(formatExperimentRunResponse));
  return { tasks: formattedTasks, draftToTaskUuidMap };
}

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
    }),
  );

  const created = await Promise.all(createPromises);
  return created.map(formatCriterionResponse);
}

export async function markAcceptanceCriteria(
  companyUuid: string,
  runUuid: string,
  criteria: Array<{ uuid: string; status: "passed" | "failed"; evidence?: string }>,
  auth: { type: string; actorUuid: string },
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  const validUuids = new Set(
    (await prisma.acceptanceCriterion.findMany({
      where: { runUuid },
      select: { uuid: true },
    })).map((row) => row.uuid),
  );
  for (const criterion of criteria) {
    if (!validUuids.has(criterion.uuid)) {
      throw new Error(`Criterion ${criterion.uuid} does not belong to task ${runUuid}`);
    }
  }

  for (const criterion of criteria) {
    await prisma.acceptanceCriterion.update({
      where: { uuid: criterion.uuid },
      data: {
        status: criterion.status,
        evidence: criterion.evidence ?? null,
        markedByType: auth.type,
        markedBy: auth.actorUuid,
        markedAt: new Date(),
      },
    });
  }

  emitExperimentRunChange({
    companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: runUuid,
    action: "updated",
  });

  return getAcceptanceStatus(companyUuid, runUuid);
}

export async function reportCriteriaSelfCheck(
  companyUuid: string,
  runUuid: string,
  criteria: Array<{ uuid: string; devStatus: "passed" | "failed"; devEvidence?: string }>,
  auth: { type: string; actorUuid: string },
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  const validUuids = new Set(
    (await prisma.acceptanceCriterion.findMany({
      where: { runUuid },
      select: { uuid: true },
    })).map((row) => row.uuid),
  );
  for (const criterion of criteria) {
    if (!validUuids.has(criterion.uuid)) {
      throw new Error(`Criterion ${criterion.uuid} does not belong to task ${runUuid}`);
    }
  }

  for (const criterion of criteria) {
    await prisma.acceptanceCriterion.update({
      where: { uuid: criterion.uuid },
      data: {
        devStatus: criterion.devStatus,
        devEvidence: criterion.devEvidence ?? null,
        devMarkedByType: auth.type,
        devMarkedBy: auth.actorUuid,
        devMarkedAt: new Date(),
      },
    });
  }

  emitExperimentRunChange({
    companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: runUuid,
    action: "updated",
  });

  return getAcceptanceStatus(companyUuid, runUuid);
}

export async function resetAcceptanceCriterion(
  companyUuid: string,
  runUuid: string,
  criterionUuid: string,
): Promise<void> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  const criterion = await prisma.acceptanceCriterion.findFirst({
    where: { uuid: criterionUuid, runUuid },
  });
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

  emitExperimentRunChange({
    companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: runUuid,
    action: "updated",
  });
}

async function wouldCreateCycle(startUuid: string, targetUuid: string): Promise<boolean> {
  const allDeps = await prisma.runDependency.findMany({
    select: { runUuid: true, dependsOnRunUuid: true },
  });

  const adjacency = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!adjacency.has(dep.runUuid)) {
      adjacency.set(dep.runUuid, []);
    }
    adjacency.get(dep.runUuid)!.push(dep.dependsOnRunUuid);
  }

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

export async function addRunDependency(
  companyUuid: string,
  runUuid: string,
  dependsOnRunUuid: string,
): Promise<{ runUuid: string; dependsOnRunUuid: string; createdAt: Date }> {
  if (runUuid === dependsOnRunUuid) {
    throw new Error("An experiment run cannot depend on itself");
  }

  const [task, dependsOnTask] = await Promise.all([
    prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } }),
    prisma.experimentRun.findFirst({ where: { uuid: dependsOnRunUuid, companyUuid } }),
  ]);

  if (!task) throw new Error("ExperimentRun not found");
  if (!dependsOnTask) throw new Error("Dependency experiment run not found");
  if (task.researchProjectUuid !== dependsOnTask.researchProjectUuid) {
    throw new Error("Experiment runs must belong to the same project");
  }

  const cycleDetected = await wouldCreateCycle(dependsOnRunUuid, runUuid);
  if (cycleDetected) {
    throw new Error("Adding this dependency would create a cycle");
  }

  const dep = await prisma.runDependency.create({
    data: { runUuid, dependsOnRunUuid },
  });

  return {
    runUuid: dep.runUuid,
    dependsOnRunUuid: dep.dependsOnRunUuid,
    createdAt: dep.createdAt,
  };
}

export async function removeRunDependency(
  companyUuid: string,
  runUuid: string,
  dependsOnRunUuid: string,
): Promise<void> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  await prisma.runDependency.deleteMany({
    where: { runUuid, dependsOnRunUuid },
  });
}

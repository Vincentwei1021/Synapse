import { prisma } from "@/lib/prisma";
import {
  batchFormatCreatedBy,
  batchGetActorNames,
  formatAssigneeComplete,
  formatCreatedBy,
} from "@/lib/uuid-resolver";
import { batchCommentCounts } from "@/services/comment.service";
import {
  BlockerInfo,
  computeAcceptanceStatus,
  dependencyInclude,
  ExperimentRunListParams,
  ExperimentRunResponse,
  formatCriterionResponse,
  RunDependencyInfo,
  type AcceptanceCriterionRecord,
} from "@/services/experiment-run.types";

type RawExperimentRun = {
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
  acceptanceCriteriaItems?: AcceptanceCriterionRecord[];
};

export async function formatExperimentRunResponse(
  task: RawExperimentRun,
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

async function formatExperimentRunResponsesBatch(
  tasks: RawExperimentRun[],
  commentCounts: Record<string, number>,
): Promise<ExperimentRunResponse[]> {
  if (tasks.length === 0) return [];

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

  const [actorNames, createdByMap] = await Promise.all([
    batchGetActorNames(actors),
    batchFormatCreatedBy(createdByUuids),
  ]);

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
      commentCount: commentCounts[task.uuid] ?? 0,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  });
}

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
    ...(experimentDesignUuids &&
      experimentDesignUuids.length > 0 && { experimentDesignUuid: { in: experimentDesignUuids } }),
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

  const commentCounts = await batchCommentCounts(
    companyUuid,
    "experiment_run",
    rawTasks.map((task) => task.uuid),
  );

  const tasks = await formatExperimentRunResponsesBatch(rawTasks, commentCounts);
  return { tasks, total };
}

export async function getExperimentRun(
  companyUuid: string,
  uuid: string,
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

export async function getExperimentRunByUuid(companyUuid: string, uuid: string) {
  return prisma.experimentRun.findFirst({
    where: { uuid, companyUuid },
  });
}

export async function getAcceptanceStatus(
  companyUuid: string,
  runUuid: string,
): Promise<{ items: ReturnType<typeof formatCriterionResponse>[]; status: string; summary: ReturnType<typeof computeAcceptanceStatus>["summary"] }> {
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

export async function checkAcceptanceCriteriaGate(
  runUuid: string,
): Promise<{
  allowed: boolean;
  reason?: string;
  summary?: ReturnType<typeof computeAcceptanceStatus>["summary"];
  unresolvedCriteria?: ReturnType<typeof formatCriterionResponse>[];
}> {
  const rows = await prisma.acceptanceCriterion.findMany({
    where: { runUuid },
    orderBy: { sortOrder: "asc" },
  });

  if (rows.length === 0) {
    return { allowed: true };
  }

  const requiredRows = rows.filter((row) => row.required);
  const allRequiredPassed = requiredRows.every((row) => row.status === "passed");

  if (allRequiredPassed) {
    return { allowed: true };
  }

  const { summary } = computeAcceptanceStatus(rows);
  const unresolvedCriteria = rows
    .filter((row) => row.required && row.status !== "passed")
    .map(formatCriterionResponse);

  return {
    allowed: false,
    reason: `Not all required acceptance criteria are passed. Required: ${summary.required}, Passed: ${summary.requiredPassed}, Failed: ${summary.requiredFailed}, Pending: ${summary.requiredPending}`,
    summary,
    unresolvedCriteria,
  };
}

export async function getRunDependencies(
  companyUuid: string,
  runUuid: string,
): Promise<{ dependsOn: RunDependencyInfo[]; dependedBy: RunDependencyInfo[] }> {
  const task = await prisma.experimentRun.findFirst({
    where: { uuid: runUuid, companyUuid },
    include: dependencyInclude,
  });

  if (!task) throw new Error("ExperimentRun not found");

  return {
    dependsOn: task.dependsOn.map((dependency) => ({
      uuid: dependency.dependsOnRun.uuid,
      title: dependency.dependsOnRun.title,
      status: dependency.dependsOnRun.status,
    })),
    dependedBy: task.dependedBy.map((dependency) => ({
      uuid: dependency.run.uuid,
      title: dependency.run.title,
      status: dependency.run.status,
    })),
  };
}

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
    ...(experimentDesignUuids &&
      experimentDesignUuids.length > 0 && { experimentDesignUuid: { in: experimentDesignUuids } }),
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
    rawTasks.map((task) => task.uuid),
  );

  const tasks = await formatExperimentRunResponsesBatch(rawTasks, commentCounts);
  return { tasks, total };
}

export async function checkDependenciesResolved(
  runUuid: string,
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
    (dependency) =>
      dependency.dependsOnRun.status !== "done" && dependency.dependsOnRun.status !== "closed",
  );

  if (unresolvedDeps.length === 0) {
    return { resolved: true, blockers: [] };
  }

  const unresolvedUuids = unresolvedDeps.map((dependency) => dependency.dependsOnRun.uuid);
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
        .filter((dependency) => dependency.dependsOnRun.assigneeType && dependency.dependsOnRun.assigneeUuid)
        .map((dependency) => ({
          type: dependency.dependsOnRun.assigneeType!,
          uuid: dependency.dependsOnRun.assigneeUuid!,
        })),
    ),
  ]);

  const checkinMap = new Map<string, { sessionUuid: string; sessionName: string }>();
  for (const checkin of checkins) {
    checkinMap.set(checkin.runUuid, {
      sessionUuid: checkin.sessionUuid,
      sessionName: checkin.session.name,
    });
  }

  const blockers: BlockerInfo[] = unresolvedDeps.map((dependency) => {
    const task = dependency.dependsOnRun;
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

export async function getProjectRunDependencies(
  companyUuid: string,
  researchProjectUuid: string,
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
    nodes: tasks.map((task) => ({
      uuid: task.uuid,
      title: task.title,
      status: task.status,
      priority: task.priority,
      experimentDesignUuid: task.experimentDesignUuid ?? null,
      goNoGoCriteria: (task.acceptanceCriteriaItems ?? []).map((criterion) => ({
        metricName: criterion.metricName,
        threshold: criterion.threshold,
        operator: criterion.operator,
        actualValue: criterion.actualValue,
        required: criterion.required,
        isEarlyStop: criterion.isEarlyStop,
      })),
    })),
    edges: dependencies.map((dependency) => ({
      from: dependency.runUuid,
      to: dependency.dependsOnRunUuid,
    })),
  };
}

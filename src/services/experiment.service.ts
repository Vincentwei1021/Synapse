import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { formatAssigneeComplete, formatCreatedBy } from "@/lib/uuid-resolver";
import { getActorName } from "@/lib/uuid-resolver";
import * as activityService from "@/services/activity.service";
import { createDocument, updateDocument } from "@/services/document.service";
import * as notificationService from "@/services/notification.service";

export type ExperimentStatus =
  | "draft"
  | "pending_review"
  | "pending_start"
  | "in_progress"
  | "completed";

export interface ExperimentAttachment {
  originalName: string;
  storedPath: string;
  mimeType: string;
  size: number;
}

export interface ExperimentResponse {
  uuid: string;
  researchProjectUuid: string;
  researchQuestionUuid: string | null;
  title: string;
  description: string | null;
  status: ExperimentStatus;
  priority: string;
  computeBudgetHours: number | null;
  computeUsedHours: number | null;
  outcome: string | null;
  results: unknown;
  attachments: ExperimentAttachment[] | null;
  baseBranch: string | null;
  experimentBranch: string | null;
  commitSha: string | null;
  liveStatus: string | null;
  liveMessage: string | null;
  liveUpdatedAt: string | null;
  assignee: {
    type: string;
    uuid: string;
    name: string;
    assignedAt: string | null;
    assignedBy: { type: string; uuid: string; name: string } | null;
  } | null;
  createdBy: { type: string; uuid: string; name: string } | null;
  reviewedByUuid: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  researchQuestion?: {
    uuid: string;
    title: string;
    parentQuestionUuid?: string | null;
  } | null;
  parentQuestionExperiments: Array<{
    uuid: string;
    title: string;
    status: ExperimentStatus;
    outcome: string | null;
    updatedAt: string;
  }>;
}

export interface ExperimentListParams {
  companyUuid: string;
  researchProjectUuid: string;
  status?: ExperimentStatus;
  skip: number;
  take: number;
}

export interface ExperimentCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  researchQuestionUuid?: string | null;
  title: string;
  description?: string | null;
  status?: ExperimentStatus;
  priority?: string;
  computeBudgetHours?: number | null;
  attachments?: ExperimentAttachment[] | null;
  baseBranch?: string | null;
  createdByUuid: string;
  createdByType?: "user" | "agent";
  assigneeUuid?: string;
  assigneeType?: "user" | "agent";
}

export type ExperimentPriority = "low" | "medium" | "high" | "immediate";

const VALID_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  draft: ["pending_review", "pending_start"],
  pending_review: ["draft", "pending_start"],
  pending_start: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
};

const EXPERIMENT_PRIORITY_ORDER: Record<ExperimentPriority, number> = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const EXPERIMENT_RESULT_DOCUMENT_TYPE = "experiment_result";

function jsonInput(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function normalizeExperimentPriority(priority?: string | null): ExperimentPriority {
  if (priority === "immediate" || priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "medium";
}

function queueSortTimestamp(item: { assignedAt?: Date | null; createdAt: Date }) {
  return item.assignedAt ?? item.createdAt;
}

function sortExperimentsByQueue<T extends { priority: string; assignedAt?: Date | null; createdAt: Date }>(items: T[]) {
  return [...items].sort((left, right) => {
    const priorityDelta =
      EXPERIMENT_PRIORITY_ORDER[normalizeExperimentPriority(left.priority)] -
      EXPERIMENT_PRIORITY_ORDER[normalizeExperimentPriority(right.priority)];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return queueSortTimestamp(left).getTime() - queueSortTimestamp(right).getTime();
  });
}

function buildExperimentDocumentMarker(experimentUuid: string) {
  return `<!-- synapse:experiment:${experimentUuid} -->`;
}

function buildExperimentDocumentTitle(title: string) {
  return `Experiment Result · ${title}`;
}

function formatExperimentDocumentContent(experiment: {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  outcome: string | null;
  computeBudgetHours: number | null;
  computeUsedHours: number | null;
  results: unknown;
  researchQuestion?: { title: string } | null;
}) {
  const marker = buildExperimentDocumentMarker(experiment.uuid);
  const lines = [
    marker,
    `# ${experiment.title}`,
    "",
    `- Status: ${experiment.status}`,
    `- Priority: ${normalizeExperimentPriority(experiment.priority)}`,
    `- Linked research question: ${experiment.researchQuestion?.title ?? "None"}`,
    `- Compute budget (hours): ${experiment.computeBudgetHours ?? "Unlimited"}`,
    `- Compute used (hours): ${experiment.computeUsedHours ?? "Not reported"}`,
    "",
    "## Description",
    "",
    experiment.description || "No description provided.",
    "",
    "## Outcome",
    "",
    experiment.outcome || "No outcome reported yet.",
  ];

  if (experiment.results !== null && experiment.results !== undefined) {
    lines.push("", "## Results", "", "```json", JSON.stringify(experiment.results, null, 2), "```");
  }

  return lines.join("\n");
}

async function syncExperimentResultDocument(input: {
  companyUuid: string;
  actorUuid: string;
  experiment: {
    uuid: string;
    researchProjectUuid: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    outcome: string | null;
    computeBudgetHours: number | null;
    computeUsedHours: number | null;
    results: unknown;
    researchQuestion?: { title: string } | null;
  };
}) {
  const marker = buildExperimentDocumentMarker(input.experiment.uuid);
  const title = buildExperimentDocumentTitle(input.experiment.title);
  const content = formatExperimentDocumentContent(input.experiment);

  const existing = await prisma.document.findFirst({
    where: {
      companyUuid: input.companyUuid,
      researchProjectUuid: input.experiment.researchProjectUuid,
      type: EXPERIMENT_RESULT_DOCUMENT_TYPE,
      content: {
        contains: marker,
      },
    },
    select: { uuid: true },
  });

  if (existing) {
    await updateDocument(existing.uuid, {
      title,
      content,
      incrementVersion: true,
    });
    return existing.uuid;
  }

  const document = await createDocument({
    companyUuid: input.companyUuid,
    researchProjectUuid: input.experiment.researchProjectUuid,
    type: EXPERIMENT_RESULT_DOCUMENT_TYPE,
    title,
    content,
    createdByUuid: input.actorUuid,
  });

  return document.uuid;
}

function assertTransition(from: ExperimentStatus, to: ExperimentStatus) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid experiment status transition: ${from} -> ${to}`);
  }
}

function canActOnAssignedExperiment(
  experiment: { assigneeType: string | null; assigneeUuid: string | null },
  actorType: string,
  actorUuid: string,
  ownerUuid?: string | null,
) {
  if (!experiment.assigneeType || !experiment.assigneeUuid) {
    return true;
  }

  if (experiment.assigneeType === actorType && experiment.assigneeUuid === actorUuid) {
    return true;
  }

  // Users can always act on agent-assigned experiments (human oversight)
  if (actorType === "user" && experiment.assigneeType === "agent") {
    return true;
  }

  return actorType === "agent" && experiment.assigneeType === "user" && ownerUuid === experiment.assigneeUuid;
}

function assertAssignedActorAccess(
  experiment: { assigneeType: string | null; assigneeUuid: string | null },
  actorType: string,
  actorUuid: string,
  action: "start" | "complete",
  ownerUuid?: string | null,
) {
  if (!canActOnAssignedExperiment(experiment, actorType, actorUuid, ownerUuid)) {
    throw new Error(`Only the assigned actor can ${action} this experiment`);
  }
}

async function formatExperiment(
  companyUuid: string,
  experiment: {
    uuid: string;
    researchProjectUuid: string;
    researchQuestionUuid: string | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    computeBudgetHours: number | null;
    computeUsedHours: number | null;
    outcome: string | null;
    results: unknown;
    attachments: unknown;
    baseBranch: string | null;
    experimentBranch: string | null;
    commitSha: string | null;
    liveStatus: string | null;
    liveMessage: string | null;
    liveUpdatedAt: Date | null;
    assigneeType: string | null;
    assigneeUuid: string | null;
    assignedAt: Date | null;
    assignedByUuid: string | null;
    createdByUuid: string;
    createdByType: string;
    reviewedByUuid: string | null;
    reviewNote: string | null;
    reviewedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    researchQuestion?: { uuid: string; title: string; parentQuestionUuid?: string | null } | null;
  }
): Promise<ExperimentResponse> {
  const [assignee, createdBy] = await Promise.all([
    formatAssigneeComplete(
      experiment.assigneeType,
      experiment.assigneeUuid,
      experiment.assignedAt,
      experiment.assignedByUuid,
    ),
    formatCreatedBy(experiment.createdByUuid, experiment.createdByType === "agent" ? "agent" : "user"),
  ]);

  const parentQuestionExperiments =
    experiment.researchQuestion?.parentQuestionUuid
      ? await prisma.experiment.findMany({
          where: {
            companyUuid,
            researchQuestionUuid: experiment.researchQuestion.parentQuestionUuid,
          },
          select: {
            uuid: true,
            title: true,
            status: true,
            outcome: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        })
      : [];

  return {
    uuid: experiment.uuid,
    researchProjectUuid: experiment.researchProjectUuid,
    researchQuestionUuid: experiment.researchQuestionUuid,
    title: experiment.title,
    description: experiment.description,
    status: experiment.status as ExperimentStatus,
    priority: experiment.priority,
    computeBudgetHours: experiment.computeBudgetHours,
    computeUsedHours: experiment.computeUsedHours,
    outcome: experiment.outcome,
    results: experiment.results ?? null,
    attachments: (experiment.attachments as ExperimentAttachment[] | null) ?? null,
    baseBranch: experiment.baseBranch,
    experimentBranch: experiment.experimentBranch,
    commitSha: experiment.commitSha,
    liveStatus: experiment.liveStatus,
    liveMessage: experiment.liveMessage,
    liveUpdatedAt: experiment.liveUpdatedAt?.toISOString() ?? null,
    assignee,
    createdBy,
    reviewedByUuid: experiment.reviewedByUuid,
    reviewNote: experiment.reviewNote,
    reviewedAt: experiment.reviewedAt?.toISOString() ?? null,
    startedAt: experiment.startedAt?.toISOString() ?? null,
    completedAt: experiment.completedAt?.toISOString() ?? null,
    createdAt: experiment.createdAt.toISOString(),
    updatedAt: experiment.updatedAt.toISOString(),
    researchQuestion: experiment.researchQuestion ?? null,
    parentQuestionExperiments: parentQuestionExperiments.map((item) => ({
      uuid: item.uuid,
      title: item.title,
      status: item.status as ExperimentStatus,
      outcome: item.outcome,
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

export async function updateExperimentLiveStatus(
  experimentUuid: string,
  liveStatus: string | null,
  liveMessage?: string | null,
) {
  const data: Record<string, unknown> = {
    liveStatus,
    liveUpdatedAt: new Date(),
  };
  if (liveMessage !== undefined) {
    data.liveMessage = liveMessage;
  }
  const experiment = await prisma.experiment.update({
    where: { uuid: experimentUuid },
    data,
    select: { researchProjectUuid: true, companyUuid: true },
  });

  eventBus.emitChange({
    companyUuid: experiment.companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    entityType: "experiment",
    entityUuid: experimentUuid,
    action: "updated",
  });
}

export async function listExperiments({
  companyUuid,
  researchProjectUuid,
  status,
  skip,
  take,
}: ExperimentListParams) {
  const where = {
    companyUuid,
    researchProjectUuid,
    ...(status ? { status } : {}),
  };

  const [experiments, total] = await Promise.all([
    prisma.experiment.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "asc" }],
      include: {
        researchQuestion: {
          select: { uuid: true, title: true, parentQuestionUuid: true },
        },
      },
    }),
    prisma.experiment.count({ where }),
  ]);

  return {
    experiments: await Promise.all(
      sortExperimentsByQueue(experiments).map((experiment) => formatExperiment(companyUuid, experiment)),
    ),
    total,
  };
}

export async function listAssignedExperiments(input: {
  companyUuid: string;
  assigneeUuid: string;
  assigneeType?: string;
  researchProjectUuid?: string;
  statuses?: ExperimentStatus[];
}) {
  const experiments = await prisma.experiment.findMany({
    where: {
      companyUuid: input.companyUuid,
      assigneeUuid: input.assigneeUuid,
      ...(input.assigneeType ? { assigneeType: input.assigneeType } : {}),
      ...(input.researchProjectUuid ? { researchProjectUuid: input.researchProjectUuid } : {}),
      ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
    },
    orderBy: [{ createdAt: "asc" }],
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  return Promise.all(sortExperimentsByQueue(experiments).map((experiment) => formatExperiment(input.companyUuid, experiment)));
}

export async function getExperiment(companyUuid: string, uuid: string) {
  const experiment = await prisma.experiment.findFirst({
    where: { companyUuid, uuid },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  if (!experiment) {
    return null;
  }

  return formatExperiment(companyUuid, experiment);
}

export async function createExperiment(params: ExperimentCreateParams) {
  const status =
    params.status ??
    (params.createdByType === "agent" ? "pending_review" : "pending_start");

  const experiment = await prisma.experiment.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      researchQuestionUuid: params.researchQuestionUuid ?? null,
      title: params.title,
      description: params.description ?? null,
      priority: normalizeExperimentPriority(params.priority),
      status,
      computeBudgetHours: params.computeBudgetHours ?? null,
      attachments: params.attachments ? (params.attachments as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      baseBranch: params.baseBranch ?? null,
      createdByUuid: params.createdByUuid,
      createdByType: params.createdByType ?? "user",
      ...(params.assigneeUuid ? { assigneeUuid: params.assigneeUuid, assigneeType: params.assigneeType ?? "agent" } : {}),
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  await activityService.createActivity({
    companyUuid: params.companyUuid,
    researchProjectUuid: params.researchProjectUuid,
    targetType: "experiment",
    targetUuid: experiment.uuid,
    actorType: params.createdByType ?? "user",
    actorUuid: params.createdByUuid,
    action: "created",
  });

  if (params.researchQuestionUuid) {
    await prisma.researchQuestion.update({
      where: { uuid: params.researchQuestionUuid },
      data: { status: "proposal_created" },
    });
  }

  eventBus.emitChange({
    companyUuid: params.companyUuid,
    researchProjectUuid: params.researchProjectUuid,
    entityType: "experiment",
    entityUuid: experiment.uuid,
    action: "created",
    actorUuid: params.createdByUuid,
  });

  return formatExperiment(params.companyUuid, experiment);
}

export async function updateExperiment(
  companyUuid: string,
  uuid: string,
  data: {
    title?: string;
    description?: string | null;
    researchQuestionUuid?: string | null;
    status?: ExperimentStatus;
    priority?: string;
    computeBudgetHours?: number | null;
    outcome?: string | null;
    results?: unknown;
    attachments?: ExperimentAttachment[] | null;
  },
  actor?: { actorType: string; actorUuid: string },
) {
  const existing =
    data.status !== undefined
      ? await prisma.experiment.findFirst({
          where: { uuid, companyUuid },
          select: { status: true },
        })
      : null;

  if (data.status !== undefined) {
    if (!existing) {
      throw new Error("Experiment not found");
    }
    assertTransition(existing.status as ExperimentStatus, data.status);
  }

  const experiment = await prisma.experiment.update({
    where: { uuid },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.researchQuestionUuid !== undefined ? { researchQuestionUuid: data.researchQuestionUuid } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.priority !== undefined ? { priority: normalizeExperimentPriority(data.priority) } : {}),
      ...(data.computeBudgetHours !== undefined ? { computeBudgetHours: data.computeBudgetHours } : {}),
      ...(data.outcome !== undefined ? { outcome: data.outcome } : {}),
      ...(data.results !== undefined ? { results: jsonInput(data.results) } : {}),
      ...(data.attachments !== undefined ? { attachments: jsonInput(data.attachments) } : {}),
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  if (data.researchQuestionUuid) {
    await prisma.researchQuestion.update({
      where: { uuid: data.researchQuestionUuid },
      data: { status: "proposal_created" },
    });
  }

  if (actor) {
    await activityService.createActivity({
      companyUuid,
      researchProjectUuid: experiment.researchProjectUuid,
      targetType: "experiment",
      targetUuid: experiment.uuid,
      actorType: actor.actorType,
      actorUuid: actor.actorUuid,
      action: "updated",
    });
  }

  eventBus.emitChange({
    companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    entityType: "experiment",
    entityUuid: experiment.uuid,
    action: "updated",
    actorUuid: actor?.actorUuid,
  });

  return formatExperiment(companyUuid, experiment);
}

export async function reviewExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  approved: boolean;
  reviewNote?: string | null;
  actorUuid: string;
}) {
  const existing = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid, companyUuid: input.companyUuid },
    include: { researchProject: { select: { name: true } } },
  });

  if (!existing) {
    throw new Error("Experiment not found");
  }

  assertTransition(existing.status as ExperimentStatus, input.approved ? "pending_start" : "draft");

  const updated = await prisma.experiment.update({
    where: { uuid: input.experimentUuid },
    data: {
      status: input.approved ? "pending_start" : "draft",
      reviewedByUuid: input.actorUuid,
      reviewNote: input.reviewNote ?? null,
      reviewedAt: new Date(),
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  await activityService.createActivity({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    targetType: "experiment",
    targetUuid: updated.uuid,
    actorType: "user",
    actorUuid: input.actorUuid,
    action: input.approved ? "approved" : "rejected",
    value: input.reviewNote ? { reviewNote: input.reviewNote } : undefined,
  });

  eventBus.emitChange({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    entityType: "experiment",
    entityUuid: updated.uuid,
    action: "updated",
    actorUuid: input.actorUuid,
  });

  // Check autonomous loop when experiment is rejected (queue may become empty)
  if (!input.approved) {
    await checkAutonomousLoopTrigger(updated.researchProjectUuid, input.companyUuid).catch(
      (err) => console.error("Autonomous loop trigger check failed:", err)
    );
  }

  return formatExperiment(input.companyUuid, updated);
}

export async function assignExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  assigneeType: string;
  assigneeUuid: string;
  assignedByUuid: string;
}) {
  const existing = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid, companyUuid: input.companyUuid },
    include: {
      researchProject: { select: { name: true } },
    },
  });

  if (!existing) {
    throw new Error("Experiment not found");
  }

  const updated = await prisma.experiment.update({
    where: { uuid: input.experimentUuid },
    data: {
      assigneeType: input.assigneeType,
      assigneeUuid: input.assigneeUuid,
      assignedAt: new Date(),
      assignedByUuid: input.assignedByUuid,
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  const actorName = await getActorName("user", input.assignedByUuid);

  await activityService.createActivity({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    targetType: "experiment",
    targetUuid: updated.uuid,
    actorType: "user",
    actorUuid: input.assignedByUuid,
    action: "assigned",
    value: { assigneeType: input.assigneeType, assigneeUuid: input.assigneeUuid },
  });

  await notificationService.create({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    recipientType: input.assigneeType,
    recipientUuid: input.assigneeUuid,
    entityType: "experiment",
    entityUuid: updated.uuid,
    entityTitle: updated.title,
    projectName: existing.researchProject.name,
    action: "task_assigned",
    message: `${updated.title} has been assigned to you.`,
    actorType: "user",
    actorUuid: input.assignedByUuid,
    actorName: actorName || "Unknown",
  });

  eventBus.emitChange({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    entityType: "experiment",
    entityUuid: updated.uuid,
    action: "updated",
    actorUuid: input.assignedByUuid,
  });

  await updateExperimentLiveStatus(input.experimentUuid, "sent");

  return formatExperiment(input.companyUuid, updated);
}

export async function startExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  actorType: string;
  actorUuid: string;
  ownerUuid?: string | null;
}) {
  const existing = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid, companyUuid: input.companyUuid },
    include: {
      researchQuestion: { select: { uuid: true } },
    },
  });

  if (!existing) {
    throw new Error("Experiment not found");
  }

  assertAssignedActorAccess(existing, input.actorType, input.actorUuid, "start", input.ownerUuid);
  assertTransition(existing.status as ExperimentStatus, "in_progress");

  const updated = await prisma.experiment.update({
    where: { uuid: input.experimentUuid },
    data: {
      status: "in_progress",
      startedAt: existing.startedAt ?? new Date(),
      assigneeType: existing.assigneeType ?? input.actorType,
      assigneeUuid: existing.assigneeUuid ?? input.actorUuid,
      assignedAt: existing.assignedAt ?? new Date(),
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  await activityService.createActivity({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    targetType: "experiment",
    targetUuid: updated.uuid,
    actorType: input.actorType,
    actorUuid: input.actorUuid,
    action: "status_changed",
    value: { status: "in_progress" },
  });

  // Template-based document generation removed — agents write their own reports on completion

  eventBus.emitChange({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    entityType: "experiment",
    entityUuid: updated.uuid,
    action: "updated",
    actorUuid: input.actorUuid,
  });

  return formatExperiment(input.companyUuid, updated);
}

/**
 * Check if the autonomous loop should trigger and send notification to the loop agent.
 * Mode 1 (human_review): trigger when draft=0, pending_review=0, pending_start=0
 * Mode 2 (full_auto): trigger when in_progress=0
 */
export async function checkAutonomousLoopTrigger(
  projectUuid: string,
  companyUuid: string
) {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid },
    select: {
      uuid: true,
      name: true,
      autonomousLoopEnabled: true,
      autonomousLoopAgentUuid: true,
      autonomousLoopMode: true,
    },
  });

  if (!project?.autonomousLoopEnabled || !project.autonomousLoopAgentUuid) {
    return;
  }

  const mode = project.autonomousLoopMode ?? "human_review";

  const statusCounts = await prisma.experiment.groupBy({
    by: ["status"],
    where: { researchProjectUuid: projectUuid, companyUuid },
    _count: true,
  });

  const countByStatus = (s: string) =>
    statusCounts.find((sc) => sc.status === s)?._count ?? 0;

  let shouldTrigger = false;

  if (mode === "human_review") {
    shouldTrigger =
      countByStatus("draft") === 0 &&
      countByStatus("pending_review") === 0 &&
      countByStatus("pending_start") === 0;
  } else if (mode === "full_auto") {
    shouldTrigger = countByStatus("in_progress") === 0;
  }

  if (shouldTrigger) {
    await notificationService.create({
      companyUuid,
      researchProjectUuid: project.uuid,
      recipientType: "agent",
      recipientUuid: project.autonomousLoopAgentUuid,
      entityType: "research_project",
      entityUuid: project.uuid,
      entityTitle: project.name,
      projectName: project.name,
      action: "autonomous_loop_triggered",
      message:
        mode === "full_auto"
          ? "No experiments running. Update the project synthesis with latest results, then propose next experiment for immediate execution."
          : "Experiment queue is empty. Analyze the project and propose next experiments.",
      actorType: "user",
      actorUuid: "system",
      actorName: "Synapse",
    });
  }
}

/**
 * Auto-maintain a "Experiment Results Log" document for the project.
 * Appends one CSV row per completed experiment: title, uuid, outcome, result summary.
 * Creates the document on first use.
 */
async function appendExperimentResultsLog(
  experiment: { uuid: string; title: string; outcome: string | null; results: unknown; researchProjectUuid: string; description: string | null; experimentBranch: string | null },
  companyUuid: string
) {
  const CSV_HEADER = "title\tuuid\toutcome\tbranch\tdescription\tresult_summary";
  const DOCUMENT_TYPE = "experiment_results_log";

  // Find or create the log document
  let doc = await prisma.document.findFirst({
    where: { researchProjectUuid: experiment.researchProjectUuid, companyUuid, type: DOCUMENT_TYPE },
  });

  const resultStr = experiment.results ? String(experiment.results) : "";
  // Extract first meaningful line of results (skip empty lines)
  const resultSummary = resultStr.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 1).join("").slice(0, 200);
  const descShort = (experiment.description ?? "").replace(/[\t\n\r]/g, " ").slice(0, 100);

  const newRow = `${experiment.title}\t${experiment.uuid}\t${experiment.outcome ?? "unknown"}\t${experiment.experimentBranch ?? "-"}\t${descShort}\t${resultSummary}`;

  if (doc) {
    // Append row
    const existingContent = doc.content ?? "";
    const updatedContent = existingContent.endsWith("\n")
      ? existingContent + newRow
      : existingContent + "\n" + newRow;
    await prisma.document.update({
      where: { uuid: doc.uuid },
      data: { content: updatedContent, updatedAt: new Date() },
    });
  } else {
    // Create the document with header + first row
    const project = await prisma.researchProject.findFirst({
      where: { uuid: experiment.researchProjectUuid, companyUuid },
      select: { name: true },
    });
    await prisma.document.create({
      data: {
        companyUuid,
        researchProjectUuid: experiment.researchProjectUuid,
        title: `${project?.name ?? "Project"} — Experiment Results Log`,
        type: DOCUMENT_TYPE,
        content: CSV_HEADER + "\n" + newRow,
        createdByUuid: "system",
        createdByType: "system",
      },
    });
  }
}

export async function completeExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  actorType: string;
  actorUuid: string;
  ownerUuid?: string | null;
  outcome?: string | null;
  results?: unknown;
  computeUsedHours?: number | null;
  experimentBranch?: string | null;
  commitSha?: string | null;
}) {
  const existing = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid, companyUuid: input.companyUuid },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  if (!existing) {
    throw new Error("Experiment not found");
  }

  assertAssignedActorAccess(existing, input.actorType, input.actorUuid, "complete", input.ownerUuid);
  assertTransition(existing.status as ExperimentStatus, "completed");

  const updated = await prisma.experiment.update({
    where: { uuid: input.experimentUuid },
    data: {
      status: "completed",
      outcome: input.outcome ?? null,
      results: jsonInput(input.results),
      computeUsedHours: input.computeUsedHours ?? existing.computeUsedHours,
      completedAt: new Date(),
      ...(input.experimentBranch !== undefined ? { experimentBranch: input.experimentBranch } : {}),
      ...(input.commitSha !== undefined ? { commitSha: input.commitSha } : {}),
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  await activityService.createActivity({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    targetType: "experiment",
    targetUuid: updated.uuid,
    actorType: input.actorType,
    actorUuid: input.actorUuid,
    action: "completed",
    value: { outcome: input.outcome ?? null },
  });

  // Trigger the completing agent to write its own experiment report document
  // (replaces template-based syncExperimentResultDocument)
  if (input.actorType === "agent") {
    try {
      const projectForReport = await prisma.researchProject.findFirst({
        where: { uuid: updated.researchProjectUuid, companyUuid: input.companyUuid },
        select: { name: true },
      });
      await notificationService.create({
        companyUuid: input.companyUuid,
        researchProjectUuid: updated.researchProjectUuid,
        recipientType: "agent",
        recipientUuid: input.actorUuid,
        entityType: "experiment",
        entityUuid: updated.uuid,
        entityTitle: updated.title,
        projectName: projectForReport?.name ?? "",
        action: "experiment_report_requested",
        message: `Write an experiment report document for "${updated.title}".`,
        actorType: "user",
        actorUuid: "system",
        actorName: "Synapse",
      });
    } catch (err) {
      console.error("Failed to trigger experiment report:", err);
    }
  }

  eventBus.emitChange({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    entityType: "experiment",
    entityUuid: updated.uuid,
    action: "updated",
    actorUuid: input.actorUuid,
  });

  // Append to results log document (auto-maintained experiment history)
  try {
    await appendExperimentResultsLog(updated, input.companyUuid);
  } catch (err) {
    console.error("Failed to append experiment results log:", err);
  }

  // In Mode 2, refresh project synthesis after every experiment completion
  try {
    const loopProject = await prisma.researchProject.findFirst({
      where: { uuid: updated.researchProjectUuid, companyUuid: input.companyUuid },
      select: { autonomousLoopEnabled: true, autonomousLoopMode: true },
    });
    if (loopProject?.autonomousLoopEnabled && loopProject.autonomousLoopMode === "full_auto") {
      const { refreshProjectSynthesis } = await import("@/services/project-synthesis.service");
      await refreshProjectSynthesis(updated.researchProjectUuid, input.companyUuid, input.actorUuid);
    }
  } catch (err) {
    console.error("Failed to refresh synthesis after Mode 2 experiment:", err);
  }

  // Check autonomous loop trigger
  await checkAutonomousLoopTrigger(updated.researchProjectUuid, input.companyUuid).catch(
    (err) => console.error("Autonomous loop trigger check failed:", err)
  );

  return formatExperiment(input.companyUuid, updated);
}

export async function deleteExperiment(companyUuid: string, experimentUuid: string) {
  await prisma.experiment.deleteMany({
    where: { uuid: experimentUuid, companyUuid },
  });
}

export async function getExperimentStats(companyUuid: string, researchProjectUuid: string) {
  const experiments = await prisma.experiment.groupBy({
    by: ["status"],
    where: { companyUuid, researchProjectUuid },
    _count: true,
  });

  const map = Object.fromEntries(experiments.map((item) => [item.status, item._count]));
  return {
    total: experiments.reduce((sum, item) => sum + item._count, 0),
    draft: map.draft || 0,
    pendingReview: map.pending_review || 0,
    pendingStart: map.pending_start || 0,
    inProgress: map.in_progress || 0,
    completed: map.completed || 0,
  };
}

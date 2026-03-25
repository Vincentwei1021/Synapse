import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { formatAssigneeComplete, formatCreatedBy } from "@/lib/uuid-resolver";
import { getActorName } from "@/lib/uuid-resolver";
import * as activityService from "@/services/activity.service";
import * as notificationService from "@/services/notification.service";
import { refreshProjectSynthesis } from "@/services/project-synthesis.service";

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
  priority?: string;
  computeBudgetHours?: number | null;
  attachments?: ExperimentAttachment[] | null;
  createdByUuid: string;
  createdByType?: "user" | "agent";
}

const VALID_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["draft", "pending_start"],
  pending_start: ["in_progress"],
  in_progress: ["completed"],
  completed: ["completed"],
};

function jsonInput(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function assertTransition(from: ExperimentStatus, to: ExperimentStatus) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid experiment status transition: ${from} -> ${to}`);
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
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        researchQuestion: {
          select: { uuid: true, title: true, parentQuestionUuid: true },
        },
      },
    }),
    prisma.experiment.count({ where }),
  ]);

  return {
    experiments: await Promise.all(experiments.map((experiment) => formatExperiment(companyUuid, experiment))),
    total,
  };
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
  const experiment = await prisma.experiment.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      researchQuestionUuid: params.researchQuestionUuid ?? null,
      title: params.title,
      description: params.description ?? null,
      priority: params.priority ?? "medium",
      computeBudgetHours: params.computeBudgetHours ?? null,
      attachments: params.attachments ? (params.attachments as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      createdByUuid: params.createdByUuid,
      createdByType: params.createdByType ?? "user",
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
      data: { status: "experiment_created" },
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
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
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

  return formatExperiment(input.companyUuid, updated);
}

export async function startExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  actorType: string;
  actorUuid: string;
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

export async function completeExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  actorType: string;
  actorUuid: string;
  outcome?: string | null;
  results?: unknown;
  computeUsedHours?: number | null;
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

  assertTransition(existing.status as ExperimentStatus, "completed");

  const updated = await prisma.experiment.update({
    where: { uuid: input.experimentUuid },
    data: {
      status: "completed",
      outcome: input.outcome ?? null,
      results: jsonInput(input.results),
      computeUsedHours: input.computeUsedHours ?? existing.computeUsedHours,
      completedAt: new Date(),
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

  await refreshProjectSynthesis(input.companyUuid, updated.researchProjectUuid, input.actorUuid);

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

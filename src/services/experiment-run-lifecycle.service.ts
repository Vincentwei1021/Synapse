import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AlreadyClaimedError, NotClaimedError, isPrismaNotFound } from "@/lib/errors";
import { formatExperimentRunResponse } from "@/services/experiment-run-query.service";
import {
  emitExperimentRunChange,
  handleExperimentRunTerminalTransition,
  queueExperimentRunMentionProcessing,
} from "@/services/experiment-run-side-effects.service";
import {
  ExperimentRunClaimParams,
  ExperimentRunCreateParams,
  ExperimentRunResponse,
  ExperimentRunUpdateParams,
} from "@/services/experiment-run.types";
import { releaseGpuReservationsForRun } from "@/services/compute.service";

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

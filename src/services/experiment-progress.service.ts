import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";

export async function createProgressLog(input: {
  companyUuid: string;
  experimentUuid: string;
  message: string;
  phase?: string;
  liveStatus?: string;
  actorUuid: string;
}) {
  const now = new Date();

  // Insert the log row and update the experiment's live state in a single
  // transaction so the card footer message, liveStatus badge, and progress
  // timeline stay consistent and we emit exactly one SSE event.
  const [log, experiment] = await prisma.$transaction([
    prisma.experimentProgressLog.create({
      data: {
        companyUuid: input.companyUuid,
        experimentUuid: input.experimentUuid,
        message: input.message,
        phase: input.phase ?? null,
        actorUuid: input.actorUuid,
        createdAt: now,
      },
    }),
    prisma.experiment.update({
      where: { uuid: input.experimentUuid },
      data: {
        ...(input.liveStatus !== undefined ? { liveStatus: input.liveStatus } : {}),
        liveMessage: input.message,
        liveUpdatedAt: now,
      },
      select: { researchProjectUuid: true, companyUuid: true },
    }),
  ]);

  eventBus.emitChange({
    companyUuid: experiment.companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    entityType: "experiment",
    entityUuid: input.experimentUuid,
    action: "updated",
    actorUuid: input.actorUuid,
  });

  return log;
}

export async function listProgressLogs(companyUuid: string, experimentUuid: string) {
  return prisma.experimentProgressLog.findMany({
    where: { companyUuid, experimentUuid },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      uuid: true,
      message: true,
      phase: true,
      actorUuid: true,
      createdAt: true,
    },
  });
}

import { prisma } from "@/lib/prisma";
import { updateExperimentLiveStatus } from "./experiment.service";

export async function createProgressLog(input: {
  companyUuid: string;
  experimentUuid: string;
  message: string;
  phase?: string;
  actorUuid: string;
}) {
  const log = await prisma.experimentProgressLog.create({
    data: {
      companyUuid: input.companyUuid,
      experimentUuid: input.experimentUuid,
      message: input.message,
      phase: input.phase ?? null,
      actorUuid: input.actorUuid,
    },
  });

  // Update experiment's live message for card display
  await updateExperimentLiveStatus(input.experimentUuid, "running", input.message);

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

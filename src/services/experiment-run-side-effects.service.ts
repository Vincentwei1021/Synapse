import { eventBus } from "@/lib/event-bus";
import { logger } from "@/lib/logger";
import { releaseGpuReservationsForRun } from "@/services/compute.service";
import { refreshProjectSynthesis } from "@/services/project-synthesis.service";
import * as activityService from "@/services/activity.service";
import * as mentionService from "@/services/mention.service";

const log = logger.child({ module: "experiment_run" });

export function emitExperimentRunChange(params: {
  companyUuid: string;
  researchProjectUuid: string;
  entityUuid: string;
  action: "created" | "updated" | "deleted";
}) {
  eventBus.emitChange({
    companyUuid: params.companyUuid,
    researchProjectUuid: params.researchProjectUuid,
    entityType: "experiment_run",
    entityUuid: params.entityUuid,
    action: params.action,
  });
}

export async function handleExperimentRunTerminalTransition(params: {
  companyUuid: string;
  researchProjectUuid: string;
  runUuid: string;
  previousStatus: string | null;
  nextStatus: string | undefined;
  fallbackActorUuid: string;
  actorContext?: { actorType: string; actorUuid: string };
}) {
  const terminalStatuses = new Set(["done", "closed"]);
  const enteredTerminalStatus =
    params.previousStatus !== null &&
    params.nextStatus !== undefined &&
    terminalStatuses.has(params.nextStatus) &&
    params.previousStatus !== params.nextStatus;

  if (!enteredTerminalStatus) {
    return;
  }

  await releaseGpuReservationsForRun(params.companyUuid, params.runUuid);
  await refreshProjectSynthesis(
    params.companyUuid,
    params.researchProjectUuid,
    params.actorContext?.actorUuid ?? params.fallbackActorUuid,
  );
}

export function queueExperimentRunMentionProcessing(params: {
  companyUuid: string;
  researchProjectUuid: string;
  runUuid: string;
  title: string;
  oldDescription: string | null;
  newDescription?: string | null;
  actorContext?: { actorType: string; actorUuid: string };
}) {
  if (!params.actorContext || !params.newDescription) {
    return;
  }

  processNewMentions(
    params.companyUuid,
    params.researchProjectUuid,
    "experiment_run",
    params.runUuid,
    params.title,
    params.oldDescription,
    params.newDescription,
    params.actorContext.actorType,
    params.actorContext.actorUuid,
  ).catch((err) => log.error({ err }, "failed to process mentions"));
}

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
  const oldKeys = new Set(oldMentions.map((mention) => `${mention.type}:${mention.uuid}`));
  const brandNewMentions = newMentions.filter(
    (mention) => !oldKeys.has(`${mention.type}:${mention.uuid}`),
  );

  if (brandNewMentions.length === 0) return;

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

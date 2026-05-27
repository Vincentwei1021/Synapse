// src/services/paper-feed.service.ts
// Paper Feeds Service Layer — enable/disable + run trigger.
// All operations scoped by companyUuid for multi-tenancy.

import { prisma } from "@/lib/prisma";
import { isRealtimeAgent } from "@/lib/agent-transport";
import * as notificationService from "@/services/notification.service";

// ===== Type Definitions =====

export interface EnablePaperFeedInput {
  companyUuid: string;
  researchProjectUuid: string;
  agentUuid: string;
}

export interface TriggerPaperFeedRunInput {
  companyUuid: string;
  researchProjectUuid: string;
  triggeredBy: "cron" | "manual";
  /** YYYY-MM-DD (UTC). Used as the unique key for idempotency. */
  feedDate: string;
}

// ===== Service Methods =====

/**
 * Enable Paper Feeds on a project. Validates that the chosen agent is
 * a realtime (OpenClaw) agent and carries the `paper_feeds` role.
 */
export async function enablePaperFeed(
  input: EnablePaperFeedInput
): Promise<void> {
  const agent = await prisma.agent.findFirst({
    where: { uuid: input.agentUuid, companyUuid: input.companyUuid },
    select: { type: true, roles: true },
  });
  if (!agent) {
    throw new Error("Agent not found");
  }
  if (!isRealtimeAgent(agent.type)) {
    throw new Error("Paper Feeds requires a realtime (OpenClaw) agent.");
  }
  if (!agent.roles.includes("paper_feeds")) {
    throw new Error("Selected agent is missing the paper_feeds role.");
  }

  await prisma.researchProject.update({
    where: { uuid: input.researchProjectUuid },
    data: {
      paperFeedEnabled: true,
      paperFeedAgentUuid: input.agentUuid,
    },
  });
}

/**
 * Disable Paper Feeds on a project. Leaves the configured agent uuid in place
 * so re-enabling later does not require re-selecting an agent.
 */
export async function disablePaperFeed(input: {
  companyUuid: string;
  researchProjectUuid: string;
}): Promise<void> {
  await prisma.researchProject.update({
    where: { uuid: input.researchProjectUuid },
    data: { paperFeedEnabled: false },
  });
}

/**
 * Trigger a Paper Feed run for a project on a given feedDate.
 * Idempotency rules per (researchProjectUuid, feedDate):
 *  - completed         → reuse, no notify.
 *  - pending | running → reuse, no notify.
 *  - failed            → reset row to pending and re-notify (Retry path).
 *  - none              → create new pending row and notify.
 */
export async function triggerPaperFeedRun(
  input: TriggerPaperFeedRunInput
): Promise<{ runUuid: string; reused: boolean }> {
  const project = await prisma.researchProject.findFirst({
    where: {
      uuid: input.researchProjectUuid,
      companyUuid: input.companyUuid,
    },
    select: { uuid: true, name: true, paperFeedAgentUuid: true },
  });
  if (!project) {
    throw new Error("Research Project not found");
  }
  if (!project.paperFeedAgentUuid) {
    throw new Error("No paper feed agent configured");
  }
  const agentUuid = project.paperFeedAgentUuid;

  const feedDate = new Date(`${input.feedDate}T00:00:00.000Z`);

  const existing = await prisma.paperFeedRun.findUnique({
    where: {
      researchProjectUuid_feedDate: {
        researchProjectUuid: input.researchProjectUuid,
        feedDate,
      },
    },
  });

  let runUuid: string;

  if (existing) {
    if (existing.status === "completed") {
      return { runUuid: existing.uuid, reused: true };
    }
    if (existing.status === "failed") {
      await prisma.paperFeedRun.update({
        where: { uuid: existing.uuid },
        data: {
          status: "pending",
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null,
          triggeredBy: input.triggeredBy,
          paperCount: 0,
        },
      });
      runUuid = existing.uuid;
    } else {
      // pending or running → reuse without re-notifying
      return { runUuid: existing.uuid, reused: true };
    }
  } else {
    const created = await prisma.paperFeedRun.create({
      data: {
        companyUuid: input.companyUuid,
        researchProjectUuid: input.researchProjectUuid,
        agentUuid,
        feedDate,
        status: "pending",
        triggeredBy: input.triggeredBy,
      },
    });
    runUuid = created.uuid;
  }

  // Mark feed as actively running on the project so the UI shows live status.
  await prisma.researchProject.update({
    where: { uuid: input.researchProjectUuid },
    data: {
      paperFeedActiveAgentUuid: agentUuid,
      paperFeedStartedAt: new Date(),
    },
  });

  await notificationService.create({
    companyUuid: input.companyUuid,
    researchProjectUuid: input.researchProjectUuid,
    recipientType: "agent",
    recipientUuid: agentUuid,
    entityType: "paper_feed_run",
    entityUuid: runUuid,
    entityTitle: project.name,
    projectName: project.name,
    action: "paper_feed_triggered",
    message: input.feedDate,
    // System-triggered notifications follow the existing convention used by
    // the autonomous loop and other Synapse-internal triggers: actorType
    // remains "user" and actorUuid is the literal "system" sentinel.
    actorType: "user",
    actorUuid: "system",
    actorName: input.triggeredBy === "cron" ? "Synapse cron" : "User",
  });

  return { runUuid, reused: false };
}

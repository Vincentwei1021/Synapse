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

export interface PaperFeedItemInput {
  paperId: string;
  title: string;
  authors: string;
  abstract: string;
  paperUrl: string;
  summary: string;
  relevanceNote: string;
  arxivId?: string;
}

/**
 * Stale-run reap threshold. A run still in `running` after this much time has
 * elapsed since `startedAt` is treated as crashed/disconnected and forced to
 * `failed` by `reapStalePaperFeedRuns`.
 */
const STALE_RUN_MS = 30 * 60 * 1000;

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

/**
 * Record a batch of feed items against an in-flight run.
 * Dedups by composite unique `(researchProjectUuid, paperId)`. The first call
 * for a `pending` run also transitions it to `running` so the UI reflects
 * progress while the agent continues writing items.
 */
export async function recordPaperFeedItems(input: {
  companyUuid: string;
  researchProjectUuid: string;
  feedRunUuid: string;
  items: PaperFeedItemInput[];
}): Promise<{ inserted: number; skipped: number }> {
  const run = await prisma.paperFeedRun.findUnique({
    where: { uuid: input.feedRunUuid },
    select: { feedDate: true, status: true },
  });
  if (!run) {
    throw new Error("Paper feed run not found");
  }

  let inserted = 0;
  let skipped = 0;

  for (const item of input.items) {
    const existing = await prisma.paperFeedItem.findUnique({
      where: {
        researchProjectUuid_paperId: {
          researchProjectUuid: input.researchProjectUuid,
          paperId: item.paperId,
        },
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.paperFeedItem.create({
      data: {
        companyUuid: input.companyUuid,
        researchProjectUuid: input.researchProjectUuid,
        feedRunUuid: input.feedRunUuid,
        feedDate: run.feedDate,
        paperId: item.paperId,
        arxivId: item.arxivId ?? item.paperId,
        title: item.title,
        authors: item.authors,
        abstract: item.abstract,
        paperUrl: item.paperUrl,
        summary: item.summary,
        relevanceNote: item.relevanceNote,
      },
    });
    inserted++;
  }

  if (run.status === "pending") {
    await prisma.paperFeedRun.update({
      where: { uuid: input.feedRunUuid },
      data: { status: "running" },
    });
  }

  return { inserted, skipped };
}

/**
 * Mark a paper feed run as completed or failed. Clears the project's
 * `paperFeedActive*` flags, stamps `paperFeedLastRunAt`, and notifies the
 * agent owner (if any) with the appropriate action.
 */
export async function completePaperFeedRun(input: {
  feedRunUuid: string;
  status: "completed" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const run = await prisma.paperFeedRun.findUnique({
    where: { uuid: input.feedRunUuid },
    select: {
      uuid: true,
      companyUuid: true,
      researchProjectUuid: true,
      agentUuid: true,
      feedDate: true,
    },
  });
  if (!run) {
    throw new Error("Paper feed run not found");
  }

  const paperCount = await prisma.paperFeedItem.count({
    where: { feedRunUuid: run.uuid },
  });

  await prisma.paperFeedRun.update({
    where: { uuid: run.uuid },
    data: {
      status: input.status,
      completedAt: new Date(),
      paperCount,
      errorMessage: input.status === "failed" ? input.errorMessage ?? null : null,
    },
  });

  await prisma.researchProject.update({
    where: { uuid: run.researchProjectUuid },
    data: {
      paperFeedActiveAgentUuid: null,
      paperFeedStartedAt: null,
      paperFeedLastRunAt: new Date(),
    },
  });

  const project = await prisma.researchProject.findUnique({
    where: { uuid: run.researchProjectUuid },
    select: { name: true },
  });
  const agent = await prisma.agent.findUnique({
    where: { uuid: run.agentUuid },
    select: { ownerUuid: true, name: true },
  });

  if (agent?.ownerUuid) {
    const feedDateStr = run.feedDate.toISOString().slice(0, 10);
    const message =
      input.status === "completed"
        ? `Paper Feed for ${feedDateStr} ready: ${paperCount} relevant papers.`
        : `Paper Feed for ${feedDateStr} failed${
            input.errorMessage ? `: ${input.errorMessage}` : "."
          }`;
    await notificationService.create({
      companyUuid: run.companyUuid,
      researchProjectUuid: run.researchProjectUuid,
      recipientType: "user",
      recipientUuid: agent.ownerUuid,
      entityType: "paper_feed_run",
      entityUuid: run.uuid,
      entityTitle: project?.name ?? "",
      projectName: project?.name ?? "",
      action:
        input.status === "completed"
          ? "paper_feed_completed"
          : "paper_feed_failed",
      message,
      actorType: "agent",
      actorUuid: run.agentUuid,
      actorName: agent.name ?? "Agent",
    });
  }
}

/**
 * Find runs stuck in `running` longer than `STALE_RUN_MS` and force them to
 * `failed` via `completePaperFeedRun`. Used by the cron tick to recover from
 * crashed agents or disconnected sessions.
 */
export async function reapStalePaperFeedRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const stale = await prisma.paperFeedRun.findMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    select: { uuid: true },
  });
  for (const row of stale) {
    await completePaperFeedRun({
      feedRunUuid: row.uuid,
      status: "failed",
      errorMessage: "timeout",
    });
  }
  return stale.length;
}

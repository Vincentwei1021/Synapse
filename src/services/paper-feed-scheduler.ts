import { prisma } from "@/lib/prisma";
import { triggerPaperFeedRun, reapStalePaperFeedRuns } from "@/services/paper-feed.service";

const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const TRIGGER_HOUR_UTC = Number(process.env.PAPER_FEEDS_TRIGGER_HOUR_UTC ?? "9");

interface SchedulerHandle {
  intervalId: ReturnType<typeof setInterval>;
}

const globalForScheduler = globalThis as unknown as {
  __paperFeedScheduler?: SchedulerHandle;
};

/**
 * UTC date the scheduler should be feeding right now (yesterday). Pulled into
 * its own helper so tests can verify behavior across day boundaries.
 */
export function currentFeedDate(now: Date = new Date()): string {
  const yesterday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
  ));
  return yesterday.toISOString().slice(0, 10);
}

/**
 * Run one tick of the scheduler. Reaps stale runs, then for every project that
 * has paper feeds enabled, fans out a triggerPaperFeedRun for yesterday's date.
 * Idempotency is guaranteed by the @@unique([researchProjectUuid, feedDate])
 * constraint and triggerPaperFeedRun's reuse semantics, so calling this every
 * 10 minutes is safe — only the first call after the trigger hour creates a
 * new run; subsequent calls reuse it.
 */
export async function tickPaperFeedScheduler(now: Date = new Date()): Promise<{
  triggered: number;
  skipped: number;
  reaped: number;
}> {
  const reaped = await reapStalePaperFeedRuns();

  // Wait until after the configured UTC trigger hour before firing the day's runs.
  // Without this gate the first tick of a fresh process would fire today's run
  // too early (e.g. 00:01 UTC, before HuggingFace has populated yesterday's list).
  if (now.getUTCHours() < TRIGGER_HOUR_UTC) {
    return { triggered: 0, skipped: 0, reaped };
  }

  const feedDate = currentFeedDate(now);
  const projects = await prisma.researchProject.findMany({
    where: { paperFeedEnabled: true, paperFeedAgentUuid: { not: null }, status: "active" },
    select: { uuid: true, companyUuid: true },
  });

  let triggered = 0;
  let skipped = 0;
  for (const p of projects) {
    const result = await triggerPaperFeedRun({
      companyUuid: p.companyUuid,
      researchProjectUuid: p.uuid,
      triggeredBy: "cron",
      feedDate,
    });
    if (result.reused) skipped++; else triggered++;
  }
  return { triggered, skipped, reaped };
}

/**
 * Start the in-process scheduler. Idempotent — calling twice (e.g. via Next.js
 * HMR) leaves the original interval in place. Reads PAPER_FEEDS_DISABLE_SCHEDULER
 * to skip startup in environments that don't want the in-process loop (e.g.
 * tests, build-time analyses).
 */
export function startPaperFeedScheduler(): void {
  if (process.env.PAPER_FEEDS_DISABLE_SCHEDULER === "1") return;
  if (globalForScheduler.__paperFeedScheduler) return;

  const intervalId = setInterval(() => {
    void tickPaperFeedScheduler().catch(() => {
      // Errors per-tick are swallowed so one bad tick doesn't kill the loop.
      // Per-tick failures still surface via individual run.errorMessage rows.
    });
  }, TICK_INTERVAL_MS);

  // Run a tick immediately so a freshly-booted process catches up on missed days.
  void tickPaperFeedScheduler().catch(() => {});

  // Don't keep the Node event loop alive purely for this interval (lets dev
  // server shut down cleanly). In production the interval is a small fraction
  // of an active server's load anyway.
  if (typeof intervalId.unref === "function") {
    intervalId.unref();
  }

  globalForScheduler.__paperFeedScheduler = { intervalId };
}

/** Stop the scheduler. Used by tests; not used in production code paths. */
export function stopPaperFeedScheduler(): void {
  const handle = globalForScheduler.__paperFeedScheduler;
  if (!handle) return;
  clearInterval(handle.intervalId);
  globalForScheduler.__paperFeedScheduler = undefined;
}

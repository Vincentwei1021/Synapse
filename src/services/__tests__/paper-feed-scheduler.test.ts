import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  researchProject: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockTriggerPaperFeedRun = vi.hoisted(() => vi.fn());
const mockReapStalePaperFeedRuns = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@/services/paper-feed.service", () => ({
  triggerPaperFeedRun: mockTriggerPaperFeedRun,
  reapStalePaperFeedRuns: mockReapStalePaperFeedRuns,
}));

import {
  tickPaperFeedScheduler,
  startPaperFeedScheduler,
  stopPaperFeedScheduler,
  currentFeedDate,
} from "@/services/paper-feed-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  stopPaperFeedScheduler();
});

afterEach(() => {
  stopPaperFeedScheduler();
});

describe("currentFeedDate", () => {
  it("returns yesterday in UTC YYYY-MM-DD", () => {
    const now = new Date("2026-05-27T12:00:00.000Z");
    expect(currentFeedDate(now)).toBe("2026-05-26");
  });

  it("rolls back across month boundaries", () => {
    const now = new Date("2026-06-01T05:00:00.000Z");
    expect(currentFeedDate(now)).toBe("2026-05-31");
  });
});

describe("tickPaperFeedScheduler", () => {
  it("does NOT fire runs before the trigger hour, but still reaps", async () => {
    mockReapStalePaperFeedRuns.mockResolvedValue(2);
    mockPrisma.researchProject.findMany.mockResolvedValue([
      { uuid: "p1", companyUuid: "c1" },
    ]);
    const before = new Date("2026-05-27T03:00:00.000Z");

    const result = await tickPaperFeedScheduler(before);

    expect(result.reaped).toBe(2);
    expect(result.triggered).toBe(0);
    expect(mockTriggerPaperFeedRun).not.toHaveBeenCalled();
  });

  it("fires one run per enabled project after the trigger hour", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([
      { uuid: "p1", companyUuid: "c1" },
      { uuid: "p2", companyUuid: "c1" },
    ]);
    mockTriggerPaperFeedRun.mockResolvedValue({ runUuid: "r", reused: false });
    const after = new Date("2026-05-27T09:30:00.000Z");

    const result = await tickPaperFeedScheduler(after);

    expect(result.triggered).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockTriggerPaperFeedRun).toHaveBeenCalledTimes(2);
    expect(mockTriggerPaperFeedRun).toHaveBeenCalledWith(expect.objectContaining({
      companyUuid: "c1",
      researchProjectUuid: "p1",
      triggeredBy: "cron",
      feedDate: "2026-05-26",
    }));
  });

  it("counts reused runs as skipped", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([
      { uuid: "p1", companyUuid: "c1" },
    ]);
    mockTriggerPaperFeedRun.mockResolvedValue({ runUuid: "r", reused: true });
    const after = new Date("2026-05-27T10:00:00.000Z");

    const result = await tickPaperFeedScheduler(after);

    expect(result.triggered).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("filters to enabled+agent-configured projects only", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([]);
    const after = new Date("2026-05-27T10:00:00.000Z");

    await tickPaperFeedScheduler(after);

    expect(mockPrisma.researchProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paperFeedEnabled: true, paperFeedAgentUuid: { not: null } },
      }),
    );
  });
});

describe("startPaperFeedScheduler", () => {
  it("is idempotent — calling twice creates only one interval", () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([]);
    startPaperFeedScheduler();
    const firstHandle = (globalThis as { __paperFeedScheduler?: unknown }).__paperFeedScheduler;
    startPaperFeedScheduler();
    const secondHandle = (globalThis as { __paperFeedScheduler?: unknown }).__paperFeedScheduler;
    expect(secondHandle).toBe(firstHandle);
  });

  it("respects PAPER_FEEDS_DISABLE_SCHEDULER=1", () => {
    vi.stubEnv("PAPER_FEEDS_DISABLE_SCHEDULER", "1");
    startPaperFeedScheduler();
    expect((globalThis as { __paperFeedScheduler?: unknown }).__paperFeedScheduler).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

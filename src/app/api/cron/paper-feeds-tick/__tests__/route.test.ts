import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SYNAPSE_CRON_TOKEN = "secret";
});

describe("POST /api/cron/paper-feeds-tick", () => {
  it("rejects without the token", async () => {
    const req = new Request("http://x/api/cron/paper-feeds-tick", { method: "POST" });
    const resp = await POST(req as never);
    expect(resp.status).toBe(401);
  });

  it("triggers one run per enabled project", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([
      { uuid: "p1", companyUuid: "c1" },
      { uuid: "p2", companyUuid: "c1" },
    ]);
    mockTriggerPaperFeedRun.mockResolvedValue({ runUuid: "r1", reused: false });

    const req = new Request("http://x/api/cron/paper-feeds-tick", {
      method: "POST",
      headers: { "X-Synapse-Cron-Token": "secret" },
    });
    const resp = await POST(req as never);
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.triggered).toBe(2);
    expect(body.skipped).toBe(0);
    expect(mockTriggerPaperFeedRun).toHaveBeenCalledTimes(2);
    // Verify it filters where paperFeedEnabled=true with non-null paperFeedAgentUuid
    expect(mockPrisma.researchProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paperFeedEnabled: true, paperFeedAgentUuid: { not: null }, status: "active" },
      }),
    );
  });

  it("does not trigger feeds for completed projects", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([]);

    const req = new Request("http://x/api/cron/paper-feeds-tick", {
      method: "POST",
      headers: { "X-Synapse-Cron-Token": "secret" },
    });
    await POST(req as never);

    expect(mockPrisma.researchProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          paperFeedEnabled: true,
          paperFeedAgentUuid: { not: null },
          status: "active",
        },
      }),
    );
  });

  it("counts reused runs as skipped (idempotency)", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([
      { uuid: "p1", companyUuid: "c1" },
    ]);
    mockTriggerPaperFeedRun.mockResolvedValue({ runUuid: "r1", reused: true });

    const req = new Request("http://x", {
      method: "POST",
      headers: { "X-Synapse-Cron-Token": "secret" },
    });
    const resp = await POST(req as never);
    const body = await resp.json();
    expect(body.triggered).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("calls reaper before fanout, returns reaped count", async () => {
    mockReapStalePaperFeedRuns.mockResolvedValue(3);
    mockPrisma.researchProject.findMany.mockResolvedValue([]);
    const req = new Request("http://x", {
      method: "POST",
      headers: { "X-Synapse-Cron-Token": "secret" },
    });
    const resp = await POST(req as never);
    const body = await resp.json();
    expect(body.reaped).toBe(3);
    expect(mockReapStalePaperFeedRuns).toHaveBeenCalledTimes(1);
  });
});

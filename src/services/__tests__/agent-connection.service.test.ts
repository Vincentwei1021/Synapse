import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: { findFirst: vi.fn(), findMany: vi.fn() },
  experiment: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { _resetRegistryForTest } from "@/lib/connection-registry";
import {
  recordHeartbeat,
  listOwnerConnections,
  countActiveExperimentsByAgent,
} from "@/services/agent-connection.service";

const companyUuid = "company-1";
const ownerUuid = "user-1";
const agentUuid = "agent-1";

beforeEach(() => {
  _resetRegistryForTest();
  vi.clearAllMocks();
});

describe("recordHeartbeat", () => {
  it("rejects an agent that does not belong to the company", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(null);
    await expect(
      recordHeartbeat({ companyUuid, agentUuid, host: "h", cwd: "/c", clientType: "openclaw" }),
    ).rejects.toThrow(/agent not found/i);
  });

  it("records a heartbeat for a valid agent", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: agentUuid, companyUuid });
    const res = await recordHeartbeat({
      companyUuid, agentUuid, host: "box-a", cwd: "/c", clientType: "openclaw", now: 1_000,
    });
    expect(res.connectionKey).toBe("agent-1::box-a::/c");
  });
});

describe("listOwnerConnections", () => {
  it("returns owner-scoped connections with live executions", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: agentUuid, companyUuid });
    await recordHeartbeat({
      companyUuid, agentUuid, host: "box-a", cwd: "/c", clientType: "openclaw", now: 1_000,
    });

    // agents owned by this user
    mockPrisma.agent.findMany.mockResolvedValue([
      { uuid: agentUuid, name: "Researcher", type: "openclaw" },
    ]);
    // running experiments assigned to the agent
    mockPrisma.experiment.findMany.mockResolvedValue([
      {
        uuid: "exp-1", title: "Run A", researchProjectUuid: "proj-1",
        liveStatus: "running", liveMessage: "epoch 3",
        liveUpdatedAt: new Date("2026-06-28T00:00:00Z"),
        assigneeUuid: agentUuid,
      },
    ]);

    const views = await listOwnerConnections({ companyUuid, ownerUuid, now: 1_500 });
    expect(views).toHaveLength(1);
    const v = views[0];
    expect(v.agentName).toBe("Researcher");
    expect(v.status).toBe("online");
    expect(v.executions).toHaveLength(1);
    expect(v.executions[0]).toMatchObject({
      experimentUuid: "exp-1", liveStatus: "running", liveMessage: "epoch 3",
    });
    // Prisma agent query was owner-scoped
    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyUuid, ownerUuid }) }),
    );
  });

  it("excludes connections whose agent is not owned by the user", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: "agent-x", companyUuid });
    await recordHeartbeat({
      companyUuid, agentUuid: "agent-x", host: "h", cwd: "/c", clientType: "openclaw", now: 1_000,
    });
    mockPrisma.agent.findMany.mockResolvedValue([]); // user owns no agents
    const views = await listOwnerConnections({ companyUuid, ownerUuid, now: 1_500 });
    expect(views).toHaveLength(0);
    expect(mockPrisma.experiment.findMany).not.toHaveBeenCalled();
  });

  it("marks a stale connection offline and still returns it", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: agentUuid, companyUuid });
    await recordHeartbeat({
      companyUuid, agentUuid, host: "box-a", cwd: "/c", clientType: "openclaw", now: 1_000,
    });
    mockPrisma.agent.findMany.mockResolvedValue([{ uuid: agentUuid, name: "R", type: "openclaw" }]);
    mockPrisma.experiment.findMany.mockResolvedValue([]);
    const views = await listOwnerConnections({ companyUuid, ownerUuid, now: 1_000 + 60_000 });
    expect(views[0].status).toBe("offline");
  });
});

describe("countActiveExperimentsByAgent", () => {
  it("returns a per-agent count of live experiments, company-scoped", async () => {
    mockPrisma.experiment.findMany.mockResolvedValue([
      { assigneeUuid: "agent-1" },
      { assigneeUuid: "agent-1" },
      { assigneeUuid: "agent-2" },
    ]);
    const map = await countActiveExperimentsByAgent("company-1", ["agent-1", "agent-2", "agent-3"]);
    expect(map.get("agent-1")).toBe(2);
    expect(map.get("agent-2")).toBe(1);
    expect(map.get("agent-3") ?? 0).toBe(0);
    expect(mockPrisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid: "company-1",
          assigneeType: "agent",
          assigneeUuid: { in: ["agent-1", "agent-2", "agent-3"] },
          liveStatus: { not: null },
        }),
      }),
    );
  });

  it("returns an empty map for no agents (no query)", async () => {
    mockPrisma.experiment.findMany.mockClear();
    const map = await countActiveExperimentsByAgent("company-1", []);
    expect(map.size).toBe(0);
    expect(mockPrisma.experiment.findMany).not.toHaveBeenCalled();
  });
});

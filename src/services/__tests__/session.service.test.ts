import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  agentSession: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  sessionRunCheckin: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  },
  experimentRun: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  agent: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/event-bus", () => ({
  eventBus: { emitChange: vi.fn() },
}));

vi.mock("@/services/experiment-run.service", () => ({
  claimExperimentRun: vi.fn(),
}));

import {
  createSession,
  getSession,
  closeSession,
  reopenSession,
  sessionCheckinToRun,
  sessionCheckoutFromRun,
  heartbeatSession,
  markInactiveSessions,
  batchGetWorkerCountsForRuns,
  getSessionName,
} from "@/services/session.service";
import { eventBus } from "@/lib/event-bus";
import { claimExperimentRun } from "@/services/experiment-run.service";

// ===== Helpers =====
const now = new Date("2026-03-13T00:00:00Z");
const companyUuid = "company-0000-0000-0000-000000000001";
const agentUuid = "agent-0000-0000-0000-000000000001";
const sessionUuid = "session-0000-0000-0000-000000000001";
const runUuid = "task-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    uuid: sessionUuid,
    companyUuid,
    agentUuid,
    name: "test-session",
    description: null,
    status: "active",
    lastActiveAt: now,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== createSession =====
describe("createSession", () => {
  it("should create a session and return formatted response", async () => {
    const session = makeSession();
    mockPrisma.agentSession.create.mockResolvedValue(session);

    const result = await createSession({
      companyUuid,
      agentUuid,
      name: "test-session",
    });

    expect(result.uuid).toBe(sessionUuid);
    expect(result.agentUuid).toBe(agentUuid);
    expect(result.name).toBe("test-session");
    expect(result.status).toBe("active");
    expect(result.checkins).toEqual([]);
    expect(result.lastActiveAt).toBe(now.toISOString());
    expect(mockPrisma.agentSession.create).toHaveBeenCalledOnce();
  });

  it("should pass description and expiresAt when provided", async () => {
    const expires = new Date("2026-04-01T00:00:00Z");
    const session = makeSession({ description: "desc", expiresAt: expires });
    mockPrisma.agentSession.create.mockResolvedValue(session);

    await createSession({
      companyUuid,
      agentUuid,
      name: "test-session",
      description: "desc",
      expiresAt: expires,
    });

    expect(mockPrisma.agentSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "desc",
          expiresAt: expires,
        }),
      })
    );
  });
});

// ===== getSession =====
describe("getSession", () => {
  it("should return formatted session with checkins", async () => {
    const session = makeSession({
      runCheckins: [
        { runUuid, checkinAt: now, checkoutAt: null },
      ],
    });
    mockPrisma.agentSession.findFirst.mockResolvedValue(session);

    const result = await getSession(companyUuid, sessionUuid);
    expect(result).not.toBeNull();
    expect(result!.checkins).toHaveLength(1);
    expect(result!.checkins[0].runUuid).toBe(runUuid);
    expect(result!.checkins[0].checkoutAt).toBeNull();
  });

  it("should return null when session not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(null);
    const result = await getSession(companyUuid, "nonexistent");
    expect(result).toBeNull();
  });
});

// ===== closeSession =====
describe("closeSession", () => {
  it("should close session and batch checkout active checkins", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([
      { run: { uuid: runUuid, researchProjectUuid } },
    ]);
    mockPrisma.sessionRunCheckin.updateMany.mockResolvedValue({ count: 1 });
    const closedSession = makeSession({
      status: "closed",
      runCheckins: [{ runUuid, checkinAt: now, checkoutAt: now }],
    });
    mockPrisma.agentSession.update.mockResolvedValue(closedSession);

    const result = await closeSession(companyUuid, sessionUuid);

    expect(result.status).toBe("closed");
    expect(mockPrisma.sessionRunCheckin.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionUuid, checkoutAt: null },
      })
    );
    expect(eventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityUuid: runUuid, action: "updated" })
    );
  });

  it("should throw when session not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(null);
    await expect(closeSession(companyUuid, "missing")).rejects.toThrow("Session not found");
  });
});

// ===== reopenSession =====
describe("reopenSession", () => {
  it("should reopen a closed session", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession({ status: "closed" }));
    const reopened = makeSession({ status: "active", runCheckins: [] });
    mockPrisma.agentSession.update.mockResolvedValue(reopened);

    const result = await reopenSession(companyUuid, sessionUuid);
    expect(result.status).toBe("active");
    expect(mockPrisma.agentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      })
    );
  });

  it("should throw when session not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(null);
    await expect(reopenSession(companyUuid, "missing")).rejects.toThrow("Session not found");
  });

  it("should throw when session is not closed", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession({ status: "active" }));
    await expect(reopenSession(companyUuid, sessionUuid)).rejects.toThrow("Only closed sessions can be reopened");
  });
});

// ===== sessionCheckinToRun =====
describe("sessionCheckinToRun", () => {
  it("should checkin to a task and return checkin info", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.experimentRun.findFirst.mockResolvedValue({
      uuid: runUuid,
      companyUuid,
      researchProjectUuid,
      assigneeUuid: agentUuid,
    });
    mockPrisma.sessionRunCheckin.upsert.mockResolvedValue({
      runUuid,
      checkinAt: now,
      checkoutAt: null,
    });
    mockPrisma.agentSession.update.mockResolvedValue(makeSession());

    const result = await sessionCheckinToRun(companyUuid, sessionUuid, runUuid);

    expect(result.runUuid).toBe(runUuid);
    expect(result.checkoutAt).toBeNull();
    expect(eventBus.emitChange).toHaveBeenCalled();
  });

  it("should auto-claim unassigned task", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.experimentRun.findFirst.mockResolvedValue({
      uuid: runUuid,
      companyUuid,
      researchProjectUuid,
      assigneeUuid: null,
    });
    mockPrisma.sessionRunCheckin.upsert.mockResolvedValue({
      runUuid,
      checkinAt: now,
      checkoutAt: null,
    });
    mockPrisma.agentSession.update.mockResolvedValue(makeSession());

    await sessionCheckinToRun(companyUuid, sessionUuid, runUuid);

    expect(claimExperimentRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runUuid,
        assigneeType: "agent",
        assigneeUuid: agentUuid,
      })
    );
  });

  it("should throw when session not found or not active", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(null);
    await expect(
      sessionCheckinToRun(companyUuid, sessionUuid, runUuid)
    ).rejects.toThrow("Session not found or not active");
  });

  it("should throw when task not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);
    await expect(
      sessionCheckinToRun(companyUuid, sessionUuid, runUuid)
    ).rejects.toThrow("Experiment run not found");
  });
});

// ===== sessionCheckoutFromRun =====
describe("sessionCheckoutFromRun", () => {
  it("should checkout from task and emit event", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.experimentRun.findFirst.mockResolvedValue({ researchProjectUuid });
    mockPrisma.sessionRunCheckin.updateMany.mockResolvedValue({ count: 1 });

    await sessionCheckoutFromRun(companyUuid, sessionUuid, runUuid);

    expect(mockPrisma.sessionRunCheckin.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionUuid, runUuid, checkoutAt: null },
      })
    );
    expect(eventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityUuid: runUuid })
    );
  });

  it("should throw when session not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(null);
    await expect(
      sessionCheckoutFromRun(companyUuid, sessionUuid, runUuid)
    ).rejects.toThrow("Session not found");
  });

  it("should not emit event when task not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);
    mockPrisma.sessionRunCheckin.updateMany.mockResolvedValue({ count: 0 });

    await sessionCheckoutFromRun(companyUuid, sessionUuid, runUuid);
    expect(eventBus.emitChange).not.toHaveBeenCalled();
  });
});

// ===== heartbeatSession =====
describe("heartbeatSession", () => {
  it("should update lastActiveAt", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession());
    mockPrisma.agentSession.update.mockResolvedValue(makeSession());

    await heartbeatSession(companyUuid, sessionUuid);

    expect(mockPrisma.agentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: sessionUuid },
        data: expect.objectContaining({ lastActiveAt: expect.any(Date) }),
      })
    );
  });

  it("should restore inactive session to active", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(makeSession({ status: "inactive" }));
    mockPrisma.agentSession.update.mockResolvedValue(makeSession({ status: "active" }));

    await heartbeatSession(companyUuid, sessionUuid);

    expect(mockPrisma.agentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      })
    );
  });

  it("should throw when session not found", async () => {
    mockPrisma.agentSession.findFirst.mockResolvedValue(null);
    await expect(heartbeatSession(companyUuid, "missing")).rejects.toThrow("Session not found");
  });
});

// ===== markInactiveSessions =====
describe("markInactiveSessions", () => {
  it("should mark stale active sessions as inactive", async () => {
    mockPrisma.agentSession.updateMany.mockResolvedValue({ count: 3 });

    const count = await markInactiveSessions();

    expect(count).toBe(3);
    expect(mockPrisma.agentSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active" }),
        data: { status: "inactive" },
      })
    );
  });
});

// ===== batchGetWorkerCountsForRuns =====
describe("batchGetWorkerCountsForRuns", () => {
  it("should return empty object for empty input", async () => {
    const result = await batchGetWorkerCountsForRuns(companyUuid, []);
    expect(result).toEqual({});
  });

  it("should return worker counts grouped by task", async () => {
    const task2 = "task-0000-0000-0000-000000000002";
    mockPrisma.sessionRunCheckin.groupBy.mockResolvedValue([
      { runUuid, _count: { runUuid: 2 } },
      { runUuid: task2, _count: { runUuid: 1 } },
    ]);

    const result = await batchGetWorkerCountsForRuns(companyUuid, [runUuid, task2]);
    expect(result[runUuid]).toBe(2);
    expect(result[task2]).toBe(1);
  });
});

// ===== getSessionName =====
describe("getSessionName", () => {
  it("should return session name", async () => {
    mockPrisma.agentSession.findUnique.mockResolvedValue({ name: "my-session" });
    const name = await getSessionName(sessionUuid);
    expect(name).toBe("my-session");
  });

  it("should return null when session not found", async () => {
    mockPrisma.agentSession.findUnique.mockResolvedValue(null);
    const name = await getSessionName("missing");
    expect(name).toBeNull();
  });
});

// ===== getSessionsForRun =====
describe("getSessionsForRun", () => {
  it("should return active sessions for a task", async () => {
    const { getSessionsForRun } = await import("@/services/session.service");

    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([
      {
        runUuid,
        checkinAt: now,
        session: {
          uuid: sessionUuid,
          name: "worker-1",
          agentUuid,
          agent: { name: "Agent 1" },
        },
      },
    ]);

    const result = await getSessionsForRun(companyUuid, runUuid);

    expect(result).toHaveLength(1);
    expect(result[0].sessionUuid).toBe(sessionUuid);
    expect(result[0].sessionName).toBe("worker-1");
    expect(result[0].agentUuid).toBe(agentUuid);
    expect(result[0].agentName).toBe("Agent 1");
  });

  it("should return empty array when no active sessions", async () => {
    const { getSessionsForRun } = await import("@/services/session.service");
    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([]);

    const result = await getSessionsForRun(companyUuid, runUuid);
    expect(result).toEqual([]);
  });
});

// ===== listAgentSessions =====
describe("listAgentSessions", () => {
  it("should list all sessions for an agent", async () => {
    const { listAgentSessions } = await import("@/services/session.service");

    mockPrisma.agentSession.findMany.mockResolvedValue([
      makeSession({ uuid: "s1", name: "session-1", runCheckins: [] }),
      makeSession({ uuid: "s2", name: "session-2", runCheckins: [] }),
    ]);

    const result = await listAgentSessions(companyUuid, agentUuid);

    expect(result).toHaveLength(2);
    expect(result[0].uuid).toBe("s1");
    expect(result[1].uuid).toBe("s2");
  });

  it("should filter by status when provided", async () => {
    const { listAgentSessions } = await import("@/services/session.service");
    mockPrisma.agentSession.findMany.mockResolvedValue([
      makeSession({ status: "closed", runCheckins: [] }),
    ]);

    await listAgentSessions(companyUuid, agentUuid, "closed");

    expect(mockPrisma.agentSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "closed" }),
      })
    );
  });
});

// ===== getActiveSessionsForProject =====
describe("getActiveSessionsForProject", () => {
  it("should return session-based workers (deduplicated by session)", async () => {
    const { getActiveSessionsForProject } = await import("@/services/session.service");

    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([
      {
        runUuid: "t1",
        checkinAt: now,
        session: {
          uuid: "s1",
          name: "worker-1",
          agentUuid: "a1",
          agent: { name: "Agent 1" },
        },
      },
      {
        runUuid: "t2",
        checkinAt: now,
        session: {
          uuid: "s1", // same session, should deduplicate
          name: "worker-1",
          agentUuid: "a1",
          agent: { name: "Agent 1" },
        },
      },
      {
        runUuid: "t3",
        checkinAt: now,
        session: {
          uuid: "s2",
          name: "worker-2",
          agentUuid: "a2",
          agent: { name: "Agent 2" },
        },
      },
    ]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    const result = await getActiveSessionsForProject(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(2); // deduplicated
    expect(result[0].sessionUuid).toBe("s1");
    expect(result[1].sessionUuid).toBe("s2");
  });

  it("should limit to 7 workers total", async () => {
    const { getActiveSessionsForProject } = await import("@/services/session.service");

    // Create 10 unique session checkins
    const checkins = Array.from({ length: 10 }, (_, i) => ({
      runUuid: `t${i}`,
      checkinAt: now,
      session: {
        uuid: `s${i}`,
        name: `worker-${i}`,
        agentUuid: `a${i}`,
        agent: { name: `Agent ${i}` },
      },
    }));

    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue(checkins);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    const result = await getActiveSessionsForProject(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(7); // max 7 workers
  });

  it("should include sessionless workers (agents with in_progress tasks without session)", async () => {
    const { getActiveSessionsForProject } = await import("@/services/session.service");

    // 2 session-based workers
    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([
      {
        runUuid: "t1",
        checkinAt: now,
        session: {
          uuid: "s1",
          name: "worker-1",
          agentUuid: "a1",
          agent: { name: "Agent 1" },
        },
      },
    ]);

    // 2 sessionless workers (in_progress tasks without session checkins)
    mockPrisma.experimentRun.findMany.mockResolvedValue([
      { uuid: "t2", assigneeUuid: "a2", updatedAt: now },
      { uuid: "t3", assigneeUuid: "a3", updatedAt: now },
    ]);

    mockPrisma.agent.findMany.mockResolvedValue([
      { uuid: "a2", name: "Agent 2" },
      { uuid: "a3", name: "Agent 3" },
    ]);

    const result = await getActiveSessionsForProject(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(3); // 1 session + 2 sessionless
    expect(result[0].sessionUuid).toBe("s1");
    expect(result[1].sessionUuid).toBe(""); // sessionless
    expect(result[1].agentUuid).toBe("a2");
    expect(result[2].sessionUuid).toBe("");
    expect(result[2].agentUuid).toBe("a3");
  });

  it("should deduplicate sessionless workers by agent UUID", async () => {
    const { getActiveSessionsForProject } = await import("@/services/session.service");

    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([]);

    // Same agent working on multiple tasks directly (no session)
    mockPrisma.experimentRun.findMany.mockResolvedValue([
      { uuid: "t1", assigneeUuid: "a1", updatedAt: now },
      { uuid: "t2", assigneeUuid: "a1", updatedAt: now },
      { uuid: "t3", assigneeUuid: "a2", updatedAt: now },
    ]);

    mockPrisma.agent.findMany.mockResolvedValue([
      { uuid: "a1", name: "Agent 1" },
      { uuid: "a2", name: "Agent 2" },
    ]);

    const result = await getActiveSessionsForProject(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(2); // deduplicated by agent
    expect(result[0].agentUuid).toBe("a1");
    expect(result[1].agentUuid).toBe("a2");
  });

  it("should exclude tasks with active session checkins from sessionless query", async () => {
    const { getActiveSessionsForProject } = await import("@/services/session.service");

    // t1 has active session checkin
    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([
      {
        runUuid: "t1",
        checkinAt: now,
        session: {
          uuid: "s1",
          name: "worker-1",
          agentUuid: "a1",
          agent: { name: "Agent 1" },
        },
      },
    ]);

    // Agent is also assigned to t1, but should be excluded from sessionless query
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    const result = await getActiveSessionsForProject(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(1);
    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          uuid: { notIn: ["t1"] }, // t1 excluded
        }),
      })
    );
  });

  it("should handle sessionless workers with missing agent names", async () => {
    const { getActiveSessionsForProject } = await import("@/services/session.service");

    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([
      { uuid: "t1", assigneeUuid: "a-unknown", updatedAt: now },
    ]);
    mockPrisma.agent.findMany.mockResolvedValue([]); // no matching agent

    const result = await getActiveSessionsForProject(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(0); // skipped due to missing agent name
  });
});

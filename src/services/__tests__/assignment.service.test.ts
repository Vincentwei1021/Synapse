import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  researchQuestion: {
    findMany: vi.fn(),
  },
  experimentRun: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockFormatAssignee = vi.fn();
const mockFormatCreatedBy = vi.fn();
vi.mock("@/lib/uuid-resolver", () => ({
  formatAssignee: (...args: unknown[]) => mockFormatAssignee(...args),
  formatCreatedBy: (...args: unknown[]) => mockFormatCreatedBy(...args),
}));

import { getMyAssignments, getAvailableItems } from "@/services/assignment.service";
import type { AuthContext } from "@/types/auth";

// ===== Helpers =====
const now = new Date("2026-03-13T00:00:00Z");
const companyUuid = "company-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";
const userUuid = "user-0000-0000-0000-000000000001";
const agentUuid = "agent-0000-0000-0000-000000000001";
const ownerUuid = "user-0000-0000-0000-000000000002";

function makeIdea(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "idea-0000-0000-0000-000000000001",
    title: "Test Idea",
    content: "Idea content",
    status: "claimed",
    assigneeType: "user",
    assigneeUuid: userUuid,
    assignedAt: now,
    project: { uuid: researchProjectUuid, name: "Test Project" },
    createdAt: now,
    updatedAt: now,
    createdByUuid: userUuid,
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "task-0000-0000-0000-000000000001",
    title: "Test Task",
    description: "Task description",
    status: "assigned",
    priority: "high",
    assigneeType: "user",
    assigneeUuid: userUuid,
    assignedAt: now,
    project: { uuid: researchProjectUuid, name: "Test Project" },
    createdAt: now,
    updatedAt: now,
    createdByUuid: userUuid,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFormatAssignee.mockResolvedValue({
    type: "user",
    uuid: userUuid,
    name: "Test User",
  });
  mockFormatCreatedBy.mockResolvedValue({
    type: "user",
    uuid: userUuid,
    name: "Test User",
  });
});

// ===== getMyAssignments =====
describe("getMyAssignments", () => {
  it("should return user's claimed ideas and tasks", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    const idea = makeIdea();
    const task = makeTask();

    mockPrisma.researchQuestion.findMany.mockResolvedValue([idea]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([task]);

    const result = await getMyAssignments(userAuth);

    expect(result.researchQuestions).toHaveLength(1);
    expect(result.experimentRuns).toHaveLength(1);
    expect(result.researchQuestions[0].uuid).toBe(idea.uuid);
    expect(result.experimentRuns[0].uuid).toBe(task.uuid);
  });

  it("should query with user assignment condition", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          OR: [{ assigneeType: "user", assigneeUuid: userUuid }],
          status: { notIn: ["completed", "closed"] },
        }),
      })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          OR: [{ assigneeType: "user", assigneeUuid: userUuid }],
          status: { notIn: ["done", "closed"] },
        }),
      })
    );
  });

  it("should query with agent assignment conditions (agent + owner)", async () => {
    const agentAuth: AuthContext = {
      type: "agent",
      companyUuid,
      actorUuid: agentUuid,
      roles: ["researcher_agent"],
      ownerUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(agentAuth);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          OR: [
            { assigneeType: "agent", assigneeUuid: agentUuid },
            { assigneeType: "user", assigneeUuid: ownerUuid },
          ],
        }),
      })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          OR: [
            { assigneeType: "agent", assigneeUuid: agentUuid },
            { assigneeType: "user", assigneeUuid: ownerUuid },
          ],
        }),
      })
    );
  });

  it("should exclude completed ideas and done tasks", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["completed", "closed"] },
        }),
      })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["done", "closed"] },
        }),
      })
    );
  });

  it("should format ideas with assignee info", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    const idea = makeIdea();
    mockPrisma.researchQuestion.findMany.mockResolvedValue([idea]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    mockFormatAssignee.mockResolvedValue({
      type: "user",
      uuid: userUuid,
      name: "John Doe",
    });

    const result = await getMyAssignments(userAuth);

    expect(result.researchQuestions[0].assignee).toEqual({
      type: "user",
      uuid: userUuid,
      name: "John Doe",
    });
    expect(mockFormatAssignee).toHaveBeenCalledWith("user", userUuid);
  });

  it("should format tasks with assignee info", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    const task = makeTask();
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([task]);

    mockFormatAssignee.mockResolvedValue({
      type: "agent",
      uuid: agentUuid,
      name: "Bot Agent",
    });

    const result = await getMyAssignments(userAuth);

    expect(result.experimentRuns[0].assignee).toEqual({
      type: "agent",
      uuid: agentUuid,
      name: "Bot Agent",
    });
  });

  it("should return ISO date strings for timestamps", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    const idea = makeIdea();
    const task = makeTask();
    mockPrisma.researchQuestion.findMany.mockResolvedValue([idea]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([task]);

    const result = await getMyAssignments(userAuth);

    expect(result.researchQuestions[0].createdAt).toBe(now.toISOString());
    expect(result.researchQuestions[0].assignedAt).toBe(now.toISOString());
    expect(result.experimentRuns[0].createdAt).toBe(now.toISOString());
    expect(result.experimentRuns[0].assignedAt).toBe(now.toISOString());
  });

  it("should order ideas by assignedAt desc", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { assignedAt: "desc" },
      })
    );
  });

  it("should order tasks by priority desc, then assignedAt desc", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth);

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ priority: "desc" }, { assignedAt: "desc" }],
      })
    );
  });

  it("should filter by projectUuids when provided", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth, [researchProjectUuid]);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          researchProjectUuid: { in: [researchProjectUuid] },
          OR: [{ assigneeType: "user", assigneeUuid: userUuid }],
        }),
      })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          researchProjectUuid: { in: [researchProjectUuid] },
          OR: [{ assigneeType: "user", assigneeUuid: userUuid }],
        }),
      })
    );
  });

  it("should not filter by projectUuids when not provided", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth);

    const ideaWhere = mockPrisma.researchQuestion.findMany.mock.calls[0][0].where;
    const taskWhere = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;

    expect(ideaWhere).not.toHaveProperty("researchProjectUuid");
    expect(taskWhere).not.toHaveProperty("researchProjectUuid");
  });

  it("should filter by multiple projectUuids", async () => {
    const userAuth: AuthContext = {
      type: "user",
      companyUuid,
      actorUuid: userUuid,
    };

    const researchProjectUuid2 = "project-0000-0000-0000-000000000002";

    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getMyAssignments(userAuth, [researchProjectUuid, researchProjectUuid2]);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          researchProjectUuid: { in: [researchProjectUuid, researchProjectUuid2] },
          OR: [{ assigneeType: "user", assigneeUuid: userUuid }],
        }),
      })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          researchProjectUuid: { in: [researchProjectUuid, researchProjectUuid2] },
          OR: [{ assigneeType: "user", assigneeUuid: userUuid }],
        }),
      })
    );
  });
});

// ===== getAvailableItems =====
describe("getAvailableItems", () => {
  it("should return available ideas and tasks when both allowed", async () => {
    const idea = makeIdea({ status: "open", assigneeType: null, assigneeUuid: null });
    const task = makeTask({ status: "open", assigneeType: null, assigneeUuid: null });

    mockPrisma.researchQuestion.findMany.mockResolvedValue([idea]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([task]);

    const result = await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(result.researchQuestions).toHaveLength(1);
    expect(result.experimentRuns).toHaveLength(1);
  });

  it("should return empty ideas when canClaimIdeas is false", async () => {
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([makeTask({ status: "open" })]);

    const result = await getAvailableItems(companyUuid, researchProjectUuid, false, true);

    expect(result.researchQuestions).toEqual([]);
    expect(result.experimentRuns).toHaveLength(1);
  });

  it("should return empty tasks when canClaimTasks is false", async () => {
    mockPrisma.researchQuestion.findMany.mockResolvedValue([makeIdea({ status: "open" })]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    const result = await getAvailableItems(companyUuid, researchProjectUuid, true, false);

    expect(result.researchQuestions).toHaveLength(1);
    expect(result.experimentRuns).toEqual([]);
  });

  it("should filter by open status only", async () => {
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          researchProjectUuid,
          companyUuid,
          status: "open",
        }),
      })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          researchProjectUuid,
          companyUuid,
          status: "open",
        }),
      })
    );
  });

  it("should limit results to 50 items", async () => {
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it("should format ideas with createdBy info", async () => {
    const idea = makeIdea({ status: "open" });
    mockPrisma.researchQuestion.findMany.mockResolvedValue([idea]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    mockFormatCreatedBy.mockResolvedValue({
      type: "user",
      uuid: userUuid,
      name: "Alice",
    });

    const result = await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(result.researchQuestions[0].createdBy).toEqual({
      type: "user",
      uuid: userUuid,
      name: "Alice",
    });
    expect(mockFormatCreatedBy).toHaveBeenCalledWith(userUuid);
  });

  it("should format tasks with createdBy info", async () => {
    const task = makeTask({ status: "open" });
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([task]);

    mockFormatCreatedBy.mockResolvedValue({
      type: "agent",
      uuid: agentUuid,
      name: "PM Agent",
    });

    const result = await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(result.experimentRuns[0].createdBy).toEqual({
      type: "agent",
      uuid: agentUuid,
      name: "PM Agent",
    });
  });

  it("should return ISO date strings for createdAt", async () => {
    const idea = makeIdea({ status: "open" });
    const task = makeTask({ status: "open" });
    mockPrisma.researchQuestion.findMany.mockResolvedValue([idea]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([task]);

    const result = await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(result.researchQuestions[0].createdAt).toBe(now.toISOString());
    expect(result.experimentRuns[0].createdAt).toBe(now.toISOString());
  });

  it("should order ideas by createdAt desc", async () => {
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(mockPrisma.researchQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("should order tasks by priority desc, then createdAt desc", async () => {
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);

    await getAvailableItems(companyUuid, researchProjectUuid, true, true);

    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      })
    );
  });

  it("should return both empty arrays when nothing allowed", async () => {
    const result = await getAvailableItems(companyUuid, researchProjectUuid, false, false);

    expect(result.researchQuestions).toEqual([]);
    expect(result.experimentRuns).toEqual([]);
    expect(mockPrisma.researchQuestion.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.experimentRun.findMany).not.toHaveBeenCalled();
  });
});

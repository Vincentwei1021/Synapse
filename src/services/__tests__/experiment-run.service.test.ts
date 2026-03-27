import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  makeTask,
  makeAcceptanceCriterion,
  authContexts,
  resetFixtureCounter,
} from "@/__test-utils__/fixtures";

// ===== Module mocks (hoisted) =====

const mockPrisma = vi.hoisted(() => {
  const txProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        // Return the same mock objects as the top-level prisma mock
        // so that transaction callbacks use the same mocked methods
        return (mockPrisma as Record<string, unknown>)[prop as string];
      },
    },
  );

  return {
    experimentRun: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    comment: {
      count: vi.fn(),
    },
    acceptanceCriterion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    runDependency: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    sessionRunCheckin: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txProxy)),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockEventBus = vi.hoisted(() => ({
  emitChange: vi.fn(),
}));
vi.mock("@/lib/event-bus", () => ({ eventBus: mockEventBus }));

const mockUuidResolver = vi.hoisted(() => ({
  formatAssigneeComplete: vi.fn().mockResolvedValue(null),
  formatCreatedBy: vi.fn().mockResolvedValue({ type: "user", uuid: "u1", name: "Test User" }),
  batchGetActorNames: vi.fn().mockResolvedValue(new Map()),
  batchFormatCreatedBy: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/uuid-resolver", () => mockUuidResolver);

const mockCommentService = vi.hoisted(() => ({
  batchCommentCounts: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/services/comment.service", () => mockCommentService);

const mockMentionService = vi.hoisted(() => ({
  parseMentions: vi.fn().mockReturnValue([]),
  createMentions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/mention.service", () => mockMentionService);

const mockActivityService = vi.hoisted(() => ({
  createActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/activity.service", () => mockActivityService);

const mockComputeService = vi.hoisted(() => ({
  releaseGpuReservationsForRun: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/compute.service", () => mockComputeService);

const mockProjectSynthesisService = vi.hoisted(() => ({
  refreshProjectSynthesis: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/project-synthesis.service", () => mockProjectSynthesisService);

// ===== Import under test (after mocks) =====

import {
  listExperimentRuns,
  getExperimentRun,
  createExperimentRun,
  claimExperimentRun,
  releaseExperimentRun,
  deleteExperimentRun,
  updateExperimentRun,
  markAcceptanceCriteria,
  reportCriteriaSelfCheck,
  checkAcceptanceCriteriaGate,
  createAcceptanceCriteria,
} from "@/services/experiment-run.service";
import { AlreadyClaimedError, NotClaimedError } from "@/lib/errors";

// ===== Helpers =====

const COMPANY_UUID = authContexts.user.companyUuid;
const PROJECT_UUID = "00000000-0000-0000-0000-000000000010";
const RUN_UUID = "00000000-0000-0000-0000-000000000099";

function rawTask(overrides: Record<string, unknown> = {}) {
  return makeTask({
    uuid: RUN_UUID,
    companyUuid: COMPANY_UUID,
    researchProjectUuid: PROJECT_UUID,
    ...overrides,
  });
}

function rawTaskWithRelations(overrides: Record<string, unknown> = {}) {
  return {
    ...rawTask(overrides),
    researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    dependsOn: [],
    dependedBy: [],
    acceptanceCriteriaItems: [],
  };
}

// ===== Tests =====

beforeEach(() => {
  vi.clearAllMocks();
  resetFixtureCounter();
});

// ---------- listExperimentRuns ----------

describe("listExperimentRuns", () => {
  it("returns paginated tasks with total count", async () => {
    const task1 = rawTask({ uuid: "t1" });
    const task2 = rawTask({ uuid: "t2" });
    mockPrisma.experimentRun.findMany.mockResolvedValue([task1, task2]);
    mockPrisma.experimentRun.count.mockResolvedValue(5);
    mockCommentService.batchCommentCounts.mockResolvedValue({});
    mockUuidResolver.batchGetActorNames.mockResolvedValue(new Map());
    mockUuidResolver.batchFormatCreatedBy.mockResolvedValue(
      new Map([
        [task1.createdByUuid, { type: "user", uuid: task1.createdByUuid, name: "User" }],
        [task2.createdByUuid, { type: "user", uuid: task2.createdByUuid, name: "User" }],
      ]),
    );

    const result = await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
    });

    expect(result.total).toBe(5);
    expect(result.tasks).toHaveLength(2);
    expect(mockPrisma.experimentRun.findMany).toHaveBeenCalledOnce();
    expect(mockPrisma.experimentRun.count).toHaveBeenCalledOnce();
  });

  it("passes status filter to prisma where clause", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
      status: "in_progress",
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("in_progress");
  });

  it("passes priority filter to prisma where clause", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
      priority: "high",
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg.priority).toBe("high");
  });

  it("does not include status/priority in where when not provided", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("status");
    expect(whereArg).not.toHaveProperty("priority");
  });

  it("uses batch comment counts for all returned tasks", async () => {
    const task1 = rawTask({ uuid: "t1" });
    mockPrisma.experimentRun.findMany.mockResolvedValue([task1]);
    mockPrisma.experimentRun.count.mockResolvedValue(1);
    mockCommentService.batchCommentCounts.mockResolvedValue({ t1: 3 });
    mockUuidResolver.batchGetActorNames.mockResolvedValue(new Map());
    mockUuidResolver.batchFormatCreatedBy.mockResolvedValue(new Map());

    const result = await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
    });

    expect(mockCommentService.batchCommentCounts).toHaveBeenCalledWith(
      COMPANY_UUID,
      "experiment_run",
      ["t1"],
    );
    expect(result.tasks[0].commentCount).toBe(3);
  });

  it("passes experimentDesignUuids filter to prisma where clause", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
      experimentDesignUuids: ["proposal-1", "proposal-2"],
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg.experimentDesignUuid).toEqual({ in: ["proposal-1", "proposal-2"] });
  });

  it("does not include experimentDesignUuid filter when experimentDesignUuids is undefined", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("experimentDesignUuid");
  });

  it("does not include experimentDesignUuid filter when experimentDesignUuids is empty array", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await listExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 10,
      experimentDesignUuids: [],
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("experimentDesignUuid");
  });
});

// ---------- getExperimentRun ----------

describe("getExperimentRun", () => {
  it("returns formatted task with deps and criteria when found", async () => {
    const task = rawTaskWithRelations();
    mockPrisma.experimentRun.findFirst.mockResolvedValue(task);
    mockPrisma.comment.count.mockResolvedValue(2);

    const result = await getExperimentRun(COMPANY_UUID, RUN_UUID);

    expect(result).not.toBeNull();
    expect(result!.uuid).toBe(RUN_UUID);
    expect(result!.commentCount).toBe(2);
    expect(result!.dependsOn).toEqual([]);
    expect(result!.dependedBy).toEqual([]);
    expect(result!.acceptanceCriteriaItems).toEqual([]);
  });

  it("returns null when task not found", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    const result = await getExperimentRun(COMPANY_UUID, "nonexistent");
    expect(result).toBeNull();
  });

  it("scopes query by companyUuid", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await getExperimentRun(COMPANY_UUID, RUN_UUID);

    expect(mockPrisma.experimentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RUN_UUID, companyUuid: COMPANY_UUID },
      }),
    );
  });

  it("formats dependency info from nested relations", async () => {
    const task = rawTaskWithRelations({
      dependsOn: [
        { dependsOnRun: { uuid: "dep1", title: "Dep Task", status: "done" } },
      ],
      dependedBy: [
        { run: { uuid: "rev1", title: "Reverse Dep", status: "open" } },
      ],
    });
    // Remove the overrides from the top-level so they only appear in the relation fields
    delete (task as Record<string, unknown>)["dependsOn"];
    delete (task as Record<string, unknown>)["dependedBy"];
    const taskWithDeps = {
      ...rawTask(),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
      dependsOn: [
        { dependsOnRun: { uuid: "dep1", title: "Dep Task", status: "done" } },
      ],
      dependedBy: [
        { run: { uuid: "rev1", title: "Reverse Dep", status: "open" } },
      ],
      acceptanceCriteriaItems: [],
    };
    mockPrisma.experimentRun.findFirst.mockResolvedValue(taskWithDeps);
    mockPrisma.comment.count.mockResolvedValue(0);

    const result = await getExperimentRun(COMPANY_UUID, RUN_UUID);

    expect(result!.dependsOn).toEqual([
      { uuid: "dep1", title: "Dep Task", status: "done" },
    ]);
    expect(result!.dependedBy).toEqual([
      { uuid: "rev1", title: "Reverse Dep", status: "open" },
    ]);
  });

  it("formats acceptance criteria items", async () => {
    const criterion = makeAcceptanceCriterion({
      runUuid: RUN_UUID,
      status: "passed",
      markedAt: new Date("2026-02-01"),
      devMarkedAt: null,
    });
    const task = {
      ...rawTask(),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
      dependsOn: [],
      dependedBy: [],
      acceptanceCriteriaItems: [criterion],
    };
    mockPrisma.experimentRun.findFirst.mockResolvedValue(task);
    mockPrisma.comment.count.mockResolvedValue(0);

    const result = await getExperimentRun(COMPANY_UUID, RUN_UUID);

    expect(result!.acceptanceCriteriaItems).toHaveLength(1);
    expect(result!.acceptanceCriteriaItems[0].status).toBe("passed");
    expect(result!.acceptanceCriteriaItems[0].markedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(result!.acceptanceCriteriaItems[0].devMarkedAt).toBeNull();
  });
});

// ---------- createExperimentRun ----------

describe("createExperimentRun", () => {
  it("creates a task with correct defaults", async () => {
    const created = rawTask({ status: "open", priority: "medium" });
    mockPrisma.experimentRun.create.mockResolvedValue(created);

    const result = await createExperimentRun({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "New Task",
      createdByUuid: authContexts.user.actorUuid,
    });

    expect(result.uuid).toBe(RUN_UUID);
    expect(result.status).toBe("open");

    const createData = mockPrisma.experimentRun.create.mock.calls[0][0].data;
    expect(createData.status).toBe("open");
    expect(createData.priority).toBe("medium");
    expect(createData.companyUuid).toBe(COMPANY_UUID);
    expect(createData.researchProjectUuid).toBe(PROJECT_UUID);
    expect(createData.title).toBe("New Task");
  });

  it("uses provided priority instead of default", async () => {
    mockPrisma.experimentRun.create.mockResolvedValue(rawTask({ priority: "high" }));

    await createExperimentRun({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "High Priority",
      priority: "high",
      createdByUuid: authContexts.user.actorUuid,
    });

    const createData = mockPrisma.experimentRun.create.mock.calls[0][0].data;
    expect(createData.priority).toBe("high");
  });

  it("emits a change event after creation", async () => {
    mockPrisma.experimentRun.create.mockResolvedValue(rawTask());

    await createExperimentRun({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "Task",
      createdByUuid: authContexts.user.actorUuid,
    });

    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: COMPANY_UUID,
        researchProjectUuid: PROJECT_UUID,
        entityType: "experiment_run",
        action: "created",
      }),
    );
  });

  it("passes optional fields (description, computeBudgetHours, acceptanceCriteria, experimentDesignUuid)", async () => {
    mockPrisma.experimentRun.create.mockResolvedValue(rawTask());

    await createExperimentRun({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "Task",
      description: "Some desc",
      computeBudgetHours: 5,
      acceptanceCriteria: "- [ ] criterion",
      experimentDesignUuid: "prop-uuid",
      createdByUuid: authContexts.user.actorUuid,
    });

    const createData = mockPrisma.experimentRun.create.mock.calls[0][0].data;
    expect(createData.description).toBe("Some desc");
    expect(createData.computeBudgetHours).toBe(5);
    expect(createData.acceptanceCriteria).toBe("- [ ] criterion");
    expect(createData.experimentDesignUuid).toBe("prop-uuid");
  });
});

// ---------- claimExperimentRun ----------

describe("claimExperimentRun", () => {
  it("claims an open task (sets status to assigned)", async () => {
    const claimed = {
      ...rawTask({ status: "assigned", assigneeType: "agent", assigneeUuid: "a1" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(claimed);

    const result = await claimExperimentRun({
      runUuid: RUN_UUID,
      companyUuid: COMPANY_UUID,
      assigneeType: "agent",
      assigneeUuid: "a1",
    });

    expect(result.status).toBe("assigned");
    expect(mockPrisma.experimentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RUN_UUID, status: "open" },
        data: expect.objectContaining({
          status: "assigned",
          assigneeType: "agent",
          assigneeUuid: "a1",
        }),
      }),
    );
  });

  it("throws AlreadyClaimedError when task is not open (Prisma P2025)", async () => {
    mockPrisma.experimentRun.update.mockRejectedValue({ code: "P2025" });

    await expect(
      claimExperimentRun({
        runUuid: RUN_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "agent",
        assigneeUuid: "a1",
      }),
    ).rejects.toThrow(AlreadyClaimedError);
  });

  it("re-throws non-P2025 errors", async () => {
    const dbError = new Error("DB connection lost");
    mockPrisma.experimentRun.update.mockRejectedValue(dbError);

    await expect(
      claimExperimentRun({
        runUuid: RUN_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "agent",
        assigneeUuid: "a1",
      }),
    ).rejects.toThrow("DB connection lost");
  });

  it("emits change event on successful claim", async () => {
    const claimed = {
      ...rawTask({ status: "assigned" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(claimed);

    await claimExperimentRun({
      runUuid: RUN_UUID,
      companyUuid: COMPANY_UUID,
      assigneeType: "agent",
      assigneeUuid: "a1",
    });

    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "experiment_run",
        action: "updated",
      }),
    );
  });

  it("passes assignedByUuid when provided", async () => {
    const claimed = {
      ...rawTask({ status: "assigned" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(claimed);

    await claimExperimentRun({
      runUuid: RUN_UUID,
      companyUuid: COMPANY_UUID,
      assigneeType: "agent",
      assigneeUuid: "a1",
      assignedByUuid: "user-123",
    });

    const updateData = mockPrisma.experimentRun.update.mock.calls[0][0].data;
    expect(updateData.assignedByUuid).toBe("user-123");
  });
});

// ---------- releaseExperimentRun ----------

describe("releaseExperimentRun", () => {
  it("releases an assigned task (reverts to open, clears assignee)", async () => {
    const released = {
      ...rawTask({ status: "open", assigneeType: null, assigneeUuid: null }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(released);

    const result = await releaseExperimentRun(RUN_UUID);

    expect(result.status).toBe("open");
    expect(mockPrisma.experimentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RUN_UUID, status: "assigned" },
        data: expect.objectContaining({
          status: "open",
          assigneeType: null,
          assigneeUuid: null,
          assignedAt: null,
          assignedByUuid: null,
        }),
      }),
    );
  });

  it("throws NotClaimedError when task is not assigned (Prisma P2025)", async () => {
    mockPrisma.experimentRun.update.mockRejectedValue({ code: "P2025" });

    await expect(releaseExperimentRun(RUN_UUID)).rejects.toThrow(NotClaimedError);
  });

  it("re-throws non-P2025 errors", async () => {
    const dbError = new Error("Timeout");
    mockPrisma.experimentRun.update.mockRejectedValue(dbError);

    await expect(releaseExperimentRun(RUN_UUID)).rejects.toThrow("Timeout");
  });

  it("emits change event on successful release", async () => {
    const released = {
      ...rawTask({ status: "open" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(released);

    await releaseExperimentRun(RUN_UUID);

    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "experiment_run",
        action: "updated",
      }),
    );
  });
});

// ---------- deleteExperimentRun ----------

describe("deleteExperimentRun", () => {
  it("deletes the task by uuid", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.delete.mockResolvedValue(task);

    const result = await deleteExperimentRun(RUN_UUID);

    expect(result.uuid).toBe(RUN_UUID);
    expect(mockPrisma.experimentRun.delete).toHaveBeenCalledWith({ where: { uuid: RUN_UUID } });
  });

  it("emits change event with action deleted", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.delete.mockResolvedValue(task);

    await deleteExperimentRun(RUN_UUID);

    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: COMPANY_UUID,
        entityType: "experiment_run",
        action: "deleted",
      }),
    );
  });
});

// ---------- markAcceptanceCriteria ----------

describe("markAcceptanceCriteria", () => {
  const criterionUuid = "crit-0001";

  it("validates task belongs to company and updates criteria", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(task)   // validation in markAcceptanceCriteria
      .mockResolvedValueOnce(task);  // validation in getAcceptanceStatus
    mockPrisma.acceptanceCriterion.findMany
      .mockResolvedValueOnce([{ uuid: criterionUuid }])  // pre-validation
      .mockResolvedValueOnce([                            // getAcceptanceStatus return
        makeAcceptanceCriterion({ uuid: criterionUuid, status: "passed", runUuid: RUN_UUID }),
      ]);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await markAcceptanceCriteria(
      COMPANY_UUID,
      RUN_UUID,
      [{ uuid: criterionUuid, status: "passed", evidence: "Looks good" }],
      { type: "user", actorUuid: authContexts.user.actorUuid },
    );

    expect(result.items).toHaveLength(1);
    expect(mockPrisma.acceptanceCriterion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: criterionUuid },
        data: expect.objectContaining({
          status: "passed",
          evidence: "Looks good",
          markedByType: "user",
          markedBy: authContexts.user.actorUuid,
        }),
      }),
    );
  });

  it("throws when task not found for company", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await expect(
      markAcceptanceCriteria(
        COMPANY_UUID,
        RUN_UUID,
        [{ uuid: criterionUuid, status: "passed" }],
        { type: "user", actorUuid: "u1" },
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });

  it("throws when criterion does not belong to task", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(rawTask());
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([]); // no matching criteria

    await expect(
      markAcceptanceCriteria(
        COMPANY_UUID,
        RUN_UUID,
        [{ uuid: "wrong-crit", status: "passed" }],
        { type: "user", actorUuid: "u1" },
      ),
    ).rejects.toThrow(/does not belong to task/);
  });

  it("emits change event after marking", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(task);
    mockPrisma.acceptanceCriterion.findMany
      .mockResolvedValueOnce([{ uuid: criterionUuid }])
      .mockResolvedValueOnce([
        makeAcceptanceCriterion({ uuid: criterionUuid, status: "passed", runUuid: RUN_UUID }),
      ]);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    await markAcceptanceCriteria(
      COMPANY_UUID,
      RUN_UUID,
      [{ uuid: criterionUuid, status: "passed" }],
      { type: "user", actorUuid: "u1" },
    );

    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "experiment_run",
        entityUuid: RUN_UUID,
        action: "updated",
      }),
    );
  });
});

// ---------- reportCriteriaSelfCheck ----------

describe("reportCriteriaSelfCheck", () => {
  const criterionUuid = "crit-0002";

  it("updates devStatus fields on criteria", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(task);
    mockPrisma.acceptanceCriterion.findMany
      .mockResolvedValueOnce([{ uuid: criterionUuid }])
      .mockResolvedValueOnce([
        makeAcceptanceCriterion({ uuid: criterionUuid, devStatus: "passed", runUuid: RUN_UUID }),
      ]);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await reportCriteriaSelfCheck(
      COMPANY_UUID,
      RUN_UUID,
      [{ uuid: criterionUuid, devStatus: "passed", devEvidence: "Tests pass" }],
      { type: "agent", actorUuid: authContexts.agent.actorUuid },
    );

    expect(result.items).toHaveLength(1);
    expect(mockPrisma.acceptanceCriterion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: criterionUuid },
        data: expect.objectContaining({
          devStatus: "passed",
          devEvidence: "Tests pass",
          devMarkedByType: "agent",
          devMarkedBy: authContexts.agent.actorUuid,
        }),
      }),
    );
  });

  it("throws when task not found", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await expect(
      reportCriteriaSelfCheck(
        COMPANY_UUID,
        RUN_UUID,
        [{ uuid: "c1", devStatus: "passed" }],
        { type: "agent", actorUuid: "a1" },
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });

  it("throws when criterion does not belong to task", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(rawTask());
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([]);

    await expect(
      reportCriteriaSelfCheck(
        COMPANY_UUID,
        RUN_UUID,
        [{ uuid: "wrong-crit", devStatus: "failed" }],
        { type: "agent", actorUuid: "a1" },
      ),
    ).rejects.toThrow(/does not belong to task/);
  });

  it("sets devEvidence to null when not provided", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(task);
    mockPrisma.acceptanceCriterion.findMany
      .mockResolvedValueOnce([{ uuid: "c1" }])
      .mockResolvedValueOnce([
        makeAcceptanceCriterion({ uuid: "c1", devStatus: "passed", runUuid: RUN_UUID }),
      ]);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    await reportCriteriaSelfCheck(
      COMPANY_UUID,
      RUN_UUID,
      [{ uuid: "c1", devStatus: "passed" }],
      { type: "agent", actorUuid: "a1" },
    );

    const updateData = mockPrisma.acceptanceCriterion.update.mock.calls[0][0].data;
    expect(updateData.devEvidence).toBeNull();
  });
});

// ---------- checkAcceptanceCriteriaGate ----------

describe("checkAcceptanceCriteriaGate", () => {
  it("allows transition when no criteria exist (backward compat)", async () => {
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([]);

    const result = await checkAcceptanceCriteriaGate(RUN_UUID);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("allows transition when all required criteria are passed", async () => {
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([
      makeAcceptanceCriterion({ required: true, status: "passed" }),
      makeAcceptanceCriterion({ required: true, status: "passed" }),
      makeAcceptanceCriterion({ required: false, status: "pending" }),
    ]);

    const result = await checkAcceptanceCriteriaGate(RUN_UUID);

    expect(result.allowed).toBe(true);
  });

  it("blocks transition when required criteria are not all passed", async () => {
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([
      makeAcceptanceCriterion({ uuid: "c1", required: true, status: "passed" }),
      makeAcceptanceCriterion({ uuid: "c2", required: true, status: "pending" }),
    ]);

    const result = await checkAcceptanceCriteriaGate(RUN_UUID);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Not all required acceptance criteria are passed");
    expect(result.summary).toBeDefined();
    expect(result.summary!.requiredPending).toBe(1);
  });

  it("blocks transition when required criteria are failed", async () => {
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([
      makeAcceptanceCriterion({ uuid: "c1", required: true, status: "failed" }),
      makeAcceptanceCriterion({ uuid: "c2", required: true, status: "passed" }),
    ]);

    const result = await checkAcceptanceCriteriaGate(RUN_UUID);

    expect(result.allowed).toBe(false);
    expect(result.summary!.requiredFailed).toBe(1);
  });

  it("returns unresolved criteria (required items that are not passed)", async () => {
    const pendingCrit = makeAcceptanceCriterion({
      uuid: "c-pending",
      required: true,
      status: "pending",
      description: "Must do X",
    });
    const failedCrit = makeAcceptanceCriterion({
      uuid: "c-failed",
      required: true,
      status: "failed",
      description: "Must do Y",
    });
    const passedCrit = makeAcceptanceCriterion({
      uuid: "c-passed",
      required: true,
      status: "passed",
    });

    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([
      passedCrit,
      pendingCrit,
      failedCrit,
    ]);

    const result = await checkAcceptanceCriteriaGate(RUN_UUID);

    expect(result.allowed).toBe(false);
    expect(result.unresolvedCriteria).toHaveLength(2);
    const uuids = result.unresolvedCriteria!.map((c) => c.uuid);
    expect(uuids).toContain("c-pending");
    expect(uuids).toContain("c-failed");
  });

  it("allows when only optional criteria are pending/failed", async () => {
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([
      makeAcceptanceCriterion({ required: true, status: "passed" }),
      makeAcceptanceCriterion({ required: false, status: "pending" }),
      makeAcceptanceCriterion({ required: false, status: "failed" }),
    ]);

    const result = await checkAcceptanceCriteriaGate(RUN_UUID);

    expect(result.allowed).toBe(true);
  });
});

// ---------- addRunDependency ----------

describe("addRunDependency", () => {
  const taskUuid1 = "task-0001";
  const taskUuid2 = "task-0002";
  const taskUuid3 = "task-0003";

  it("should throw when task depends on itself", async () => {
    await expect(
      (await import("@/services/experiment-run.service")).addRunDependency(
        COMPANY_UUID,
        taskUuid1,
        taskUuid1,
      ),
    ).rejects.toThrow("An experiment run cannot depend on itself");
  });

  it("should throw when task not found", async () => {
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(null) // task not found
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid2 })); // dependsOn exists

    await expect(
      (await import("@/services/experiment-run.service")).addRunDependency(
        COMPANY_UUID,
        "nonexistent",
        taskUuid2,
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });

  it("should throw when dependency task not found", async () => {
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid1 }))
      .mockResolvedValueOnce(null); // dependsOn not found

    await expect(
      (await import("@/services/experiment-run.service")).addRunDependency(
        COMPANY_UUID,
        taskUuid1,
        "nonexistent",
      ),
    ).rejects.toThrow("Dependency experiment run not found");
  });

  it("should throw when tasks belong to different projects", async () => {
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid1, researchProjectUuid: "proj-a" }))
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid2, researchProjectUuid: "proj-b" }));

    await expect(
      (await import("@/services/experiment-run.service")).addRunDependency(
        COMPANY_UUID,
        taskUuid1,
        taskUuid2,
      ),
    ).rejects.toThrow("Experiment runs must belong to the same project");
  });

  it("should throw when adding dependency would create a cycle", async () => {
    // Task1 -> Task2 -> Task3, trying to add Task3 -> Task1 (cycle)
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid3, researchProjectUuid: PROJECT_UUID }))
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid1, researchProjectUuid: PROJECT_UUID }));

    // Existing edges: task1 -> task2, task2 -> task3
    mockPrisma.runDependency.findMany.mockResolvedValue([
      { runUuid: taskUuid1, dependsOnRunUuid: taskUuid2 },
      { runUuid: taskUuid2, dependsOnRunUuid: taskUuid3 },
    ]);

    await expect(
      (await import("@/services/experiment-run.service")).addRunDependency(
        COMPANY_UUID,
        taskUuid3,
        taskUuid1,
      ),
    ).rejects.toThrow("Adding this dependency would create a cycle");
  });

  it("should create dependency when no cycle detected", async () => {
    mockPrisma.experimentRun.findFirst
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid1, researchProjectUuid: PROJECT_UUID }))
      .mockResolvedValueOnce(rawTask({ uuid: taskUuid2, researchProjectUuid: PROJECT_UUID }));
    mockPrisma.runDependency.findMany.mockResolvedValue([]);
    mockPrisma.runDependency.create.mockResolvedValue({
      runUuid: taskUuid1,
      dependsOnRunUuid: taskUuid2,
      createdAt: new Date("2026-03-01"),
    });

    const result = await (await import("@/services/experiment-run.service")).addRunDependency(
      COMPANY_UUID,
      taskUuid1,
      taskUuid2,
    );

    expect(result.runUuid).toBe(taskUuid1);
    expect(result.dependsOnRunUuid).toBe(taskUuid2);
    expect(mockPrisma.runDependency.create).toHaveBeenCalledWith({
      data: { runUuid: taskUuid1, dependsOnRunUuid: taskUuid2 },
    });
  });
});

// ---------- removeRunDependency ----------

describe("removeRunDependency", () => {
  it("should throw when task not found", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await expect(
      (await import("@/services/experiment-run.service")).removeRunDependency(
        COMPANY_UUID,
        "nonexistent",
        "dep-uuid",
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });

  it("should delete dependency", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(rawTask({ uuid: "t1" }));
    mockPrisma.runDependency.deleteMany.mockResolvedValue({ count: 1 });

    await (await import("@/services/experiment-run.service")).removeRunDependency(
      COMPANY_UUID,
      "t1",
      "dep-uuid",
    );

    expect(mockPrisma.runDependency.deleteMany).toHaveBeenCalledWith({
      where: { runUuid: "t1", dependsOnRunUuid: "dep-uuid" },
    });
  });
});

// ---------- computeAcceptanceStatus ----------

describe("computeAcceptanceStatus", () => {
  it("should return not_started when no items", async () => {
    const { computeAcceptanceStatus } = await import("@/services/experiment-run.service");
    const result = computeAcceptanceStatus([]);
    expect(result.status).toBe("not_started");
    expect(result.summary.total).toBe(0);
  });

  it("should return failed when any required criterion failed", async () => {
    const { computeAcceptanceStatus } = await import("@/services/experiment-run.service");
    const result = computeAcceptanceStatus([
      { required: true, status: "passed" },
      { required: true, status: "failed" },
    ]);
    expect(result.status).toBe("failed");
    expect(result.summary.requiredFailed).toBe(1);
  });

  it("should return passed when all required criteria passed", async () => {
    const { computeAcceptanceStatus } = await import("@/services/experiment-run.service");
    const result = computeAcceptanceStatus([
      { required: true, status: "passed" },
      { required: true, status: "passed" },
      { required: false, status: "pending" },
    ]);
    expect(result.status).toBe("passed");
    expect(result.summary.requiredPassed).toBe(2);
  });

  it("should return in_progress when some criteria evaluated but not all required passed", async () => {
    const { computeAcceptanceStatus } = await import("@/services/experiment-run.service");
    const result = computeAcceptanceStatus([
      { required: true, status: "passed" },
      { required: true, status: "pending" },
      { required: false, status: "failed" },
    ]);
    expect(result.status).toBe("in_progress");
  });

  it("should return not_started when all criteria pending", async () => {
    const { computeAcceptanceStatus } = await import("@/services/experiment-run.service");
    const result = computeAcceptanceStatus([
      { required: true, status: "pending" },
      { required: false, status: "pending" },
    ]);
    expect(result.status).toBe("not_started");
  });
});

// ---------- getRunDependencies ----------

describe("getRunDependencies", () => {
  it("should return dependencies for a task", async () => {
    const task = {
      ...rawTask({ uuid: "t1" }),
      dependsOn: [
        { dependsOnRun: { uuid: "dep1", title: "Dep 1", status: "done" } },
      ],
      dependedBy: [
        { run: { uuid: "rev1", title: "Rev 1", status: "open" } },
      ],
      acceptanceCriteriaItems: [],
    };
    mockPrisma.experimentRun.findFirst.mockResolvedValue(task);

    const result = await (await import("@/services/experiment-run.service")).getRunDependencies(
      COMPANY_UUID,
      "t1",
    );

    expect(result.dependsOn).toHaveLength(1);
    expect(result.dependsOn[0].uuid).toBe("dep1");
    expect(result.dependedBy).toHaveLength(1);
    expect(result.dependedBy[0].uuid).toBe("rev1");
  });

  it("should throw when task not found", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await expect(
      (await import("@/services/experiment-run.service")).getRunDependencies(
        COMPANY_UUID,
        "nonexistent",
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });
});

// ---------- getUnblockedExperimentRuns ----------

describe("getUnblockedExperimentRuns", () => {
  it("should return tasks without unresolved dependencies", async () => {
    const task1 = rawTask({ uuid: "t1", status: "open" });
    mockPrisma.experimentRun.findMany.mockResolvedValue([task1]);
    mockPrisma.experimentRun.count.mockResolvedValue(1);
    mockCommentService.batchCommentCounts.mockResolvedValue({});
    mockUuidResolver.batchGetActorNames.mockResolvedValue(new Map());
    mockUuidResolver.batchFormatCreatedBy.mockResolvedValue(
      new Map([[task1.createdByUuid, { type: "user", uuid: task1.createdByUuid, name: "User" }]]),
    );

    const result = await (await import("@/services/experiment-run.service")).getUnblockedExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("should filter for open/assigned status", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await (await import("@/services/experiment-run.service")).getUnblockedExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg.status.in).toEqual(["open", "assigned"]);
  });

  it("should pass experimentDesignUuids filter to where clause", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await (await import("@/services/experiment-run.service")).getUnblockedExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      experimentDesignUuids: ["prop-1", "prop-2"],
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg.experimentDesignUuid).toEqual({ in: ["prop-1", "prop-2"] });
  });

  it("should not include experimentDesignUuid filter when experimentDesignUuids is not provided", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);

    await (await import("@/services/experiment-run.service")).getUnblockedExperimentRuns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
    });

    const whereArg = mockPrisma.experimentRun.findMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("experimentDesignUuid");
  });
});

// ---------- checkDependenciesResolved ----------

describe("checkDependenciesResolved", () => {
  it("should return resolved=true when no dependencies", async () => {
    mockPrisma.runDependency.findMany.mockResolvedValue([]);

    const result = await (await import("@/services/experiment-run.service")).checkDependenciesResolved(
      RUN_UUID,
    );

    expect(result.resolved).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("should return resolved=true when all dependencies are done/closed", async () => {
    mockPrisma.runDependency.findMany.mockResolvedValue([
      { dependsOnRun: { uuid: "d1", title: "Dep 1", status: "done", assigneeType: null, assigneeUuid: null } },
      { dependsOnRun: { uuid: "d2", title: "Dep 2", status: "closed", assigneeType: null, assigneeUuid: null } },
    ]);

    const result = await (await import("@/services/experiment-run.service")).checkDependenciesResolved(
      RUN_UUID,
    );

    expect(result.resolved).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("should return resolved=false with blockers when dependencies unresolved", async () => {
    mockPrisma.runDependency.findMany.mockResolvedValue([
      { dependsOnRun: { uuid: "d1", title: "Blocker Task", status: "in_progress", assigneeType: "agent", assigneeUuid: "a1" } },
    ]);
    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([]);
    mockUuidResolver.batchGetActorNames.mockResolvedValue(new Map([["a1", "Agent 1"]]));

    const result = await (await import("@/services/experiment-run.service")).checkDependenciesResolved(
      RUN_UUID,
    );

    expect(result.resolved).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].uuid).toBe("d1");
    expect(result.blockers[0].assignee).toEqual({
      type: "agent",
      uuid: "a1",
      name: "Agent 1",
    });
  });

  it("should include session checkin info in blockers", async () => {
    mockPrisma.runDependency.findMany.mockResolvedValue([
      { dependsOnRun: { uuid: "d1", title: "Blocker", status: "in_progress", assigneeType: null, assigneeUuid: null } },
    ]);
    mockPrisma.sessionRunCheckin.findMany.mockResolvedValue([
      { runUuid: "d1", sessionUuid: "s1", session: { name: "worker-1" } },
    ]);
    mockUuidResolver.batchGetActorNames.mockResolvedValue(new Map());

    const result = await (await import("@/services/experiment-run.service")).checkDependenciesResolved(
      RUN_UUID,
    );

    expect(result.blockers[0].sessionCheckin).toEqual({
      sessionUuid: "s1",
      sessionName: "worker-1",
    });
  });
});

// ---------- getProjectRunDependencies ----------

describe("getProjectRunDependencies", () => {
  it("should return nodes and edges for project DAG", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([
      { uuid: "t1", title: "Task 1", status: "open", priority: "high", experimentDesignUuid: "p1" },
      { uuid: "t2", title: "Task 2", status: "done", priority: "medium", experimentDesignUuid: "p1" },
    ]);
    mockPrisma.runDependency.findMany.mockResolvedValue([
      { runUuid: "t2", dependsOnRunUuid: "t1" },
    ]);

    const result = await (await import("@/services/experiment-run.service")).getProjectRunDependencies(
      COMPANY_UUID,
      PROJECT_UUID,
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].uuid).toBe("t1");
    expect(result.nodes[0].experimentDesignUuid).toBe("p1");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({ from: "t2", to: "t1" });
  });

  it("should return empty arrays when no tasks", async () => {
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.runDependency.findMany.mockResolvedValue([]);

    const result = await (await import("@/services/experiment-run.service")).getProjectRunDependencies(
      COMPANY_UUID,
      PROJECT_UUID,
    );

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

// ---------- resetAcceptanceCriterion ----------

describe("resetAcceptanceCriterion", () => {
  it("should reset criterion to pending", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.findFirst.mockResolvedValue(task);
    mockPrisma.acceptanceCriterion.findFirst.mockResolvedValue(
      makeAcceptanceCriterion({ uuid: "c1", runUuid: RUN_UUID })
    );
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    await (await import("@/services/experiment-run.service")).resetAcceptanceCriterion(
      COMPANY_UUID,
      RUN_UUID,
      "c1",
    );

    expect(mockPrisma.acceptanceCriterion.update).toHaveBeenCalledWith({
      where: { uuid: "c1" },
      data: expect.objectContaining({
        status: "pending",
        evidence: null,
        markedByType: null,
        markedBy: null,
        markedAt: null,
      }),
    });
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should throw when task not found", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await expect(
      (await import("@/services/experiment-run.service")).resetAcceptanceCriterion(
        COMPANY_UUID,
        "nonexistent",
        "c1",
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });

  it("should throw when criterion not found for task", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(rawTask());
    mockPrisma.acceptanceCriterion.findFirst.mockResolvedValue(null);

    await expect(
      (await import("@/services/experiment-run.service")).resetAcceptanceCriterion(
        COMPANY_UUID,
        RUN_UUID,
        "wrong-crit",
      ),
    ).rejects.toThrow("Criterion not found for this task");
  });
});

// ---------- getAcceptanceStatus ----------

describe("getAcceptanceStatus", () => {
  it("should return acceptance status and criteria items", async () => {
    const task = rawTask();
    mockPrisma.experimentRun.findFirst.mockResolvedValue(task);
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([
      makeAcceptanceCriterion({ required: true, status: "passed" }),
      makeAcceptanceCriterion({ required: true, status: "pending" }),
    ]);

    const result = await (await import("@/services/experiment-run.service")).getAcceptanceStatus(
      COMPANY_UUID,
      RUN_UUID,
    );

    expect(result.items).toHaveLength(2);
    expect(result.status).toBe("in_progress");
    expect(result.summary.required).toBe(2);
  });

  it("should throw when task not found", async () => {
    mockPrisma.experimentRun.findFirst.mockResolvedValue(null);

    await expect(
      (await import("@/services/experiment-run.service")).getAcceptanceStatus(
        COMPANY_UUID,
        "nonexistent",
      ),
    ).rejects.toThrow("ExperimentRun not found");
  });
});

// ---------- createAcceptanceCriteria ----------

describe("createAcceptanceCriteria", () => {
  it("should create multiple acceptance criteria", async () => {
    mockPrisma.acceptanceCriterion.create
      .mockResolvedValueOnce(makeAcceptanceCriterion({ uuid: "c1", description: "Criterion 1" }))
      .mockResolvedValueOnce(makeAcceptanceCriterion({ uuid: "c2", description: "Criterion 2" }));

    const result = await createAcceptanceCriteria(RUN_UUID, [
      { description: "Criterion 1", required: true },
      { description: "Criterion 2", required: false },
    ]);

    expect(result).toHaveLength(2);
    expect(mockPrisma.acceptanceCriterion.create).toHaveBeenCalledTimes(2);
  });

  it("should return empty array when no items provided", async () => {
    const result = await createAcceptanceCriteria(RUN_UUID, []);
    expect(result).toEqual([]);
  });

  it("should use default required=true when not specified", async () => {
    mockPrisma.acceptanceCriterion.create.mockResolvedValue(
      makeAcceptanceCriterion({ uuid: "c1" })
    );

    await createAcceptanceCriteria(RUN_UUID, [{ description: "Test" }]);

    const createData = mockPrisma.acceptanceCriterion.create.mock.calls[0][0].data;
    expect(createData.required).toBe(true);
  });

  it("should use index as sortOrder when not specified", async () => {
    mockPrisma.acceptanceCriterion.create
      .mockResolvedValueOnce(makeAcceptanceCriterion({ uuid: "c1" }))
      .mockResolvedValueOnce(makeAcceptanceCriterion({ uuid: "c2" }));

    await createAcceptanceCriteria(RUN_UUID, [
      { description: "First" },
      { description: "Second" },
    ]);

    expect(mockPrisma.acceptanceCriterion.create.mock.calls[0][0].data.sortOrder).toBe(0);
    expect(mockPrisma.acceptanceCriterion.create.mock.calls[1][0].data.sortOrder).toBe(1);
  });
});

// ---------- updateExperimentRun (mention processing) ----------

describe("updateExperimentRun", () => {
  it("should update task fields", async () => {
    mockPrisma.experimentRun.findUnique.mockResolvedValue(null);
    const updated = {
      ...rawTask({ title: "Updated Title", status: "in_progress" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(updated);

    const result = await updateExperimentRun(RUN_UUID, {
      title: "Updated Title",
      status: "in_progress",
    });

    expect(result.title).toBe("Updated Title");
    expect(result.status).toBe("in_progress");
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should reset acceptance criteria when moving from to_verify to other status", async () => {
    mockPrisma.experimentRun.findUnique.mockResolvedValue(null);
    const updated = {
      ...rawTask({ status: "in_progress" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.findUnique.mockResolvedValue({ status: "to_verify" });
    mockPrisma.experimentRun.update.mockResolvedValue(updated);
    mockPrisma.acceptanceCriterion.updateMany.mockResolvedValue({ count: 2 });

    await updateExperimentRun(RUN_UUID, { status: "in_progress" });

    expect(mockPrisma.acceptanceCriterion.updateMany).toHaveBeenCalledWith({
      where: { runUuid: RUN_UUID },
      data: expect.objectContaining({
        status: "pending",
        devStatus: "pending",
      }),
    });
  });

  it("should NOT reset criteria when moving from to_verify to done", async () => {
    mockPrisma.experimentRun.findUnique.mockResolvedValue(null);
    const updated = {
      ...rawTask({ status: "done" }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.findUnique.mockResolvedValue({ status: "to_verify" });
    mockPrisma.experimentRun.update.mockResolvedValue(updated);

    await updateExperimentRun(RUN_UUID, { status: "done" });

    expect(mockPrisma.acceptanceCriterion.updateMany).not.toHaveBeenCalled();
    expect(mockComputeService.releaseGpuReservationsForRun).toHaveBeenCalledWith(COMPANY_UUID, RUN_UUID);
    expect(mockProjectSynthesisService.refreshProjectSynthesis).toHaveBeenCalledWith(
      COMPANY_UUID,
      PROJECT_UUID,
      updated.createdByUuid,
    );
  });

  it("should process new mentions when description updated with actor context", async () => {
    const oldDesc = "Old description";
    const newDesc = "New description with @user[uuid1]";

    mockPrisma.experimentRun.findUnique.mockResolvedValue({ description: oldDesc });
    const updated = {
      ...rawTask({ description: newDesc }),
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    };
    mockPrisma.experimentRun.update.mockResolvedValue(updated);

    mockMentionService.parseMentions
      .mockReturnValueOnce([]) // old mentions
      .mockReturnValueOnce([{ type: "user", uuid: "uuid1", displayName: "User 1" }]); // new mentions

    await updateExperimentRun(
      RUN_UUID,
      { description: newDesc },
      { actorType: "agent", actorUuid: "agent1" },
    );

    // Wait for async processing to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockMentionService.parseMentions).toHaveBeenCalledWith(oldDesc);
    expect(mockMentionService.parseMentions).toHaveBeenCalledWith(newDesc);
    expect(mockMentionService.createMentions).toHaveBeenCalled();
    expect(mockActivityService.createActivity).toHaveBeenCalled();
  });
});

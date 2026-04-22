import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  experiment: {
    findFirst: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  researchProject: {
    findFirst: vi.fn(),
  },
  researchQuestion: {
    update: vi.fn(),
  },
  comment: {
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  agent: {
    findUnique: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// ===== Service mocks =====
const mockNotificationCreate = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/services/notification.service", () => ({
  create: mockNotificationCreate,
}));

const mockCreateActivity = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/services/activity.service", () => ({
  createActivity: mockCreateActivity,
}));

vi.mock("@/lib/event-bus", () => ({
  eventBus: {
    emitChange: vi.fn(),
  },
}));

vi.mock("@/lib/uuid-resolver", () => ({
  formatAssigneeComplete: vi.fn(async () => null),
  formatCreatedBy: vi.fn(async () => null),
  getActorName: vi.fn(async () => "Test User"),
}));

import {
  resetExperimentToPendingStart,
  reviewExperiment,
  updateExperimentWorkflowStatus,
} from "@/services/experiment.service";

const COMPANY = "test-company-review";

function makeExperiment(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "exp-1",
    companyUuid: COMPANY,
    researchProjectUuid: "proj-1",
    researchQuestionUuid: null,
    title: "E1",
    description: null,
    status: "pending_review",
    priority: "medium",
    computeBudgetHours: null,
    computeUsedHours: null,
    outcome: null,
    results: null,
    attachments: null,
    baseBranch: null,
    experimentBranch: null,
    commitSha: null,
    liveStatus: null,
    liveMessage: null,
    liveUpdatedAt: null,
    assigneeType: "agent",
    assigneeUuid: "a-1",
    assignedAt: new Date(),
    assignedByUuid: "user-1",
    createdByUuid: "a-1",
    createdByType: "agent",
    reviewedByUuid: null,
    reviewNote: null,
    reviewedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    researchQuestion: null,
    researchProject: { name: "P1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no autonomous loop project
  mockPrisma.researchProject.findFirst.mockResolvedValue(null);
  mockPrisma.experiment.groupBy.mockResolvedValue([]);
  mockPrisma.experiment.findMany.mockResolvedValue([]);
});

describe("reviewExperiment revert paths", () => {
  it("reverting without an assigned agent flips status to draft, clears assignee, and does not create comment or notification", async () => {
    const existing = makeExperiment();
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "draft",
      assigneeType: null,
      assigneeUuid: null,
    });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      approved: false,
      reviewNote: "ignored because agent cleared",
      assignedAgentUuid: null,
      actorUuid: "user-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: "exp-1" },
        data: expect.objectContaining({
          status: "draft",
          assigneeType: null,
          assigneeUuid: null,
          assignedAt: null,
          assignedByUuid: null,
          liveStatus: null,
          liveMessage: null,
        }),
      })
    );
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "experiment_status_changed",
        recipientUuid: "user-1",
      })
    );
  });

  it("reverting with an agent + note creates a comment and emits experiment_revision_requested", async () => {
    const existing = makeExperiment();
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "draft",
    });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      approved: false,
      reviewNote: "Please fix the metric",
      assignedAgentUuid: "a-1",
      actorUuid: "user-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "draft",
          assigneeType: "agent",
          assigneeUuid: "a-1",
          liveStatus: "sent",
        }),
      })
    );

    expect(mockPrisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyUuid: COMPANY,
          targetType: "experiment",
          targetUuid: "exp-1",
          content: "Please fix the metric",
          authorType: "user",
          authorUuid: "user-1",
        }),
      })
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "experiment_revision_requested",
        recipientUuid: "a-1",
        recipientType: "agent",
        entityType: "experiment",
        entityUuid: "exp-1",
      })
    );
  });

  it("reassigns to a different agent when a new assignedAgentUuid is provided", async () => {
    const existing = makeExperiment();
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "draft",
      assigneeUuid: "a-3-other",
    });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      approved: false,
      reviewNote: "switch owners",
      assignedAgentUuid: "a-3-other",
      actorUuid: "user-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "draft",
          assigneeType: "agent",
          assigneeUuid: "a-3-other",
        }),
      })
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "experiment_revision_requested",
        recipientUuid: "a-3-other",
      })
    );
  });

  it("approval path is unchanged: auto-assigns back to creator and emits task_assigned", async () => {
    const existing = makeExperiment({ assigneeUuid: null, assigneeType: null });
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "pending_start",
      assigneeType: "agent",
      assigneeUuid: "a-1",
    });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      approved: true,
      actorUuid: "user-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending_start",
          assigneeType: "agent",
          assigneeUuid: "a-1",
        }),
      })
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task_assigned",
        recipientUuid: "a-1",
      })
    );
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
  });

  it("re-emits task_assigned when an already-assigned draft revision is approved", async () => {
    const existing = makeExperiment({
      status: "pending_review",
      assigneeType: "agent",
      assigneeUuid: "a-1",
      createdByUuid: "a-1",
    });
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "pending_start",
      assigneeType: "agent",
      assigneeUuid: "a-1",
    });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      approved: true,
      actorUuid: "user-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending_start",
        }),
      })
    );

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "task_assigned",
        recipientType: "agent",
        recipientUuid: "a-1",
      })
    );
  });
});

describe("updateExperimentWorkflowStatus", () => {
  it("lets the assigned agent move an experiment to draft with working live status", async () => {
    const existing = makeExperiment({ status: "pending_review" });
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "draft",
      liveStatus: "running",
      liveMessage: "Revising experiment plan",
      liveUpdatedAt: new Date(),
    });

    await updateExperimentWorkflowStatus({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      status: "draft",
      actorType: "agent",
      actorUuid: "a-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "draft",
          liveStatus: "running",
          liveMessage: "Revising experiment plan",
        }),
      })
    );

    expect(mockCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "agent",
        actorUuid: "a-1",
        action: "status_changed",
      })
    );
  });

  it("clears live status when the assigned agent sends the revision back to pending_review", async () => {
    const existing = makeExperiment({ status: "draft", liveStatus: "running" });
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "pending_review",
      liveStatus: null,
      liveMessage: null,
      liveUpdatedAt: new Date(),
    });

    await updateExperimentWorkflowStatus({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      status: "pending_review",
      actorType: "agent",
      actorUuid: "a-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "pending_review",
          liveStatus: null,
          liveMessage: null,
        }),
      })
    );
  });
});

describe("resetExperimentToPendingStart", () => {
  it("moves a stuck experiment back to pending_start and clears live state", async () => {
    const existing = makeExperiment({ status: "in_progress", liveStatus: "running", startedAt: new Date() });
    mockPrisma.experiment.findFirst.mockResolvedValue(existing);
    mockPrisma.experiment.update.mockResolvedValue({
      ...existing,
      status: "pending_start",
      liveStatus: null,
      liveMessage: null,
      startedAt: null,
    });

    await resetExperimentToPendingStart({
      companyUuid: COMPANY,
      experimentUuid: "exp-1",
      actorUuid: "user-1",
    });

    expect(mockPrisma.experiment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: "exp-1" },
        data: expect.objectContaining({
          status: "pending_start",
          liveStatus: null,
          liveMessage: null,
          startedAt: null,
          liveUpdatedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "status_changed",
        value: { status: "pending_start", reset: true },
      }),
    );
  });

  it("rejects resetting experiments that are not in progress", async () => {
    mockPrisma.experiment.findFirst.mockResolvedValue(makeExperiment({ status: "pending_start" }));

    await expect(
      resetExperimentToPendingStart({
        companyUuid: COMPANY,
        experimentUuid: "exp-1",
        actorUuid: "user-1",
      }),
    ).rejects.toThrow("Invalid experiment status transition: pending_start -> pending_start");
    expect(mockPrisma.experiment.update).not.toHaveBeenCalled();
  });
});

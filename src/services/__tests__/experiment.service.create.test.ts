import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockPrisma = vi.hoisted(() => ({
  experiment: {
    create: vi.fn(),
    findMany: vi.fn(async () => []),
  },
  researchProject: {
    findFirst: vi.fn(async () => ({ name: "Project One" })),
  },
  researchQuestion: {
    update: vi.fn(async () => ({})),
  },
  document: {
    findFirst: vi.fn(async () => null),
  },
  experimentIncidentLesson: {
    findMany: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockCreateActivity = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/services/activity.service", () => ({
  createActivity: mockCreateActivity,
}));

const mockNotificationCreate = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/services/notification.service", () => ({
  create: mockNotificationCreate,
}));

vi.mock("@/lib/event-bus", () => ({
  eventBus: { emitChange: vi.fn() },
}));

vi.mock("@/lib/uuid-resolver", () => ({
  formatAssigneeComplete: vi.fn(async () => null),
  formatCreatedBy: vi.fn(async () => null),
  getActorName: vi.fn(async () => "Test Actor"),
}));

import { createExperiment } from "@/services/experiment.service";

const COMPANY = "company-1";
const PROJECT = "project-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.experiment.create.mockImplementation(async ({ data }) => ({
    uuid: "exp-new",
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
    assigneeType: null,
    assigneeUuid: null,
    assignedAt: null,
    assignedByUuid: null,
    reviewedByUuid: null,
    reviewNote: null,
    reviewedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...data,
    researchQuestion: null,
  }));
});

describe("createExperiment default status", () => {
  it("defaults to draft when an agent creates without specifying status", async () => {
    await createExperiment({
      companyUuid: COMPANY,
      researchProjectUuid: PROJECT,
      title: "Agent draft",
      description: "draft body",
      createdByUuid: "agent-1",
      createdByType: "agent",
    });

    expect(mockPrisma.experiment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "draft", createdByType: "agent" }),
      }),
    );
  });

  it("defaults to pending_start for user-created experiments", async () => {
    await createExperiment({
      companyUuid: COMPANY,
      researchProjectUuid: PROJECT,
      title: "User experiment",
      description: "desc",
      createdByUuid: "user-1",
      createdByType: "user",
    });

    expect(mockPrisma.experiment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending_start", createdByType: "user" }),
      }),
    );
  });

  it("honors explicit status override even for agents", async () => {
    await createExperiment({
      companyUuid: COMPANY,
      researchProjectUuid: PROJECT,
      title: "Agent override",
      description: "desc",
      createdByUuid: "agent-1",
      createdByType: "agent",
      status: "pending_review",
    });

    expect(mockPrisma.experiment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending_review" }),
      }),
    );
  });
});

describe("synapse_create_experiment zod default", () => {
  it("zod schema default for status is draft", async () => {
    const schema = z.object({
      researchProjectUuid: z.string(),
      title: z.string(),
      description: z.string(),
      researchQuestionUuid: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "immediate"]).default("medium"),
      status: z.enum(["draft", "pending_review"]).default("draft"),
    });

    const parsed = schema.parse({
      researchProjectUuid: PROJECT,
      title: "t",
      description: "d",
    });

    expect(parsed.status).toBe("draft");
  });
});

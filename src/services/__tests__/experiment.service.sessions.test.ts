import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  experiment: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  sessionExperimentCheckin: {
    findMany: vi.fn(),
  },
  document: {
    findFirst: vi.fn(),
  },
  experimentIncidentLesson: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/event-bus", () => ({
  eventBus: { emitChange: vi.fn() },
}));

vi.mock("@/lib/uuid-resolver", () => ({
  formatAssigneeComplete: vi.fn(async () => null),
  formatCreatedBy: vi.fn(async () => null),
  getActorName: vi.fn(async () => "Agent"),
}));

vi.mock("@/services/activity.service", () => ({
  createActivity: vi.fn(),
}));
vi.mock("@/services/document.service", () => ({
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
}));
vi.mock("@/services/notification.service", () => ({
  create: vi.fn(),
}));
vi.mock("@/services/project-synthesis.service", () => ({
  refreshProjectSynthesis: vi.fn(),
}));

import { listExperiments } from "@/services/experiment.service";

const now = new Date("2026-05-21T00:00:00Z");

function makeExperiment() {
  return {
    uuid: "exp-1",
    companyUuid: "company-1",
    researchProjectUuid: "project-1",
    researchQuestionUuid: null,
    title: "Run baseline",
    description: null,
    status: "in_progress",
    priority: "medium",
    computeBudgetHours: null,
    computeUsedHours: null,
    outcome: null,
    results: null,
    attachments: null,
    baseBranch: null,
    experimentBranch: null,
    commitSha: null,
    liveStatus: "running",
    liveMessage: "Training",
    liveUpdatedAt: now,
    assigneeType: "agent",
    assigneeUuid: "agent-1",
    assignedAt: now,
    assignedByUuid: null,
    createdByUuid: "user-1",
    createdByType: "user",
    reviewedByUuid: null,
    reviewNote: null,
    reviewedAt: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    researchQuestion: null,
  };
}

describe("experiment active sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.document.findFirst.mockResolvedValue(null);
    mockPrisma.experimentIncidentLesson.findMany.mockResolvedValue([]);
  });

  it("returns active session workers with listed experiments", async () => {
    mockPrisma.experiment.findMany.mockResolvedValue([makeExperiment()]);
    mockPrisma.experiment.count.mockResolvedValue(1);
    mockPrisma.sessionExperimentCheckin.findMany.mockResolvedValue([
      {
        sessionUuid: "session-1",
        checkinAt: now,
        session: {
          uuid: "session-1",
          name: "training-worker-1",
          status: "active",
          agentUuid: "agent-1",
          agent: { name: "Claude Code", type: "claude_code", color: "cyan" },
        },
      },
    ]);

    const result = await listExperiments({
      companyUuid: "company-1",
      researchProjectUuid: "project-1",
      skip: 0,
      take: 10,
    });

    expect(result.experiments[0].activeSessions).toEqual([
      {
        sessionUuid: "session-1",
        sessionName: "training-worker-1",
        status: "active",
        agentUuid: "agent-1",
        agentName: "Claude Code",
        agentType: "claude_code",
        agentColor: "cyan",
        checkinAt: now.toISOString(),
      },
    ]);
  });
});

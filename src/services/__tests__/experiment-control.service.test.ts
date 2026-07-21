import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetExperiment = vi.hoisted(() => vi.fn());
vi.mock("@/services/experiment.service", () => ({ getExperiment: mockGetExperiment }));

const mockNotify = vi.hoisted(() => vi.fn());
vi.mock("@/services/notification.service", () => ({ create: mockNotify }));

const mockCreateComment = vi.hoisted(() => vi.fn());
vi.mock("@/services/comment.service", () => ({ createComment: mockCreateComment }));

const mockProjectFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { researchProject: { findFirst: mockProjectFindFirst } },
}));

import {
  injectInstruction,
  requestInterrupt,
  NoAgentAssigneeError,
  ExperimentNotFoundError,
} from "@/services/experiment-control.service";

const base = { companyUuid: "c", experimentUuid: "exp-1", actorUuid: "u", actorName: "Dr. U" };

// getExperiment returns the real ExperimentResponse shape: assignee is NESTED
// ({ type, uuid, ... }), there is no top-level assigneeType/assigneeUuid, and
// there is no projectName field — the project name is fetched separately.
const agentExp = {
  uuid: "exp-1",
  title: "Run A",
  researchProjectUuid: "p1",
  assignee: { type: "agent", uuid: "agent-1", name: "Agent One" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNotify.mockResolvedValue({ uuid: "notif-1" });
  mockCreateComment.mockResolvedValue({ uuid: "cmt-1" });
  mockProjectFindFirst.mockResolvedValue({ name: "Project One" });
});

describe("injectInstruction", () => {
  it("throws when experiment missing", async () => {
    mockGetExperiment.mockResolvedValue(null);
    await expect(injectInstruction({ ...base, message: "go" })).rejects.toBeInstanceOf(
      ExperimentNotFoundError,
    );
  });

  it("throws when no agent assignee", async () => {
    mockGetExperiment.mockResolvedValue({
      ...agentExp,
      assignee: { type: "user", uuid: "u2", name: "User Two" },
    });
    await expect(injectInstruction({ ...base, message: "go" })).rejects.toBeInstanceOf(
      NoAgentAssigneeError,
    );
  });

  it("creates a comment then an experiment_instruction notification to the agent", async () => {
    mockGetExperiment.mockResolvedValue(agentExp);
    await injectInstruction({ ...base, message: "continue step 3" });
    expect(mockCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: "c",
        targetType: "experiment",
        targetUuid: "exp-1",
        content: "continue step 3",
        authorType: "user",
        authorUuid: "u",
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "experiment_instruction",
        recipientType: "agent",
        recipientUuid: "agent-1",
        entityType: "experiment",
        entityUuid: "exp-1",
        message: "continue step 3",
        projectName: "Project One",
        entityTitle: "Run A",
      }),
    );
    // comment created before notification
    expect(mockCreateComment.mock.invocationCallOrder[0]).toBeLessThan(
      mockNotify.mock.invocationCallOrder[0],
    );
  });
});

describe("requestInterrupt", () => {
  it("creates an experiment_interrupt notification, no comment", async () => {
    mockGetExperiment.mockResolvedValue(agentExp);
    await requestInterrupt({ ...base });
    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "experiment_interrupt",
        recipientType: "agent",
        recipientUuid: "agent-1",
        entityUuid: "exp-1",
      }),
    );
  });

  it("throws NoAgentAssigneeError when no agent", async () => {
    mockGetExperiment.mockResolvedValue({ ...agentExp, assignee: null });
    await expect(requestInterrupt({ ...base })).rejects.toBeInstanceOf(NoAgentAssigneeError);
  });
});

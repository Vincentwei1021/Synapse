import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Mocks (hoisted so vi.mock factories can reference them) =====

const { mockPrisma, mockEventBus, mockFormatAssigneeComplete, mockFormatCreatedBy, mockCreateActivity, mockParseMentions, mockCreateMentions } = vi.hoisted(() => ({
  mockPrisma: {
    researchQuestion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    researchProject: {
      findFirst: vi.fn(),
    },
    experimentDesign: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockEventBus: { emitChange: vi.fn() },
  mockFormatAssigneeComplete: vi.fn().mockResolvedValue(null),
  mockFormatCreatedBy: vi.fn().mockResolvedValue({ type: "user", uuid: "creator-uuid", name: "Creator" }),
  mockCreateActivity: vi.fn().mockResolvedValue(undefined),
  mockParseMentions: vi.fn().mockReturnValue([]),
  mockCreateMentions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/event-bus", () => ({ eventBus: mockEventBus }));
vi.mock("@/lib/uuid-resolver", () => ({
  formatAssigneeComplete: mockFormatAssigneeComplete,
  formatCreatedBy: mockFormatCreatedBy,
}));
vi.mock("@/services/mention.service", () => ({
  parseMentions: mockParseMentions,
  createMentions: mockCreateMentions,
}));
vi.mock("@/services/activity.service", () => ({
  createActivity: mockCreateActivity,
}));

import { createResearchQuestion, claimResearchQuestion, assignResearchQuestion, releaseResearchQuestion, moveResearchQuestion, deleteResearchQuestion, updateResearchQuestion } from "@/services/research-question.service";
import { AlreadyClaimedError } from "@/lib/errors";

// ===== Test Data =====

const COMPANY_UUID = "company-1111-1111-1111-111111111111";
const PROJECT_UUID = "project-2222-2222-2222-222222222222";
const RESEARCH_QUESTION_UUID = "idea-3333-3333-3333-333333333333";
const ACTOR_UUID = "actor-4444-4444-4444-444444444444";

const now = new Date("2026-01-15T10:00:00Z");

function makeResearchQuestionRecord(overrides: Record<string, unknown> = {}) {
  return {
    uuid: RESEARCH_QUESTION_UUID,
    title: "Test ResearchQuestion",
    content: "Some content",
    attachments: null,
    status: "open",
    elaborationStatus: null,
    elaborationDepth: null,
    assigneeType: null,
    assigneeUuid: null,
    assignedAt: null,
    assignedByUuid: null,
    createdByUuid: ACTOR_UUID,
    companyUuid: COMPANY_UUID,
    researchProjectUuid: PROJECT_UUID,
    createdAt: now,
    updatedAt: now,
    project: { uuid: PROJECT_UUID, name: "Test Project" },
    ...overrides,
  };
}

// ===== Tests =====

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createResearchQuestion", () => {
  it("should create a research question with correct defaults and emit event", async () => {
    const created = makeResearchQuestionRecord({ status: "open" });
    mockPrisma.researchQuestion.create.mockResolvedValue(created);

    const result = await createResearchQuestion({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "Test ResearchQuestion",
      content: "Some content",
      createdByUuid: ACTOR_UUID,
    });

    expect(mockPrisma.researchQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyUuid: COMPANY_UUID,
          researchProjectUuid: PROJECT_UUID,
          title: "Test ResearchQuestion",
          content: "Some content",
          status: "open",
          createdByUuid: ACTOR_UUID,
        }),
      })
    );

    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: COMPANY_UUID,
        researchProjectUuid: PROJECT_UUID,
        entityType: "research_question",
        action: "created",
      })
    );

    expect(result.uuid).toBe(RESEARCH_QUESTION_UUID);
    expect(result.title).toBe("Test ResearchQuestion");
    expect(result.status).toBe("open");
  });

  it("should handle null content", async () => {
    const created = makeResearchQuestionRecord({ content: null });
    mockPrisma.researchQuestion.create.mockResolvedValue(created);

    const result = await createResearchQuestion({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "No Content ResearchQuestion",
      content: null,
      createdByUuid: ACTOR_UUID,
    });

    expect(result.content).toBeNull();
  });
});

describe("claimResearchQuestion", () => {
  it("should transition open research question to elaborating and set assignee", async () => {
    const existing = makeResearchQuestionRecord({ status: "open", assigneeUuid: null });
    const claimed = makeResearchQuestionRecord({
      status: "elaborating",
      assigneeType: "agent",
      assigneeUuid: ACTOR_UUID,
      assignedAt: now,
      assignedByUuid: null,
    });

    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(claimed);

    const result = await claimResearchQuestion({
      researchQuestionUuid: RESEARCH_QUESTION_UUID,
      companyUuid: COMPANY_UUID,
      assigneeType: "agent",
      assigneeUuid: ACTOR_UUID,
    });

    expect(mockPrisma.researchQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RESEARCH_QUESTION_UUID },
        data: expect.objectContaining({
          status: "elaborating",
          assigneeType: "agent",
          assigneeUuid: ACTOR_UUID,
        }),
      })
    );

    expect(result.status).toBe("elaborating");
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should throw AlreadyClaimedError if research question is already claimed", async () => {
    const existing = makeResearchQuestionRecord({
      status: "elaborating",
      assigneeUuid: "other-agent-uuid",
    });
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);

    await expect(
      claimResearchQuestion({
        researchQuestionUuid: RESEARCH_QUESTION_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "agent",
        assigneeUuid: ACTOR_UUID,
      })
    ).rejects.toThrow(AlreadyClaimedError);
  });

  it("should throw AlreadyClaimedError if research question not found", async () => {
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(null);

    await expect(
      claimResearchQuestion({
        researchQuestionUuid: RESEARCH_QUESTION_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "agent",
        assigneeUuid: ACTOR_UUID,
      })
    ).rejects.toThrow(AlreadyClaimedError);
  });

  it("should throw if research question is completed or closed", async () => {
    const existing = makeResearchQuestionRecord({ status: "completed", assigneeUuid: null });
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);

    await expect(
      claimResearchQuestion({
        researchQuestionUuid: RESEARCH_QUESTION_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "agent",
        assigneeUuid: ACTOR_UUID,
      })
    ).rejects.toThrow("Cannot claim a completed or closed ResearchQuestion");
  });
});

describe("assignResearchQuestion", () => {
  it("should transition open research question to elaborating and set assignee", async () => {
    const existing = makeResearchQuestionRecord({ status: "open", assigneeUuid: null });
    const assigned = makeResearchQuestionRecord({
      status: "elaborating",
      assigneeType: "user",
      assigneeUuid: ACTOR_UUID,
      assignedAt: now,
      assignedByUuid: "admin-uuid",
    });

    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(assigned);

    const result = await assignResearchQuestion({
      researchQuestionUuid: RESEARCH_QUESTION_UUID,
      companyUuid: COMPANY_UUID,
      assigneeType: "user",
      assigneeUuid: ACTOR_UUID,
      assignedByUuid: "admin-uuid",
    });

    expect(mockPrisma.researchQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RESEARCH_QUESTION_UUID },
        data: expect.objectContaining({
          status: "elaborating",
          assigneeType: "user",
          assigneeUuid: ACTOR_UUID,
        }),
      })
    );

    expect(result.status).toBe("elaborating");
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should keep current status when reassigning non-open research question", async () => {
    const existing = makeResearchQuestionRecord({
      status: "proposal_created",
      assigneeType: "agent",
      assigneeUuid: "old-agent-uuid",
    });
    const assigned = makeResearchQuestionRecord({
      status: "proposal_created",
      assigneeType: "user",
      assigneeUuid: ACTOR_UUID,
      assignedAt: now,
      assignedByUuid: "admin-uuid",
    });

    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(assigned);

    const result = await assignResearchQuestion({
      researchQuestionUuid: RESEARCH_QUESTION_UUID,
      companyUuid: COMPANY_UUID,
      assigneeType: "user",
      assigneeUuid: ACTOR_UUID,
      assignedByUuid: "admin-uuid",
    });

    expect(mockPrisma.researchQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "proposal_created", // Should keep existing status
        }),
      })
    );

    expect(result.status).toBe("proposal_created");
  });

  it("should throw if research question not found", async () => {
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(null);

    await expect(
      assignResearchQuestion({
        researchQuestionUuid: RESEARCH_QUESTION_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "user",
        assigneeUuid: ACTOR_UUID,
      })
    ).rejects.toThrow("ResearchQuestion not found");
  });

  it("should throw if research question is completed", async () => {
    const existing = makeResearchQuestionRecord({ status: "completed" });
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);

    await expect(
      assignResearchQuestion({
        researchQuestionUuid: RESEARCH_QUESTION_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "user",
        assigneeUuid: ACTOR_UUID,
      })
    ).rejects.toThrow("Cannot assign a completed or closed ResearchQuestion");
  });

  it("should throw if research question is closed", async () => {
    const existing = makeResearchQuestionRecord({ status: "closed" });
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(existing);

    await expect(
      assignResearchQuestion({
        researchQuestionUuid: RESEARCH_QUESTION_UUID,
        companyUuid: COMPANY_UUID,
        assigneeType: "user",
        assigneeUuid: ACTOR_UUID,
      })
    ).rejects.toThrow("Cannot assign a completed or closed ResearchQuestion");
  });
});

describe("releaseResearchQuestion", () => {
  it("should clear assignee and reset to open", async () => {
    const existing = makeResearchQuestionRecord({
      status: "elaborating",
      assigneeType: "agent",
      assigneeUuid: ACTOR_UUID,
    });
    const released = makeResearchQuestionRecord({
      status: "open",
      assigneeType: null,
      assigneeUuid: null,
      assignedAt: null,
      assignedByUuid: null,
      elaborationDepth: null,
      elaborationStatus: null,
    });

    mockPrisma.researchQuestion.findUnique.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(released);

    const result = await releaseResearchQuestion(RESEARCH_QUESTION_UUID);

    expect(mockPrisma.researchQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RESEARCH_QUESTION_UUID },
        data: expect.objectContaining({
          status: "open",
          assigneeType: null,
          assigneeUuid: null,
          assignedAt: null,
          assignedByUuid: null,
          elaborationDepth: null,
          elaborationStatus: null,
        }),
      })
    );

    expect(result.status).toBe("open");
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should throw if research question not found", async () => {
    mockPrisma.researchQuestion.findUnique.mockResolvedValue(null);

    await expect(releaseResearchQuestion(RESEARCH_QUESTION_UUID)).rejects.toThrow("ResearchQuestion not found");
  });

  it("should throw if research question is closed", async () => {
    mockPrisma.researchQuestion.findUnique.mockResolvedValue(makeResearchQuestionRecord({ status: "closed" }));

    await expect(releaseResearchQuestion(RESEARCH_QUESTION_UUID)).rejects.toThrow(
      "Cannot release a completed or closed ResearchQuestion"
    );
  });
});

describe("moveResearchQuestion", () => {
  const TARGET_PROJECT_UUID = "target-5555-5555-5555-555555555555";

  it("should move research question to target project and log activity", async () => {
    const idea = makeResearchQuestionRecord();
    const targetProject = { uuid: TARGET_PROJECT_UUID, name: "Target Project" };
    const movedIdea = makeResearchQuestionRecord({
      researchProjectUuid: TARGET_PROJECT_UUID,
      project: targetProject,
    });

    mockPrisma.researchQuestion.findFirst
      .mockResolvedValueOnce(idea)
      .mockResolvedValueOnce(movedIdea);
    mockPrisma.researchProject.findFirst.mockResolvedValue(targetProject);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<void>) => {
      await fn(mockPrisma);
    });

    const result = await moveResearchQuestion(
      COMPANY_UUID,
      RESEARCH_QUESTION_UUID,
      TARGET_PROJECT_UUID,
      ACTOR_UUID,
      "user"
    );

    expect(mockPrisma.researchQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RESEARCH_QUESTION_UUID },
        data: { researchProjectUuid: TARGET_PROJECT_UUID },
      })
    );
    expect(mockPrisma.experimentDesign.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { researchProjectUuid: TARGET_PROJECT_UUID },
      })
    );

    expect(mockCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "moved",
        value: expect.objectContaining({
          fromProjectUuid: PROJECT_UUID,
          toProjectUuid: TARGET_PROJECT_UUID,
        }),
      })
    );

    expect(mockEventBus.emitChange).toHaveBeenCalledTimes(2);
    expect(result.uuid).toBe(RESEARCH_QUESTION_UUID);
  });

  it("should throw if research question not found", async () => {
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(null);

    await expect(
      moveResearchQuestion(COMPANY_UUID, RESEARCH_QUESTION_UUID, TARGET_PROJECT_UUID, ACTOR_UUID)
    ).rejects.toThrow("ResearchQuestion not found");
  });

  it("should throw if target project not found", async () => {
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(makeResearchQuestionRecord());
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);

    await expect(
      moveResearchQuestion(COMPANY_UUID, RESEARCH_QUESTION_UUID, TARGET_PROJECT_UUID, ACTOR_UUID)
    ).rejects.toThrow("Target project not found");
  });

  it("should throw if idea is already in target project", async () => {
    mockPrisma.researchQuestion.findFirst.mockResolvedValue(makeResearchQuestionRecord());
    mockPrisma.researchProject.findFirst.mockResolvedValue({
      uuid: PROJECT_UUID,
      name: "Same Project",
    });

    await expect(
      moveResearchQuestion(COMPANY_UUID, RESEARCH_QUESTION_UUID, PROJECT_UUID, ACTOR_UUID)
    ).rejects.toThrow("ResearchQuestion is already in the target project");
  });
});

describe("updateResearchQuestion", () => {
  it("should update research question title and emit change event", async () => {
    const updated = makeResearchQuestionRecord({ title: "Updated Title" });
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    const result = await updateResearchQuestion(RESEARCH_QUESTION_UUID, COMPANY_UUID, { title: "Updated Title" });

    expect(mockPrisma.researchQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: RESEARCH_QUESTION_UUID },
        data: { title: "Updated Title" },
      })
    );
    expect(result.title).toBe("Updated Title");
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should update research question status", async () => {
    const updated = makeResearchQuestionRecord({ status: "proposal_created" });
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    const result = await updateResearchQuestion(RESEARCH_QUESTION_UUID, COMPANY_UUID, { status: "proposal_created" });

    expect(result.status).toBe("proposal_created");
  });

  it("should process new mentions when content updated with actor context", async () => {
    const oldContent = "Old content with @user[old-user-uuid]";
    const newContent = "New content with @user[new-user-uuid] and @agent[agent-uuid]";

    const existing = makeResearchQuestionRecord({ content: oldContent });
    const updated = makeResearchQuestionRecord({ content: newContent });

    mockPrisma.researchQuestion.findUnique.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    mockParseMentions
      .mockReturnValueOnce([{ type: "user", uuid: "old-user-uuid", displayName: "Old User" }])
      .mockReturnValueOnce([
        { type: "user", uuid: "new-user-uuid", displayName: "New User" },
        { type: "agent", uuid: "agent-uuid", displayName: "Test Agent" },
      ]);

    await updateResearchQuestion(
      RESEARCH_QUESTION_UUID,
      COMPANY_UUID,
      { content: newContent },
      { actorType: "user", actorUuid: ACTOR_UUID }
    );

    // Should parse old and new content
    expect(mockParseMentions).toHaveBeenCalledWith(oldContent);
    expect(mockParseMentions).toHaveBeenCalledWith(newContent);

    // Should create mentions for the new content
    expect(mockCreateMentions).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: COMPANY_UUID,
        sourceType: "research_question",
        sourceUuid: RESEARCH_QUESTION_UUID,
        content: newContent,
        actorType: "user",
        actorUuid: ACTOR_UUID,
      })
    );

    // Should create activity for each new mention (2 new mentions)
    expect(mockCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mentioned",
        value: expect.objectContaining({
          mentionedType: "user",
          mentionedUuid: "new-user-uuid",
          mentionedName: "New User",
        }),
      })
    );
    expect(mockCreateActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mentioned",
        value: expect.objectContaining({
          mentionedType: "agent",
          mentionedUuid: "agent-uuid",
          mentionedName: "Test Agent",
        }),
      })
    );
  });

  it("should skip mention processing when no actor context provided", async () => {
    const updated = makeResearchQuestionRecord({ content: "Content with @user[user-uuid]" });
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    await updateResearchQuestion(RESEARCH_QUESTION_UUID, COMPANY_UUID, {
      content: "Content with @user[user-uuid]",
    });

    expect(mockPrisma.researchQuestion.findUnique).not.toHaveBeenCalled();
    expect(mockParseMentions).not.toHaveBeenCalled();
    expect(mockCreateMentions).not.toHaveBeenCalled();
  });

  it("should skip mention processing when content is undefined", async () => {
    const updated = makeResearchQuestionRecord();
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    await updateResearchQuestion(
      RESEARCH_QUESTION_UUID,
      COMPANY_UUID,
      { title: "Updated Title" },
      { actorType: "user", actorUuid: ACTOR_UUID }
    );

    expect(mockPrisma.researchQuestion.findUnique).not.toHaveBeenCalled();
    expect(mockCreateMentions).not.toHaveBeenCalled();
  });

  it("should skip mention processing when content is null", async () => {
    const existing = makeResearchQuestionRecord({ content: "Old content" });
    const updated = makeResearchQuestionRecord({ content: null });

    mockPrisma.researchQuestion.findUnique.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    await updateResearchQuestion(
      RESEARCH_QUESTION_UUID,
      COMPANY_UUID,
      { content: null },
      { actorType: "user", actorUuid: ACTOR_UUID }
    );

    // findUnique is called to fetch old content, but then processing is skipped because new content is null/falsy
    expect(mockPrisma.researchQuestion.findUnique).toHaveBeenCalled();
    expect(mockCreateMentions).not.toHaveBeenCalled();
  });

  it("should skip mention processing when content is empty string", async () => {
    const existing = makeResearchQuestionRecord({ content: "Old content" });
    const updated = makeResearchQuestionRecord({ content: "" });

    mockPrisma.researchQuestion.findUnique.mockResolvedValue(existing);
    mockPrisma.researchQuestion.update.mockResolvedValue(updated);

    await updateResearchQuestion(
      RESEARCH_QUESTION_UUID,
      COMPANY_UUID,
      { content: "" },
      { actorType: "user", actorUuid: ACTOR_UUID }
    );

    // findUnique is called, but processing is skipped because content is empty
    expect(mockPrisma.researchQuestion.findUnique).toHaveBeenCalled();
    expect(mockCreateMentions).not.toHaveBeenCalled();
  });
});

describe("deleteResearchQuestion", () => {
  it("should delete research question and emit event", async () => {
    const deleted = makeResearchQuestionRecord();
    mockPrisma.researchQuestion.delete.mockResolvedValue(deleted);

    const result = await deleteResearchQuestion(RESEARCH_QUESTION_UUID);

    expect(mockPrisma.researchQuestion.delete).toHaveBeenCalledWith({
      where: { uuid: RESEARCH_QUESTION_UUID },
    });
    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: COMPANY_UUID,
        entityType: "research_question",
        action: "deleted",
      })
    );
    expect(result.uuid).toBe(RESEARCH_QUESTION_UUID);
  });
});

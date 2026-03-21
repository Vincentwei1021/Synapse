/**
 * experiment-design.service.test.ts — Unit tests for experiment-design.service with Prisma mocking.
 *
 * Tests cover: createExperimentDesign, addRunDraft, addDocumentDraft, updateRunDraft,
 * updateDocumentDraft, removeRunDraft, removeDocumentDraft, submitExperimentDesign,
 * validateExperimentDesign (10+ business rules), approveExperimentDesign, rejectExperimentDesign, closeExperimentDesign.
 *
 * Pure function tests (ensureDocumentDraftUuid, ensureTaskDraftUuid) live in
 * experiment-design.service.pure.test.ts — not duplicated here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Hoisted mocks (vi.mock factories are hoisted above all imports) =====

const { mockPrisma, mockEventBus, mockFormatCreatedBy, mockFormatReview, mockCreateDoc, mockCreateExperimentRuns } = vi.hoisted(() => {
  const mockPrisma = {
    experimentDesign: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    researchQuestion: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    runDependency: {
      create: vi.fn(),
    },
    acceptanceCriterion: {
      createMany: vi.fn(),
    },
    experimentRun: {
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const mockEventBus = { emitChange: vi.fn() };
  const mockFormatCreatedBy = vi.fn().mockResolvedValue({ type: "agent", uuid: "actor-uuid", name: "Agent" });
  const mockFormatReview = vi.fn().mockResolvedValue(null);
  const mockCreateDoc = vi.fn().mockResolvedValue({});
  const mockCreateExperimentRuns = vi.fn().mockResolvedValue({ draftToTaskUuidMap: new Map() });
  return { mockPrisma, mockEventBus, mockFormatCreatedBy, mockFormatReview, mockCreateDoc, mockCreateExperimentRuns };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    JsonNull: "DbNull",
    InputJsonValue: {},
  },
}));
vi.mock("@/lib/event-bus", () => ({ eventBus: mockEventBus }));
vi.mock("@/lib/uuid-resolver", () => ({
  formatCreatedBy: mockFormatCreatedBy,
  formatReview: mockFormatReview,
}));
vi.mock("@/services/document.service", () => ({
  createDocumentFromExperimentDesign: mockCreateDoc,
}));
vi.mock("@/services/experiment-run.service", () => ({
  createExperimentRunsFromDesign: mockCreateExperimentRuns,
}));

import {
  createExperimentDesign,
  listExperimentDesigns,
  getExperimentDesign,
  getExperimentDesignByUuid,
  addDocumentDraft,
  addRunDraft,
  updateDocumentDraft,
  updateRunDraft,
  removeDocumentDraft,
  removeRunDraft,
  updateExperimentDesignContent,
  submitExperimentDesign,
  validateExperimentDesign,
  approveExperimentDesign,
  rejectExperimentDesign,
  closeExperimentDesign,
  deleteExperimentDesign,
  getProjectExperimentDesigns,
} from "@/services/experiment-design.service";
import { makeExperimentDesign } from "@/__test-utils__/fixtures";

// ===== Helpers =====

const COMPANY_UUID = "00000000-0000-0000-0000-000000000001";
const PROJECT_UUID = "00000000-0000-0000-0000-000000000010";
const ACTOR_UUID = "00000000-0000-0000-0000-000000000002";

/** A minimal valid proposal DB row for mocking findFirst/create returns */
function dbExperimentDesign(overrides: Record<string, unknown> = {}) {
  return makeExperimentDesign({
    companyUuid: COMPANY_UUID,
    researchProjectUuid: PROJECT_UUID,
    createdByUuid: ACTOR_UUID,
    ...overrides,
  });
}

/** A long string (>= 100 chars) for document content */
const LONG_CONTENT = "x".repeat(120);

/** A valid document draft */
function validDocDraft(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "doc-draft-1",
    type: "prd",
    title: "PRD",
    content: LONG_CONTENT,
    ...overrides,
  };
}

/** A valid task draft with acceptance criteria */
function validTaskDraft(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "task-draft-1",
    title: "Task 1",
    description: "Implement feature",
    priority: "medium",
    computeBudgetHours: 3,
    acceptanceCriteriaItems: [{ description: "Done", required: true }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock implementations that vi.clearAllMocks removes
  mockFormatCreatedBy.mockResolvedValue({ type: "agent", uuid: "actor-uuid", name: "Agent" });
  mockFormatReview.mockResolvedValue(null);
  mockCreateDoc.mockResolvedValue({});
  mockCreateExperimentRuns.mockResolvedValue({ draftToTaskUuidMap: new Map() });
  // Default: idea.findMany returns empty array (needed when validateExperimentDesign
  // checks E5 for idea-type proposals)
  mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
});

// ====================================================================
// createExperimentDesign
// ====================================================================

describe("createExperimentDesign", () => {
  it("should create a proposal and emit an event", async () => {
    const created = dbExperimentDesign({ status: "draft" });
    mockPrisma.experimentDesign.create.mockResolvedValue(created);

    const result = await createExperimentDesign({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "Test ExperimentDesign",
      inputType: "research_question",
      inputUuids: ["idea-1"],
      createdByUuid: ACTOR_UUID,
    });

    expect(mockPrisma.experimentDesign.create).toHaveBeenCalledOnce();
    expect(result.uuid).toBe(created.uuid);
    expect(result.status).toBe("draft");
    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "experiment_design", action: "created" })
    );
  });

  it("should auto-generate UUIDs for drafts when not provided", async () => {
    const created = dbExperimentDesign();
    mockPrisma.experimentDesign.create.mockResolvedValue(created);

    await createExperimentDesign({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "Proposal",
      inputType: "research_question",
      inputUuids: ["idea-1"],
      createdByUuid: ACTOR_UUID,
      documentDrafts: [{ type: "prd", title: "PRD", content: "Content" }],
      taskDrafts: [{ title: "Task 1" }],
    });

    const callData = mockPrisma.experimentDesign.create.mock.calls[0][0].data;
    expect(callData.documentDrafts[0].uuid).toBeDefined();
    expect(callData.taskDrafts[0].uuid).toBeDefined();
  });

  it("should default createdByType to 'agent' when not specified", async () => {
    mockPrisma.experimentDesign.create.mockResolvedValue(dbExperimentDesign());

    await createExperimentDesign({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      title: "Test",
      inputType: "research_question",
      inputUuids: [],
      createdByUuid: ACTOR_UUID,
    });

    const callData = mockPrisma.experimentDesign.create.mock.calls[0][0].data;
    expect(callData.createdByType).toBe("agent");
  });
});

// ====================================================================
// addDocumentDraft
// ====================================================================

describe("addDocumentDraft", () => {
  it("should append a new document draft to an existing proposal", async () => {
    const proposal = dbExperimentDesign({ documentDrafts: [validDocDraft()] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await addDocumentDraft("proposal-uuid", COMPANY_UUID, {
      type: "tech_design",
      title: "Tech Design",
      content: "Design content",
    });

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.documentDrafts).toHaveLength(2);
    expect(updateCall.data.documentDrafts[1].type).toBe("tech_design");
    expect(updateCall.data.documentDrafts[1].uuid).toBeDefined();
  });

  it("should throw if proposal is not in draft status", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      addDocumentDraft("proposal-uuid", COMPANY_UUID, {
        type: "prd",
        title: "PRD",
        content: "Content",
      })
    ).rejects.toThrow("ExperimentDesign not found or not in draft status");
  });

  it("should handle proposal with null documentDrafts", async () => {
    const proposal = dbExperimentDesign({ documentDrafts: null });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await addDocumentDraft("proposal-uuid", COMPANY_UUID, {
      type: "prd",
      title: "PRD",
      content: "Content",
    });

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.documentDrafts).toHaveLength(1);
  });
});

// ====================================================================
// addRunDraft
// ====================================================================

describe("addRunDraft", () => {
  it("should append a new task draft to an existing proposal", async () => {
    const proposal = dbExperimentDesign({ taskDrafts: [validTaskDraft()] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await addRunDraft("proposal-uuid", COMPANY_UUID, {
      title: "Task 2",
      description: "Second task",
    });

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.taskDrafts).toHaveLength(2);
    expect(updateCall.data.taskDrafts[1].title).toBe("Task 2");
    expect(updateCall.data.taskDrafts[1].uuid).toBeDefined();
  });

  it("should throw if proposal is not found or not in draft status", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      addRunDraft("proposal-uuid", COMPANY_UUID, { title: "Task" })
    ).rejects.toThrow("ExperimentDesign not found or not in draft status");
  });

  it("should handle proposal with null taskDrafts", async () => {
    const proposal = dbExperimentDesign({ taskDrafts: null });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await addRunDraft("proposal-uuid", COMPANY_UUID, { title: "Task 1" });

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.taskDrafts).toHaveLength(1);
  });
});

// ====================================================================
// updateDocumentDraft
// ====================================================================

describe("updateDocumentDraft", () => {
  it("should update fields on an existing document draft", async () => {
    const draft = validDocDraft({ uuid: "dd-1" });
    const proposal = dbExperimentDesign({ documentDrafts: [draft] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await updateDocumentDraft("proposal-uuid", COMPANY_UUID, "dd-1", {
      title: "Updated PRD",
      content: "New content",
    });

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.documentDrafts[0].title).toBe("Updated PRD");
    expect(updateCall.data.documentDrafts[0].content).toBe("New content");
  });

  it("should throw if document draft UUID is not found", async () => {
    const proposal = dbExperimentDesign({ documentDrafts: [validDocDraft({ uuid: "dd-1" })] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    await expect(
      updateDocumentDraft("proposal-uuid", COMPANY_UUID, "nonexistent", { title: "X" })
    ).rejects.toThrow("Document draft not found");
  });

  it("should throw if proposal is not in draft status", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      updateDocumentDraft("proposal-uuid", COMPANY_UUID, "dd-1", { title: "X" })
    ).rejects.toThrow("ExperimentDesign not found or not in draft status");
  });
});

// ====================================================================
// updateRunDraft
// ====================================================================

describe("updateRunDraft", () => {
  it("should update fields on an existing task draft", async () => {
    const draft = validTaskDraft({ uuid: "td-1" });
    const proposal = dbExperimentDesign({ taskDrafts: [draft] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await updateRunDraft("proposal-uuid", COMPANY_UUID, "td-1", {
      title: "Updated Task",
      priority: "high",
    });

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.taskDrafts[0].title).toBe("Updated Task");
    expect(updateCall.data.taskDrafts[0].priority).toBe("high");
  });

  it("should throw if task draft UUID is not found", async () => {
    const proposal = dbExperimentDesign({ taskDrafts: [validTaskDraft({ uuid: "td-1" })] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    await expect(
      updateRunDraft("proposal-uuid", COMPANY_UUID, "nonexistent", { title: "X" })
    ).rejects.toThrow("Run draft not found");
  });

  it("should throw if proposal is not in draft status", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      updateRunDraft("proposal-uuid", COMPANY_UUID, "td-1", { title: "X" })
    ).rejects.toThrow("ExperimentDesign not found or not in draft status");
  });
});

// ====================================================================
// removeDocumentDraft
// ====================================================================

describe("removeDocumentDraft", () => {
  it("should remove a document draft by UUID", async () => {
    const drafts = [
      validDocDraft({ uuid: "dd-1" }),
      validDocDraft({ uuid: "dd-2", title: "Second" }),
    ];
    const proposal = dbExperimentDesign({ documentDrafts: drafts });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await removeDocumentDraft("proposal-uuid", COMPANY_UUID, "dd-1");

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.documentDrafts).toHaveLength(1);
    expect(updateCall.data.documentDrafts[0].uuid).toBe("dd-2");
  });

  it("should set documentDrafts to JsonNull when last draft is removed", async () => {
    const proposal = dbExperimentDesign({ documentDrafts: [validDocDraft({ uuid: "dd-1" })] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await removeDocumentDraft("proposal-uuid", COMPANY_UUID, "dd-1");

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.documentDrafts).toBe("DbNull"); // Prisma.JsonNull
  });

  it("should throw if proposal is not in draft status", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      removeDocumentDraft("proposal-uuid", COMPANY_UUID, "dd-1")
    ).rejects.toThrow("ExperimentDesign not found or not in draft status");
  });
});

// ====================================================================
// removeRunDraft
// ====================================================================

describe("removeRunDraft", () => {
  it("should remove a task draft by UUID", async () => {
    const drafts = [
      validTaskDraft({ uuid: "td-1" }),
      validTaskDraft({ uuid: "td-2", title: "Second" }),
    ];
    const proposal = dbExperimentDesign({ taskDrafts: drafts });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await removeRunDraft("proposal-uuid", COMPANY_UUID, "td-1");

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.taskDrafts).toHaveLength(1);
    expect(updateCall.data.taskDrafts[0].uuid).toBe("td-2");
  });

  it("should set taskDrafts to JsonNull when last draft is removed", async () => {
    const proposal = dbExperimentDesign({ taskDrafts: [validTaskDraft({ uuid: "td-1" })] });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await removeRunDraft("proposal-uuid", COMPANY_UUID, "td-1");

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    expect(updateCall.data.taskDrafts).toBe("DbNull");
  });

  it("should clean up dependsOnDraftUuids references to the removed draft", async () => {
    const drafts = [
      validTaskDraft({ uuid: "td-1" }),
      validTaskDraft({ uuid: "td-2", dependsOnDraftUuids: ["td-1", "td-3"] }),
      validTaskDraft({ uuid: "td-3", dependsOnDraftUuids: ["td-1"] }),
    ];
    const proposal = dbExperimentDesign({ taskDrafts: drafts });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue(proposal);

    await removeRunDraft("proposal-uuid", COMPANY_UUID, "td-1");

    const updateCall = mockPrisma.experimentDesign.update.mock.calls[0][0];
    const remaining = updateCall.data.taskDrafts;
    expect(remaining).toHaveLength(2);
    // td-2 should have td-1 removed from deps, keeping td-3
    expect(remaining[0].dependsOnDraftUuids).toEqual(["td-3"]);
    // td-3 should have td-1 removed, leaving empty
    expect(remaining[1].dependsOnDraftUuids).toEqual([]);
  });

  it("should throw if proposal is not in draft status", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      removeRunDraft("proposal-uuid", COMPANY_UUID, "td-1")
    ).rejects.toThrow("ExperimentDesign not found or not in draft status");
  });
});

// ====================================================================
// validateExperimentDesign — 10+ distinct business rules
// ====================================================================

describe("validateExperimentDesign", () => {
  it("should throw if proposal not found", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      validateExperimentDesign(COMPANY_UUID, "nonexistent")
    ).rejects.toThrow("ExperimentDesign not found");
  });

  it("E1: should error when no document drafts at all", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e1 = result.issues.find((i) => i.id === "E1");
    expect(e1).toBeDefined();
    expect(e1!.level).toBe("error");
    expect(result.valid).toBe(false);
  });

  it("E1: should pass when non-PRD document draft exists", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft({ type: "tech_design" })],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e1 = result.issues.find((i) => i.id === "E1");
    expect(e1).toBeUndefined();
  });

  it("E2: should error when document draft content < 100 chars", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft({ content: "short" })],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e2 = result.issues.find((i) => i.id === "E2");
    expect(e2).toBeDefined();
    expect(e2!.level).toBe("error");
    expect(e2!.field).toBe("PRD");
  });

  it("E2: should error when document draft has empty content", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft({ content: "" })],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    expect(result.issues.some((i) => i.id === "E2")).toBe(true);
  });

  it("E3: should error when no task drafts", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e3 = result.issues.find((i) => i.id === "E3");
    expect(e3).toBeDefined();
    expect(e3!.level).toBe("error");
  });

  it("E4: should error when inputUuids is empty", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      inputUuids: [],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e4 = result.issues.find((i) => i.id === "E4");
    expect(e4).toBeDefined();
    expect(e4!.level).toBe("error");
  });

  it("E5: should error when input idea has unresolved elaboration", async () => {
    const proposal = dbExperimentDesign({
      inputType: "research_question",
      inputUuids: ["idea-1"],
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      { uuid: "idea-1", title: "My Idea", elaborationStatus: "pending" },
    ]);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e5 = result.issues.find((i) => i.id === "E5");
    expect(e5).toBeDefined();
    expect(e5!.level).toBe("error");
    expect(e5!.message).toContain("unresolved elaboration");
  });

  it("E5: should not error when input idea has resolved elaboration", async () => {
    const proposal = dbExperimentDesign({
      inputType: "research_question",
      inputUuids: ["idea-1"],
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      { uuid: "idea-1", title: "My Idea", elaborationStatus: "resolved" },
    ]);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e5 = result.issues.find((i) => i.id === "E5");
    expect(e5).toBeUndefined();
  });

  it("E5: should skip idea elaboration check for non-idea input types", async () => {
    const proposal = dbExperimentDesign({
      inputType: "manual",
      inputUuids: ["source-1"],
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    expect(mockPrisma.researchQuestion.findMany).not.toHaveBeenCalled();
    const e5 = result.issues.find((i) => i.id === "E5");
    expect(e5).toBeUndefined();
  });

  it("E-AC: should error when task draft has no acceptance criteria", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [
        validTaskDraft({
          uuid: "td-no-ac",
          title: "No AC Task",
          acceptanceCriteria: null,
          acceptanceCriteriaItems: undefined,
        }),
      ],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const eac = result.issues.find((i) => i.id === "E-AC");
    expect(eac).toBeDefined();
    expect(eac!.level).toBe("error");
    expect(eac!.field).toBe("No AC Task");
  });

  it("E-AC: should pass when task draft has structured acceptanceCriteriaItems", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [
        validTaskDraft({
          acceptanceCriteria: null,
          acceptanceCriteriaItems: [{ description: "It works", required: true }],
        }),
      ],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const eac = result.issues.find((i) => i.id === "E-AC");
    expect(eac).toBeUndefined();
  });

  it("E-AC: should error when task draft has only legacy acceptanceCriteria (no structured items)", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [
        validTaskDraft({
          acceptanceCriteria: "- [ ] Something done",
          acceptanceCriteriaItems: undefined,
        }),
      ],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const eac = result.issues.find((i) => i.id === "E-AC");
    expect(eac).toBeDefined();
    expect(eac!.level).toBe("error");
  });

  it("W1: should warn when no tech_design document draft", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft({ type: "prd" })],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w1 = result.issues.find((i) => i.id === "W1");
    expect(w1).toBeDefined();
    expect(w1!.level).toBe("warning");
  });

  it("W1: should not warn when tech_design is present", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [
        validDocDraft({ type: "prd" }),
        validDocDraft({ uuid: "dd-2", type: "tech_design", title: "Design" }),
      ],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w1 = result.issues.find((i) => i.id === "W1");
    expect(w1).toBeUndefined();
  });

  it("W2: should warn when task draft has empty description", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft({ description: "" })],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w2 = result.issues.find((i) => i.id === "W2");
    expect(w2).toBeDefined();
    expect(w2!.level).toBe("warning");
  });

  it("W2: should warn when task draft description is missing", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft({ description: undefined })],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w2 = result.issues.find((i) => i.id === "W2");
    expect(w2).toBeDefined();
  });

  it("W4: should warn when >= 2 tasks but none have dependencies", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [
        validTaskDraft({ uuid: "td-1" }),
        validTaskDraft({ uuid: "td-2", title: "Task 2" }),
      ],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w4 = result.issues.find((i) => i.id === "W4");
    expect(w4).toBeDefined();
    expect(w4!.level).toBe("warning");
  });

  it("W4: should not warn when at least one task has dependencies", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [
        validTaskDraft({ uuid: "td-1" }),
        validTaskDraft({ uuid: "td-2", title: "Task 2", dependsOnDraftUuids: ["td-1"] }),
      ],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w4 = result.issues.find((i) => i.id === "W4");
    expect(w4).toBeUndefined();
  });

  it("W4: should not warn when only 1 task (no need for deps)", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w4 = result.issues.find((i) => i.id === "W4");
    expect(w4).toBeUndefined();
  });

  it("W5: should warn when proposal description is empty", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w5 = result.issues.find((i) => i.id === "W5");
    expect(w5).toBeDefined();
    expect(w5!.level).toBe("warning");
  });

  it("W5: should warn when proposal description is null", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: null,
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const w5 = result.issues.find((i) => i.id === "W5");
    expect(w5).toBeDefined();
  });

  it("I1: should info when task draft has no priority", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft({ priority: undefined })],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const i1 = result.issues.find((i) => i.id === "I1");
    expect(i1).toBeDefined();
    expect(i1!.level).toBe("info");
  });

  it("I2: should info when task draft has no computeBudgetHours", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft({ computeBudgetHours: undefined })],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const i2 = result.issues.find((i) => i.id === "I2");
    expect(i2).toBeDefined();
    expect(i2!.level).toBe("info");
  });

  it("should return valid=true when only warnings and info (no errors)", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [validDocDraft({ type: "prd" })],
      taskDrafts: [
        validTaskDraft({ description: "", priority: undefined, computeBudgetHours: undefined }),
      ],
      inputUuids: ["idea-1"],
      description: "",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    // Has W1, W2, W5, I1, I2 but no errors
    expect(result.valid).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((i) => i.level !== "error")).toBe(true);
  });

  it("should return valid=false when there are error-level issues", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [],
      taskDrafts: [],
      inputUuids: [],
      description: "",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.level === "error")).toBe(true);
  });

  it("should report multiple errors for multiple invalid document drafts", async () => {
    const proposal = dbExperimentDesign({
      documentDrafts: [
        validDocDraft({ uuid: "dd-1", title: "Short Doc 1", content: "a" }),
        validDocDraft({ uuid: "dd-2", title: "Short Doc 2", content: "b" }),
      ],
      taskDrafts: [validTaskDraft()],
      inputUuids: ["idea-1"],
      description: "Has description",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await validateExperimentDesign(COMPANY_UUID, proposal.uuid);
    const e2Issues = result.issues.filter((i) => i.id === "E2");
    expect(e2Issues).toHaveLength(2);
  });
});

// ====================================================================
// submitExperimentDesign
// ====================================================================

describe("submitExperimentDesign", () => {
  it("should throw if proposal not found", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      submitExperimentDesign("nonexistent", COMPANY_UUID)
    ).rejects.toThrow("ExperimentDesign not found");
  });

  it("should throw if proposal is not in draft status", async () => {
    const proposal = dbExperimentDesign({ status: "pending" });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    await expect(
      submitExperimentDesign(proposal.uuid, COMPANY_UUID)
    ).rejects.toThrow("Only draft experiment designs can be submitted for review");
  });

  it("should throw with validation errors if proposal fails validation", async () => {
    // findFirst is called by submitExperimentDesign, then again by validateExperimentDesign
    const proposal = dbExperimentDesign({
      status: "draft",
      documentDrafts: [],
      taskDrafts: [],
      inputUuids: [],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    await expect(
      submitExperimentDesign(proposal.uuid, COMPANY_UUID)
    ).rejects.toThrow("ExperimentDesign validation failed");
  });

  it("should transition to pending status on valid proposal", async () => {
    const proposal = dbExperimentDesign({
      status: "draft",
      inputType: "research_question",
      inputUuids: ["idea-1"],
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      description: "Good proposal",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      { uuid: "idea-1", title: "Idea", elaborationStatus: "resolved" },
    ]);
    const updatedProposal = dbExperimentDesign({ ...proposal, status: "pending" });
    mockPrisma.experimentDesign.update.mockResolvedValue(updatedProposal);
    mockPrisma.researchQuestion.updateMany.mockResolvedValue({ count: 1 });

    const result = await submitExperimentDesign(proposal.uuid, COMPANY_UUID);

    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "pending" },
      })
    );
    expect(result.status).toBe("pending");
    expect(mockEventBus.emitChange).toHaveBeenCalled();
  });

  it("should auto-transition input ideas to proposal_created", async () => {
    const proposal = dbExperimentDesign({
      status: "draft",
      inputType: "research_question",
      inputUuids: ["idea-1", "idea-2"],
      documentDrafts: [validDocDraft()],
      taskDrafts: [validTaskDraft()],
      description: "Good proposal",
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      { uuid: "idea-1", title: "Idea 1", elaborationStatus: "resolved" },
      { uuid: "idea-2", title: "Idea 2", elaborationStatus: "resolved" },
    ]);
    mockPrisma.experimentDesign.update.mockResolvedValue(dbExperimentDesign({ ...proposal, status: "pending" }));
    mockPrisma.researchQuestion.updateMany.mockResolvedValue({ count: 2 });

    await submitExperimentDesign(proposal.uuid, COMPANY_UUID);

    expect(mockPrisma.researchQuestion.updateMany).toHaveBeenCalledWith({
      where: {
        uuid: { in: ["idea-1", "idea-2"] },
        companyUuid: COMPANY_UUID,
        status: "elaborating",
      },
      data: { status: "proposal_created" },
    });
  });
});

// ====================================================================
// approveExperimentDesign
// ====================================================================

describe("approveExperimentDesign", () => {
  it("should throw if proposal not found", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(
      approveExperimentDesign("nonexistent", COMPANY_UUID, "reviewer-uuid")
    ).rejects.toThrow("ExperimentDesign not found");
  });

  it("should update status to approved and materialize documents", async () => {
    const proposal = dbExperimentDesign({
      status: "pending",
      documentDrafts: [validDocDraft()],
      taskDrafts: null,
      inputType: "manual",
      inputUuids: ["source-1"],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const updatedRow = dbExperimentDesign({ ...proposal, status: "approved" });
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        experimentDesign: { update: vi.fn().mockResolvedValue(updatedRow) },
        runDependency: { create: vi.fn() },
        acceptanceCriterion: { createMany: vi.fn() },
      };
      return cb(tx);
    });

    const result = await approveExperimentDesign(proposal.uuid, COMPANY_UUID, "reviewer-uuid", "Looks good");

    expect(mockCreateDoc).toHaveBeenCalledOnce();
    expect(result.status).toBe("approved");
    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "experiment_design", action: "updated" })
    );
  });

  it("should materialize tasks and dependencies", async () => {
    const taskDrafts = [
      validTaskDraft({ uuid: "td-1", title: "Task 1" }),
      validTaskDraft({ uuid: "td-2", title: "Task 2", dependsOnDraftUuids: ["td-1"] }),
    ];
    const proposal = dbExperimentDesign({
      status: "pending",
      documentDrafts: [validDocDraft()],
      taskDrafts,
      inputType: "manual",
      inputUuids: ["source-1"],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const draftToTaskUuidMap = new Map([
      ["td-1", "real-task-1"],
      ["td-2", "real-task-2"],
    ]);
    mockCreateExperimentRuns.mockResolvedValue({ draftToTaskUuidMap });

    const txMock = {
      experimentDesign: { update: vi.fn().mockResolvedValue(dbExperimentDesign({ ...proposal, status: "approved" })) },
      runDependency: { create: vi.fn() },
      acceptanceCriterion: { createMany: vi.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));

    await approveExperimentDesign(proposal.uuid, COMPANY_UUID, "reviewer-uuid");

    expect(mockCreateExperimentRuns).toHaveBeenCalledOnce();
    expect(txMock.runDependency.create).toHaveBeenCalledWith({
      data: { runUuid: "real-task-2", dependsOnRunUuid: "real-task-1" },
    });
  });

  it("should materialize acceptance criteria items", async () => {
    const taskDrafts = [
      validTaskDraft({
        uuid: "td-1",
        acceptanceCriteriaItems: [
          { description: "Criterion 1", required: true },
          { description: "Criterion 2", required: false },
        ],
      }),
    ];
    const proposal = dbExperimentDesign({
      status: "pending",
      documentDrafts: [validDocDraft()],
      taskDrafts,
      inputType: "manual",
      inputUuids: ["source-1"],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const draftToTaskUuidMap = new Map([["td-1", "real-task-1"]]);
    mockCreateExperimentRuns.mockResolvedValue({ draftToTaskUuidMap });

    const txMock = {
      experimentDesign: { update: vi.fn().mockResolvedValue(dbExperimentDesign({ ...proposal, status: "approved" })) },
      runDependency: { create: vi.fn() },
      acceptanceCriterion: { createMany: vi.fn() },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock));

    await approveExperimentDesign(proposal.uuid, COMPANY_UUID, "reviewer-uuid");

    expect(txMock.acceptanceCriterion.createMany).toHaveBeenCalledWith({
      data: [
        { runUuid: "real-task-1", description: "Criterion 1", required: true, sortOrder: 0 },
        { runUuid: "real-task-1", description: "Criterion 2", required: false, sortOrder: 1 },
      ],
    });
  });

  it("should throw when acceptanceCriteriaItems has empty description", async () => {
    const taskDrafts = [
      validTaskDraft({
        uuid: "td-1",
        acceptanceCriteriaItems: [{ description: "", required: true }],
      }),
    ];
    const proposal = dbExperimentDesign({
      status: "pending",
      documentDrafts: [validDocDraft()],
      taskDrafts,
      inputType: "manual",
      inputUuids: ["source-1"],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        experimentDesign: { update: vi.fn().mockResolvedValue(dbExperimentDesign({ ...proposal, status: "approved" })) },
        runDependency: { create: vi.fn() },
        acceptanceCriterion: { createMany: vi.fn() },
      };
      return cb(tx);
    });

    await expect(
      approveExperimentDesign(proposal.uuid, COMPANY_UUID, "reviewer-uuid")
    ).rejects.toThrow("empty or invalid description");
  });

  it("should auto-complete input ideas when approved", async () => {
    const proposal = dbExperimentDesign({
      status: "pending",
      documentDrafts: null,
      taskDrafts: null,
      inputType: "research_question",
      inputUuids: ["idea-1"],
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const updatedRow = dbExperimentDesign({ ...proposal, status: "approved" });
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        experimentDesign: { update: vi.fn().mockResolvedValue(updatedRow) },
        runDependency: { create: vi.fn() },
        acceptanceCriterion: { createMany: vi.fn() },
      };
      return cb(tx);
    });
    mockPrisma.researchQuestion.updateMany.mockResolvedValue({ count: 1 });

    await approveExperimentDesign(proposal.uuid, COMPANY_UUID, "reviewer-uuid");

    expect(mockPrisma.researchQuestion.updateMany).toHaveBeenCalledWith({
      where: {
        uuid: { in: ["idea-1"] },
        companyUuid: COMPANY_UUID,
        status: "proposal_created",
      },
      data: { status: "completed" },
    });
  });
});

// ====================================================================
// rejectExperimentDesign
// ====================================================================

describe("rejectExperimentDesign", () => {
  it("should transition proposal to draft status with review note", async () => {
    const updated = dbExperimentDesign({
      status: "draft",
      reviewedByUuid: "reviewer-uuid",
      reviewNote: "Needs work",
      reviewedAt: new Date(),
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    const result = await rejectExperimentDesign("proposal-uuid", "reviewer-uuid", "Needs work");

    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid" },
      data: expect.objectContaining({
        status: "draft",
        reviewedByUuid: "reviewer-uuid",
        reviewNote: "Needs work",
      }),
      include: { researchProject: { select: { uuid: true, name: true } } },
    });
    expect(result.status).toBe("draft");
    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "experiment_design", action: "updated" })
    );
  });
});

// ====================================================================
// closeExperimentDesign
// ====================================================================

describe("closeExperimentDesign", () => {
  it("should transition proposal to closed status", async () => {
    const updated = dbExperimentDesign({
      status: "closed",
      reviewedByUuid: "admin-uuid",
      reviewNote: "No longer needed",
      reviewedAt: new Date(),
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    const result = await closeExperimentDesign("proposal-uuid", "admin-uuid", "No longer needed");

    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid" },
      data: expect.objectContaining({
        status: "closed",
        reviewedByUuid: "admin-uuid",
        reviewNote: "No longer needed",
      }),
      include: { researchProject: { select: { uuid: true, name: true } } },
    });
    expect(result.status).toBe("closed");
    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "experiment_design", action: "updated" })
    );
  });
});

// ====================================================================
// deleteExperimentDesign
// ====================================================================

describe("deleteExperimentDesign", () => {
  it("should delete a draft proposal", async () => {
    const proposal = dbExperimentDesign({ status: "draft" });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.delete.mockResolvedValue(proposal);

    await deleteExperimentDesign("proposal-uuid", COMPANY_UUID);

    expect(mockPrisma.experimentDesign.findFirst).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid", companyUuid: COMPANY_UUID },
    });
    expect(mockPrisma.experimentDesign.delete).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid" },
    });
    expect(mockEventBus.emitChange).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "experiment_design", action: "deleted" })
    );
  });

  it("should delete a proposal in any status", async () => {
    for (const status of ["closed", "pending", "approved"]) {
      const proposal = dbExperimentDesign({ status });
      mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
      mockPrisma.experimentDesign.delete.mockResolvedValue(proposal);

      await deleteExperimentDesign("proposal-uuid", COMPANY_UUID);

      expect(mockPrisma.experimentDesign.delete).toHaveBeenCalledWith({
        where: { uuid: "proposal-uuid" },
      });
    }
  });

  it("should throw when proposal not found", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    await expect(deleteExperimentDesign("nonexistent", COMPANY_UUID)).rejects.toThrow("ExperimentDesign not found");
  });
});

// ====================================================================
// listExperimentDesigns
// ====================================================================

describe("listExperimentDesigns", () => {
  it("should return paginated list of proposals", async () => {
    const proposal1 = dbExperimentDesign({ uuid: "proposal-1", title: "Proposal 1" });
    const proposal2 = dbExperimentDesign({ uuid: "proposal-2", title: "Proposal 2" });

    mockPrisma.experimentDesign.findMany.mockResolvedValue([proposal1, proposal2]);
    mockPrisma.experimentDesign.count.mockResolvedValue(2);

    const result = await listExperimentDesigns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 20,
    });

    expect(result.experimentDesigns).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.experimentDesigns[0].uuid).toBe("proposal-1");
    expect(result.experimentDesigns[1].uuid).toBe("proposal-2");
    expect(mockPrisma.experimentDesign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { researchProjectUuid: PROJECT_UUID, companyUuid: COMPANY_UUID },
        skip: 0,
        take: 20,
      })
    );
  });

  it("should filter by status when provided", async () => {
    mockPrisma.experimentDesign.findMany.mockResolvedValue([]);
    mockPrisma.experimentDesign.count.mockResolvedValue(0);

    await listExperimentDesigns({
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      skip: 0,
      take: 20,
      status: "pending",
    });

    expect(mockPrisma.experimentDesign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { researchProjectUuid: PROJECT_UUID, companyUuid: COMPANY_UUID, status: "pending" },
      })
    );
  });
});

// ====================================================================
// getExperimentDesign
// ====================================================================

describe("getExperimentDesign", () => {
  it("should return proposal with project info", async () => {
    const proposal = dbExperimentDesign({
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    });
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await getExperimentDesign(COMPANY_UUID, "proposal-uuid");

    expect(result).not.toBeNull();
    expect(result!.uuid).toBe(proposal.uuid);
    expect(result!.project).toEqual({ uuid: PROJECT_UUID, name: "Test Project" });
    expect(mockPrisma.experimentDesign.findFirst).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid", companyUuid: COMPANY_UUID },
      include: { researchProject: { select: { uuid: true, name: true } } },
    });
  });

  it("should return null when proposal not found", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    const result = await getExperimentDesign(COMPANY_UUID, "nonexistent");
    expect(result).toBeNull();
  });
});

// ====================================================================
// getExperimentDesignByUuid
// ====================================================================

describe("getExperimentDesignByUuid", () => {
  it("should return raw proposal data", async () => {
    const proposal = dbExperimentDesign();
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    const result = await getExperimentDesignByUuid(COMPANY_UUID, "proposal-uuid");

    expect(result).toEqual(proposal);
    expect(mockPrisma.experimentDesign.findFirst).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid", companyUuid: COMPANY_UUID },
    });
  });

  it("should return null when not found", async () => {
    mockPrisma.experimentDesign.findFirst.mockResolvedValue(null);

    const result = await getExperimentDesignByUuid(COMPANY_UUID, "nonexistent");
    expect(result).toBeNull();
  });
});

// ====================================================================
// updateExperimentDesignContent
// ====================================================================

describe("updateExperimentDesignContent", () => {
  it("should update title and description", async () => {
    const updated = dbExperimentDesign({
      title: "Updated Title",
      description: "Updated Description",
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    const result = await updateExperimentDesignContent("proposal-uuid", COMPANY_UUID, {
      title: "Updated Title",
      description: "Updated Description",
    });

    expect(result.title).toBe("Updated Title");
    expect(result.description).toBe("Updated Description");
    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid", companyUuid: COMPANY_UUID },
      data: expect.objectContaining({
        title: "Updated Title",
        description: "Updated Description",
      }),
      include: { researchProject: { select: { uuid: true, name: true } } },
    });
  });

  it("should update documentDrafts", async () => {
    const newDrafts = [validDocDraft({ uuid: "draft-1", title: "New Doc" })];
    const updated = dbExperimentDesign({
      documentDrafts: newDrafts,
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    const result = await updateExperimentDesignContent("proposal-uuid", COMPANY_UUID, {
      documentDrafts: newDrafts,
    });

    expect(result.documentDrafts).toEqual(newDrafts);
    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentDrafts: expect.anything(),
        }),
      })
    );
  });

  it("should update taskDrafts", async () => {
    const newTasks = [validTaskDraft({ uuid: "task-1", title: "New Task" })];
    const updated = dbExperimentDesign({
      taskDrafts: newTasks,
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    const result = await updateExperimentDesignContent("proposal-uuid", COMPANY_UUID, {
      taskDrafts: newTasks,
    });

    expect(result.taskDrafts).toEqual(newTasks);
  });

  it("should handle null values for documentDrafts and taskDrafts", async () => {
    const updated = dbExperimentDesign({
      documentDrafts: null,
      taskDrafts: null,
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    const result = await updateExperimentDesignContent("proposal-uuid", COMPANY_UUID, {
      documentDrafts: null,
      taskDrafts: null,
    });

    expect(result.documentDrafts).toBeNull();
    expect(result.taskDrafts).toBeNull();
    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentDrafts: "DbNull",
          taskDrafts: "DbNull",
        }),
      })
    );
  });

  it("should allow partial updates", async () => {
    const updated = dbExperimentDesign({
      title: "New Title",
      researchProject: { uuid: PROJECT_UUID, name: "Test Project" },
    });
    mockPrisma.experimentDesign.update.mockResolvedValue(updated);

    await updateExperimentDesignContent("proposal-uuid", COMPANY_UUID, {
      title: "New Title",
    });

    expect(mockPrisma.experimentDesign.update).toHaveBeenCalledWith({
      where: { uuid: "proposal-uuid", companyUuid: COMPANY_UUID },
      data: { title: "New Title" },
      include: { researchProject: { select: { uuid: true, name: true } } },
    });
  });
});

// ===== checkResearchQuestionsAvailability =====
describe("checkResearchQuestionsAvailability", () => {
  it("should return available=true when no ideas are used", async () => {
    const { checkResearchQuestionsAvailability } = await import("@/services/experiment-design.service");

    mockPrisma.experimentDesign.findMany.mockResolvedValue([]);

    const result = await checkResearchQuestionsAvailability(COMPANY_UUID, ["idea-1", "idea-2"]);

    expect(result.available).toBe(true);
    expect(result.usedResearchQuestions).toHaveLength(0);
    expect(mockPrisma.experimentDesign.findMany).toHaveBeenCalledWith({
      where: { companyUuid: COMPANY_UUID, inputType: "research_question" },
      select: { uuid: true, title: true, inputUuids: true },
    });
  });

  it("should return available=false when ideas are already used", async () => {
    const { checkResearchQuestionsAvailability } = await import("@/services/experiment-design.service");

    mockPrisma.experimentDesign.findMany.mockResolvedValue([
      {
        uuid: "proposal-1",
        title: "Existing ExperimentDesign 1",
        inputUuids: ["idea-1", "idea-3"],
      },
      {
        uuid: "proposal-2",
        title: "Existing ExperimentDesign 2",
        inputUuids: ["idea-2"],
      },
    ]);

    const result = await checkResearchQuestionsAvailability(COMPANY_UUID, ["idea-1", "idea-2"]);

    expect(result.available).toBe(false);
    expect(result.usedResearchQuestions).toHaveLength(2);
    expect(result.usedResearchQuestions).toEqual([
      { uuid: "idea-1", experimentDesignUuid: "proposal-1", proposalTitle: "Existing ExperimentDesign 1" },
      { uuid: "idea-2", experimentDesignUuid: "proposal-2", proposalTitle: "Existing ExperimentDesign 2" },
    ]);
  });

  it("should return only overlapping ideas", async () => {
    const { checkResearchQuestionsAvailability } = await import("@/services/experiment-design.service");

    mockPrisma.experimentDesign.findMany.mockResolvedValue([
      {
        uuid: "proposal-1",
        title: "Existing ExperimentDesign",
        inputUuids: ["idea-1", "idea-5"],
      },
    ]);

    const result = await checkResearchQuestionsAvailability(COMPANY_UUID, ["idea-1", "idea-2", "idea-3"]);

    expect(result.available).toBe(false);
    expect(result.usedResearchQuestions).toHaveLength(1);
    expect(result.usedResearchQuestions[0].uuid).toBe("idea-1");
  });
});

// ===== checkResearchQuestionsAssignee =====
describe("checkResearchQuestionsAssignee", () => {
  it("should return valid=true when actor is assignee of all ideas", async () => {
    const { checkResearchQuestionsAssignee } = await import("@/services/experiment-design.service");

    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      {
        uuid: "idea-1",
        assigneeType: "agent",
        assigneeUuid: ACTOR_UUID,
      },
      {
        uuid: "idea-2",
        assigneeType: "agent",
        assigneeUuid: ACTOR_UUID,
      },
    ]);

    const result = await checkResearchQuestionsAssignee(COMPANY_UUID, ["idea-1", "idea-2"], ACTOR_UUID, "agent");

    expect(result.valid).toBe(true);
    expect(result.unassignedResearchQuestions).toHaveLength(0);
  });

  it("should return valid=false when actor is not assignee of some ideas", async () => {
    const { checkResearchQuestionsAssignee } = await import("@/services/experiment-design.service");

    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      {
        uuid: "idea-1",
        assigneeType: "agent",
        assigneeUuid: ACTOR_UUID,
      },
      {
        uuid: "idea-2",
        assigneeType: "agent",
        assigneeUuid: "other-agent-uuid",
      },
      {
        uuid: "idea-3",
        assigneeType: "user",
        assigneeUuid: "user-uuid",
      },
    ]);

    const result = await checkResearchQuestionsAssignee(COMPANY_UUID, ["idea-1", "idea-2", "idea-3"], ACTOR_UUID, "agent");

    expect(result.valid).toBe(false);
    expect(result.unassignedResearchQuestions).toEqual(["idea-2", "idea-3"]);
  });

  it("should handle actor type mismatch", async () => {
    const { checkResearchQuestionsAssignee } = await import("@/services/experiment-design.service");

    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      {
        uuid: "idea-1",
        assigneeType: "user",
        assigneeUuid: ACTOR_UUID,
      },
    ]);

    const result = await checkResearchQuestionsAssignee(COMPANY_UUID, ["idea-1"], ACTOR_UUID, "agent");

    expect(result.valid).toBe(false);
    expect(result.unassignedResearchQuestions).toEqual(["idea-1"]);
  });
});

// ===== approveExperimentDesign edge cases =====
describe("approveExperimentDesign - edge cases", () => {
  it("should skip dependencies when runUuid not found in map", async () => {
    const proposalWithDeps = dbExperimentDesign({
      status: "pending",
      documentDrafts: [{ uuid: "doc-1", type: "prd", title: "PRD", content: LONG_CONTENT }],
      taskDrafts: [
        { uuid: "task-1", title: "Task 1", description: "Task 1", acceptanceCriteriaItems: [{ description: "Criteria", required: true }] },
        { uuid: "task-2", title: "Task 2", description: "Task 2", acceptanceCriteriaItems: [{ description: "Criteria", required: true }], dependsOnDraftUuids: ["task-1"] },
      ],
    });

    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposalWithDeps);

    // Create a map that only has task-2, not task-1
    const partialMap = new Map([["task-2", "real-task-2"]]);
    mockCreateExperimentRuns.mockResolvedValue({ draftToTaskUuidMap: partialMap });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const txMock = {
        experimentDesign: { update: vi.fn().mockResolvedValue({ ...proposalWithDeps, status: "approved", project: { uuid: PROJECT_UUID, name: "Test" } }) },
        runDependency: { create: vi.fn() },
        acceptanceCriterion: { createMany: vi.fn() },
      };
      return callback(txMock);
    });

    await approveExperimentDesign("proposal-uuid", COMPANY_UUID, "reviewer-uuid", "Approved");

    // Should not throw, and taskDependency.create should not be called (both continue branches)
    expect(mockCreateExperimentRuns).toHaveBeenCalled();
  });

  it("should skip acceptance criteria when runUuid not found in map", async () => {
    const proposalWithAC = dbExperimentDesign({
      status: "pending",
      documentDrafts: [{ uuid: "doc-1", type: "prd", title: "PRD", content: LONG_CONTENT }],
      taskDrafts: [
        {
          uuid: "task-1",
          title: "Task 1",
          description: "Task 1",
          acceptanceCriteriaItems: [
            { description: "Criterion 1", required: true },
            { description: "Criterion 2", required: false },
          ],
        },
      ],
    });

    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposalWithAC);

    // Create a map that doesn't include task-1
    const emptyMap = new Map();
    mockCreateExperimentRuns.mockResolvedValue({ draftToTaskUuidMap: emptyMap });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const txMock = {
        experimentDesign: { update: vi.fn().mockResolvedValue({ ...proposalWithAC, status: "approved", project: { uuid: PROJECT_UUID, name: "Test" } }) },
        runDependency: { create: vi.fn() },
        acceptanceCriterion: { createMany: vi.fn() },
      };
      return callback(txMock);
    });

    await approveExperimentDesign("proposal-uuid", COMPANY_UUID, "reviewer-uuid", "Approved");

    // Should not throw, acceptance criteria creation should be skipped
    expect(mockCreateExperimentRuns).toHaveBeenCalled();
  });
});

// ---------- getProjectExperimentDesigns ----------

describe("getProjectExperimentDesigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns approved proposals with task counts and sequence numbers", async () => {
    const now = new Date();
    mockPrisma.experimentDesign.findMany.mockResolvedValue([
      { uuid: "p1", title: "Proposal 1", createdAt: now },
      { uuid: "p2", title: "Proposal 2", createdAt: new Date(now.getTime() + 1000) },
    ]);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([
      { experimentDesignUuid: "p1", _count: 3 },
      { experimentDesignUuid: "p2", _count: 1 },
    ]);

    const result = await getProjectExperimentDesigns(COMPANY_UUID, PROJECT_UUID);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ uuid: "p1", title: "Proposal 1", sequenceNumber: 1, taskCount: 3 });
    expect(result[1]).toEqual({ uuid: "p2", title: "Proposal 2", sequenceNumber: 2, taskCount: 1 });

    // Verify query filters
    expect(mockPrisma.experimentDesign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyUuid: COMPANY_UUID, researchProjectUuid: PROJECT_UUID, status: "approved" },
      }),
    );
  });

  it("returns 0 task count for proposals with no tasks", async () => {
    mockPrisma.experimentDesign.findMany.mockResolvedValue([
      { uuid: "p1", title: "Proposal 1", createdAt: new Date() },
    ]);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([]);

    const result = await getProjectExperimentDesigns(COMPANY_UUID, PROJECT_UUID);

    expect(result).toHaveLength(1);
    expect(result[0].taskCount).toBe(0);
  });

  it("returns empty array when no approved proposals exist", async () => {
    mockPrisma.experimentDesign.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([]);

    const result = await getProjectExperimentDesigns(COMPANY_UUID, PROJECT_UUID);

    expect(result).toHaveLength(0);
  });
});


// ===== Idea Reuse across Proposals =====
describe("ResearchQuestion reuse - submitExperimentDesign with proposal_created Idea", () => {
  it("should not error when Idea is already in proposal_created status", async () => {
    const { submitExperimentDesign } = await import("@/services/experiment-design.service");

    const now = new Date();
    const proposal = {
      uuid: "proposal-reuse",
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      status: "draft",
      inputType: "research_question",
      inputUuids: ["idea-already-used"],
      documentDrafts: [
        { uuid: "doc-1", type: "prd", title: "PRD", content: "This is a comprehensive PRD document that describes the feature requirements in detail for the Idea reuse feature across multiple proposals." },
        { uuid: "doc-2", type: "tech_design", title: "Tech Design", content: "This is a comprehensive tech design document that describes the implementation approach for the Idea reuse feature across multiple proposals." },
      ],
      taskDrafts: [{
        uuid: "task-1", title: "Task", description: "desc", computeBudgetHours: 1, priority: "medium",
        acceptanceCriteria: null, acceptanceCriteriaItems: [{ description: "AC1" }], dependsOnDraftUuids: [],
      }],
      researchProject: { uuid: PROJECT_UUID, name: "Test" },
      description: "Test proposal for Idea reuse scenario",
      createdByUuid: ACTOR_UUID,
      createdByType: "agent",
      reviewedByUuid: null,
      reviewNote: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // E5 check: ideas must have resolved elaboration
    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      { uuid: "idea-already-used", title: "Test Idea", elaborationStatus: "resolved" },
    ]);

    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);
    mockPrisma.experimentDesign.update.mockResolvedValue({ ...proposal, status: "pending" });
    // Idea is already proposal_created - updateMany should match 0 rows (no error)
    mockPrisma.researchQuestion.updateMany.mockResolvedValue({ count: 0 });

    const result = await submitExperimentDesign("proposal-reuse", COMPANY_UUID);

    expect(result.status).toBe("pending");
    // updateMany was called with status: "elaborating" filter, which won't match proposal_created
    expect(mockPrisma.researchQuestion.updateMany).toHaveBeenCalledWith({
      where: { uuid: { in: ["idea-already-used"] }, companyUuid: COMPANY_UUID, status: "elaborating" },
      data: { status: "proposal_created" },
    });
  });
});

describe("ResearchQuestion reuse - approveExperimentDesign with completed Idea", () => {
  it("should not error when Idea is already in completed status", async () => {
    const { approveExperimentDesign } = await import("@/services/experiment-design.service");

    const now = new Date();
    const proposal = {
      uuid: "proposal-reuse-2",
      companyUuid: COMPANY_UUID,
      researchProjectUuid: PROJECT_UUID,
      status: "pending",
      inputType: "research_question",
      inputUuids: ["idea-completed"],
      documentDrafts: [{ uuid: "doc-1", type: "prd", title: "PRD", content: "content" }],
      taskDrafts: [],
      researchProject: { uuid: PROJECT_UUID, name: "Test" },
      createdByUuid: ACTOR_UUID,
      createdByType: "agent",
      reviewedByUuid: null,
      reviewNote: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    mockPrisma.experimentDesign.findFirst.mockResolvedValue(proposal);

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const txMock = {
        experimentDesign: { update: vi.fn().mockResolvedValue({
          ...proposal, status: "approved",
          reviewedByUuid: "reviewer-uuid", reviewNote: "Approved", reviewedAt: now,
          researchProject: { uuid: PROJECT_UUID, name: "Test" },
        }) },
        runDependency: { create: vi.fn() },
        acceptanceCriterion: { createMany: vi.fn() },
      };
      return callback(txMock);
    });
    mockCreateExperimentRuns.mockResolvedValue({ draftToTaskUuidMap: new Map() });
    // Idea is already completed - updateMany should match 0 rows (no error)
    mockPrisma.researchQuestion.updateMany.mockResolvedValue({ count: 0 });

    await approveExperimentDesign("proposal-reuse-2", COMPANY_UUID, "reviewer-uuid", "Approved");

    // updateMany was called with status: "proposal_created" filter, which won't match completed
    expect(mockPrisma.researchQuestion.updateMany).toHaveBeenCalledWith({
      where: { uuid: { in: ["idea-completed"] }, companyUuid: COMPANY_UUID, status: "proposal_created" },
      data: { status: "completed" },
    });
  });
});

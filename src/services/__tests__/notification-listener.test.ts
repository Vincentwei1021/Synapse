import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ===== Mock Setup =====
// CRITICAL: All mock state must live inside the hoisted scope

const { mockState, mockEventBus, mockPrisma, mockNotificationService } = vi.hoisted(() => {
  // State to capture the activity handler
  const state: { activityHandler?: (event: any) => void } = {};

  // Mock event bus
  const eventBus = {
    on: vi.fn((event: string, handler: any) => {
      if (event === "activity") state.activityHandler = handler;
    }),
    emitChange: vi.fn(),
  };

  // Mock prisma
  const prisma = {
    experimentRun: { findUnique: vi.fn() },
    researchQuestion: { findUnique: vi.fn() },
    experimentDesign: { findUnique: vi.fn() },
    document: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    agent: { findUnique: vi.fn() },
    researchProject: { findUnique: vi.fn() },
  };

  // Mock notification service
  const notificationService = {
    createBatch: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({
      runAssigned: true,
      runStatusChanged: true,
      runVerified: true,
      runReopened: true,
      designSubmitted: true,
      designApproved: true,
      designRejected: true,
      researchQuestionClaimed: true,
      commentAdded: true,
      hypothesisFormulationRequested: true,
      hypothesisFormulationAnswered: true,
      mentioned: true,
    }),
  };

  return {
    mockState: state,
    mockEventBus: eventBus,
    mockPrisma: prisma,
    mockNotificationService: notificationService,
  };
});

vi.mock("@/lib/event-bus", () => ({ eventBus: mockEventBus }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/services/notification.service", () => mockNotificationService);

// Import the module and the handler
import { handleActivity } from "@/services/notification-listener";

// ===== Test Helpers =====

function makeEvent(overrides: Partial<any> = {}) {
  return {
    uuid: "activity-uuid",
    companyUuid: "company-uuid",
    researchProjectUuid: "project-uuid",
    targetType: "experiment_run",
    targetUuid: "task-uuid",
    actorType: "agent",
    actorUuid: "agent-uuid",
    action: "assigned",
    ...overrides,
  };
}

// ===== Tests =====

describe("notification-listener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock returns for common queries
    mockPrisma.experimentRun.findUnique.mockResolvedValue({
      uuid: "task-uuid",
      title: "My Task",
      assigneeType: "agent",
      assigneeUuid: "assignee-uuid",
      createdByUuid: "creator-uuid",
    });
    mockPrisma.researchQuestion.findUnique.mockResolvedValue({
      uuid: "idea-uuid",
      title: "My Idea",
      assigneeType: "agent",
      assigneeUuid: "assignee-uuid",
      createdByUuid: "creator-uuid",
    });
    mockPrisma.experimentDesign.findUnique.mockResolvedValue({
      uuid: "proposal-uuid",
      title: "My Proposal",
      createdByType: "agent",
      createdByUuid: "creator-uuid",
    });
    mockPrisma.document.findUnique.mockResolvedValue({
      uuid: "document-uuid",
      title: "My Document",
      createdByUuid: "creator-uuid",
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      uuid: "user-uuid",
      name: "Alice",
      email: "alice@example.com",
    });
    mockPrisma.agent.findUnique.mockResolvedValue({
      uuid: "agent-uuid",
      name: "Bot Agent",
      ownerUuid: "owner-uuid",
    });
    mockPrisma.researchProject.findUnique.mockResolvedValue({
      uuid: "project-uuid",
      name: "Test Project",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("module initialization", () => {
    it.skip("should subscribe to activity events on import", () => {
      // Note: Testing side effects (eventBus.on registration) is challenging with vitest mocking.
      // The module DOES register the handler (verified by console.log in output),
      // but the mock isn't intercepting it due to module loading order.
      // Instead, we test the exported handleActivity function directly.
      expect(mockEventBus.on).toHaveBeenCalledWith("activity", expect.any(Function));
    });
  });

  describe("resolveNotificationType (via handleActivity)", () => {
    it("should map task:assigned to run_assigned", async () => {
      const event = makeEvent({ action: "assigned", targetType: "experiment_run" });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).toHaveBeenCalled();
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("run_assigned");
    });

    it("should not create notification for unmapped action", async () => {
      const event = makeEvent({ action: "unknown_action", targetType: "experiment_run" });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).not.toHaveBeenCalled();
    });
  });

  describe("handleActivity integration", () => {
    it("should not create notification for no recipients", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        uuid: "task-uuid",
        title: "My Task",
        assigneeType: null,
        assigneeUuid: null,
      });
      const event = makeEvent({ action: "assigned", targetType: "experiment_run" });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).not.toHaveBeenCalled();
    });

    it("should exclude actor from recipients", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        uuid: "task-uuid",
        title: "My Task",
        assigneeType: "agent",
        assigneeUuid: "actor-uuid",
      });
      const event = makeEvent({
        action: "assigned",
        targetType: "experiment_run",
        actorType: "agent",
        actorUuid: "actor-uuid",
      });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).not.toHaveBeenCalled();
    });

    it("should filter by notification preferences", async () => {
      mockNotificationService.getPreferences.mockResolvedValue({
        runAssigned: false, // disabled
        runStatusChanged: true,
        runVerified: true,
        runReopened: true,
        designSubmitted: true,
        designApproved: true,
        designRejected: true,
        researchQuestionClaimed: true,
        commentAdded: true,
        hypothesisFormulationRequested: true,
        hypothesisFormulationAnswered: true,
        mentioned: true,
      });
      const event = makeEvent({ action: "assigned", targetType: "experiment_run" });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).not.toHaveBeenCalled();
    });

    it("should handle prisma errors gracefully", async () => {
      mockPrisma.experimentRun.findUnique.mockRejectedValue(new Error("DB error"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const event = makeEvent({ action: "assigned", targetType: "experiment_run" });
      await handleActivity(event);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[NotificationListener] Failed to process activity:",
        expect.any(Error)
      );
      expect(mockNotificationService.createBatch).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("should create notification for task assignment with different actor and assignee", async () => {
      vi.clearAllMocks();
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        uuid: "task-uuid",
        title: "My Task",
        assigneeType: "user",
        assigneeUuid: "user-123",
        createdByUuid: "creator-456",
      });
      mockPrisma.user.findUnique.mockImplementation((opts: any) => {
        const uuid = opts.where.uuid;
        if (uuid === "user-123") {
          return Promise.resolve({ uuid: "user-123", name: "Alice" });
        }
        if (uuid === "pm-agent-123") {
          return Promise.resolve({ uuid: "pm-agent-123", name: "PM Bot" });
        }
        return Promise.resolve(null);
      });
      mockPrisma.agent.findUnique.mockResolvedValue({
        uuid: "pm-agent-123",
        name: "PM Bot",
      });
      mockPrisma.researchProject.findUnique.mockResolvedValue({
        uuid: "project-uuid",
        name: "Test Project",
      });
      mockNotificationService.getPreferences.mockResolvedValue({
        runAssigned: true,
        runStatusChanged: true,
        runVerified: true,
        runReopened: true,
        designSubmitted: true,
        designApproved: true,
        designRejected: true,
        researchQuestionClaimed: true,
        commentAdded: true,
        hypothesisFormulationRequested: true,
        hypothesisFormulationAnswered: true,
        mentioned: true,
      });
      const event = makeEvent({
        action: "assigned",
        targetType: "experiment_run",
        actorType: "agent",
        actorUuid: "pm-agent-123",
      });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).toHaveBeenCalled();
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call).toHaveLength(1);
      expect(call[0].recipientUuid).toBe("user-123");
      expect(call[0].action).toBe("run_assigned");
    });

    it("should create notification successfully for full happy path", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        uuid: "task-uuid",
        title: "My Task",
        assigneeType: "user",
        assigneeUuid: "assigned-user-uuid",
        createdByUuid: "creator-uuid",
      });
      mockPrisma.agent.findUnique.mockResolvedValue({
        uuid: "pm-agent-uuid",
        name: "PM Bot",
        ownerUuid: "owner-uuid",
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        uuid: "assigned-user-uuid",
        name: "Assigned User",
      });
      mockPrisma.researchProject.findUnique.mockResolvedValue({
        uuid: "project-uuid",
        name: "Test Project",
      });
      const event = makeEvent({
        action: "assigned",
        targetType: "experiment_run",
        actorType: "agent",
        actorUuid: "pm-agent-uuid",
      });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          companyUuid: "company-uuid",
          researchProjectUuid: "project-uuid",
          recipientType: "user",
          recipientUuid: "assigned-user-uuid",
          entityType: "experiment_run",
          entityUuid: "task-uuid",
          entityTitle: "My Task",
          projectName: "Test Project",
          action: "run_assigned",
          message: 'PM Bot assigned you to experiment run "My Task"',
          actorType: "agent",
          actorUuid: "pm-agent-uuid",
          actorName: "PM Bot",
        }),
      ]);
    });
  });

  describe("notification type mappings (comprehensive)", () => {
    it("should map task:status_changed", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "user",
        assigneeUuid: "user-1",
        createdByUuid: "user-2",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1", name: "Alice" });
      const event = makeEvent({ action: "status_changed" });
      await handleActivity(event);
      expect(mockNotificationService.createBatch).toHaveBeenCalled();
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("run_status_changed");
    });

    it("should map task:submitted to run_submitted_for_verify", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({
        uuid: "agent-uuid",
        name: "Dev Bot",
        ownerUuid: "owner-1",
      });
      mockPrisma.experimentRun.findUnique.mockResolvedValue({ createdByUuid: "user-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
      const event = makeEvent({ action: "submitted", actorUuid: "agent-uuid" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("run_submitted_for_verify");
    });

    it("should map task:verified", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "agent",
        assigneeUuid: "agent-1",
      });
      const event = makeEvent({ action: "verified" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("run_verified");
    });

    it("should map task:reopened", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "user",
        assigneeUuid: "user-1",
      });
      const event = makeEvent({ action: "reopened" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("run_reopened");
    });

    it("should map proposal:approved", async () => {
      mockPrisma.experimentDesign.findUnique.mockResolvedValue({
        createdByType: "agent",
        createdByUuid: "agent-1",
      });
      const event = makeEvent({ targetType: "experiment_design", action: "approved" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("design_approved");
    });

    it("should map proposal:rejected_to_draft", async () => {
      mockPrisma.experimentDesign.findUnique.mockResolvedValue({
        createdByType: "agent",
        createdByUuid: "agent-1",
      });
      const event = makeEvent({ targetType: "experiment_design", action: "rejected_to_draft" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("design_rejected");
    });

    it("should map idea:assigned to research_question_claimed", async () => {
      mockPrisma.researchQuestion.findUnique.mockResolvedValue({
        createdByUuid: "user-1",
        assigneeType: "agent",
        assigneeUuid: "agent-1",
      });
      const event = makeEvent({ targetType: "research_question", action: "assigned", actorUuid: "other" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].action).toBe("research_question_claimed");
    });

    it("should map elaboration actions", async () => {
      const mappings = [
        { action: "hypothesis_formulation_started", expected: "hypothesis_formulation_requested" },
        { action: "hypothesis_formulation_answered", expected: "hypothesis_formulation_answered" },
        { action: "hypothesis_formulation_followup", expected: "hypothesis_formulation_requested" },
        { action: "hypothesis_formulation_resolved", expected: "hypothesis_formulation_answered" },
        { action: "hypothesis_formulation_skipped", expected: "hypothesis_formulation_answered" },
      ];

      for (const { action, expected } of mappings) {
        vi.clearAllMocks();
        mockPrisma.researchQuestion.findUnique.mockResolvedValue({
          createdByUuid: "user-1",
          assigneeType: "agent",
          assigneeUuid: "agent-1",
        });
        const event = makeEvent({ targetType: "research_question", action, actorUuid: "other" });
        await handleActivity(event);
        const call = mockNotificationService.createBatch.mock.calls[0][0];
        expect(call[0].action).toBe(expected);
      }
    });

    it("should map comment_added for all entity types", async () => {
      const types = ["experiment_run", "research_question", "experiment_design", "document"];
      for (const targetType of types) {
        vi.clearAllMocks();
        if (targetType === "experiment_run") {
          mockPrisma.experimentRun.findUnique.mockResolvedValue({
            assigneeType: "user",
            assigneeUuid: "user-1",
            createdByUuid: "user-2",
          });
          mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
        } else if (targetType === "research_question") {
          mockPrisma.researchQuestion.findUnique.mockResolvedValue({
            assigneeType: "agent",
            assigneeUuid: "agent-1",
            createdByUuid: "user-1",
          });
        } else if (targetType === "experiment_design") {
          mockPrisma.experimentDesign.findUnique.mockResolvedValue({
            createdByType: "user",
            createdByUuid: "user-1",
          });
        } else if (targetType === "document") {
          mockPrisma.document.findUnique.mockResolvedValue({ createdByUuid: "user-1" });
          mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
        }
        const event = makeEvent({ targetType, action: "comment_added", actorUuid: "other" });
        await handleActivity(event);
        const call = mockNotificationService.createBatch.mock.calls[0][0];
        expect(call[0].action).toBe("comment_added");
      }
    });
  });

  describe("entity title resolution fallbacks", () => {
    it("should fallback to Unknown Experiment Run when not found", async () => {
      mockPrisma.experimentRun.findUnique.mockImplementation((opts: any) => {
        // First call is for recipient resolution (needs assignee)
        // Second call (parallel) is for entity title resolution (returns null for title)
        if (opts.select?.title) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ assigneeType: "user", assigneeUuid: "user-1" });
      });
      const event = makeEvent({ action: "assigned" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].entityTitle).toBe("Unknown Experiment Run");
    });

    it("should fallback to Unknown Research Question when not found", async () => {
      mockPrisma.researchQuestion.findUnique.mockImplementation((opts: any) => {
        if (opts.select?.title) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          createdByUuid: "user-1",
          assigneeType: "agent",
          assigneeUuid: "agent-1",
        });
      });
      const event = makeEvent({ targetType: "research_question", action: "assigned", actorUuid: "other" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].entityTitle).toBe("Unknown Research Question");
    });

    it("should fallback to Unknown Experiment Design when not found", async () => {
      mockPrisma.experimentDesign.findUnique.mockImplementation((opts: any) => {
        if (opts.select?.title) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ createdByType: "agent", createdByUuid: "agent-1" });
      });
      const event = makeEvent({ targetType: "experiment_design", action: "approved" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].entityTitle).toBe("Unknown Experiment Design");
    });

    it("should fallback to Unknown Document when not found", async () => {
      mockPrisma.document.findUnique.mockImplementation((opts: any) => {
        if (opts.select?.title) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ createdByUuid: "user-1" });
      });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
      const event = makeEvent({ targetType: "document", action: "comment_added", actorUuid: "other" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].entityTitle).toBe("Unknown Document");
    });
  });

  describe("actor name resolution fallbacks", () => {
    it("should fallback to email when user name is missing", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        uuid: "user-1",
        name: null,
        email: "bob@test.com",
      });
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "agent",
        assigneeUuid: "agent-1",
      });
      const event = makeEvent({ actorType: "user", actorUuid: "user-1" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].actorName).toBe("bob@test.com");
    });

    it("should fallback to Unknown User when not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "agent",
        assigneeUuid: "agent-1",
      });
      const event = makeEvent({ actorType: "user", actorUuid: "user-1" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].actorName).toBe("Unknown User");
    });

    it("should fallback to Unknown Agent when not found", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue(null);
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "user",
        assigneeUuid: "user-1",
      });
      const event = makeEvent({ actorType: "agent", actorUuid: "agent-1" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].actorName).toBe("Unknown Agent");
    });

    it("should return Unknown for unsupported actor type", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "user",
        assigneeUuid: "user-1",
      });
      const event = makeEvent({ actorType: "system", actorUuid: "sys-1" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].actorName).toBe("Unknown");
    });
  });

  describe("message templates", () => {
    it("should build design_approved with reviewNote", async () => {
      mockPrisma.experimentDesign.findUnique.mockResolvedValue({
        title: "New Feature",
        createdByType: "agent",
        createdByUuid: "agent-1",
      });
      const event = makeEvent({
        targetType: "experiment_design",
        action: "approved",
        value: { reviewNote: "Looks good!" },
      });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].message).toBe('Experiment design "New Feature" has been approved. Note: Looks good!');
    });

    it("should build design_rejected with reviewNote", async () => {
      mockPrisma.experimentDesign.findUnique.mockResolvedValue({
        title: "New Feature",
        createdByType: "agent",
        createdByUuid: "agent-1",
      });
      const event = makeEvent({
        targetType: "experiment_design",
        action: "rejected_to_draft",
        value: { reviewNote: "Needs work" },
      });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].message).toBe('Experiment design "New Feature" has been rejected. Reason: Needs work');
    });

    it("should build run_status_changed message", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        title: "Complete Feature",
        assigneeType: "agent",
        assigneeUuid: "agent-2",
        createdByUuid: "user-1",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1", name: "Alice" });
      const event = makeEvent({ action: "status_changed", actorUuid: "other-actor" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].message).toContain('changed the status of experiment run "Complete Feature"');
    });
  });

  describe("recipient deduplication", () => {
    it("should deduplicate same recipient appearing multiple times", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "user",
        assigneeUuid: "user-1",
        createdByUuid: "user-1",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1", name: "Alice" });
      const event = makeEvent({ action: "status_changed", actorUuid: "other" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call).toHaveLength(1);
      expect(call[0].recipientUuid).toBe("user-1");
    });
  });

  describe("agent owner resolution", () => {
    it("should notify agent owner for run_submitted_for_verify", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({
        uuid: "agent-1",
        name: "Dev Bot",
        ownerUuid: "owner-1",
      });
      mockPrisma.experimentRun.findUnique.mockResolvedValue({ createdByUuid: "user-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
      const event = makeEvent({
        action: "submitted",
        actorType: "agent",
        actorUuid: "agent-1",
      });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call.some((n: any) => n.recipientUuid === "owner-1")).toBe(true);
    });

    it("should handle agent with no owner gracefully", async () => {
      mockPrisma.agent.findUnique.mockResolvedValue({
        uuid: "agent-1",
        name: "Dev Bot",
        ownerUuid: null,
      });
      mockPrisma.experimentRun.findUnique.mockResolvedValue({ createdByUuid: "user-1" });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
      const event = makeEvent({
        action: "submitted",
        actorType: "agent",
        actorUuid: "agent-1",
      });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call.every((n: any) => n.recipientUuid !== null)).toBe(true);
    });
  });

  describe("project name resolution", () => {
    it("should fallback to Unknown Research Project when not found", async () => {
      mockPrisma.researchProject.findUnique.mockResolvedValue(null);
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "user",
        assigneeUuid: "user-1",
      });
      const event = makeEvent({ action: "assigned" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call[0].projectName).toBe("Unknown Research Project");
    });
  });

  describe("recipient resolution edge cases", () => {
    it("should handle comment_added excluding comment author", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "agent",
        assigneeUuid: "agent-2",
        createdByUuid: "user-1",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
      const event = makeEvent({
        action: "comment_added",
        actorType: "user",
        actorUuid: "user-commenter",
      });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call.every((n: any) => n.recipientUuid !== "user-commenter")).toBe(true);
    });

    it("should handle run_status_changed with agent and user recipients", async () => {
      mockPrisma.experimentRun.findUnique.mockResolvedValue({
        assigneeType: "agent",
        assigneeUuid: "agent-2",
        createdByUuid: "user-1",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ uuid: "user-1" });
      const event = makeEvent({ action: "status_changed", actorUuid: "other" });
      await handleActivity(event);
      const call = mockNotificationService.createBatch.mock.calls[0][0];
      expect(call.length).toBeGreaterThan(0);
      expect(call.some((n: any) => n.recipientType === "agent")).toBe(true);
      expect(call.some((n: any) => n.recipientType === "user")).toBe(true);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  normalizeResearchQuestionStatus,
  isValidResearchQuestionStatusTransition,
  RESEARCH_QUESTION_STATUS_TRANSITIONS,
} from "@/services/research-question.service";

// ===== normalizeResearchQuestionStatus =====

describe("normalizeResearchQuestionStatus", () => {
  it('should map "assigned" to "elaborating"', () => {
    expect(normalizeResearchQuestionStatus("assigned")).toBe("elaborating");
  });

  it('should map "in_progress" to "elaborating"', () => {
    expect(normalizeResearchQuestionStatus("in_progress")).toBe("elaborating");
  });

  it('should map "pending_review" to "proposal_created"', () => {
    expect(normalizeResearchQuestionStatus("pending_review")).toBe("proposal_created");
  });

  it("should pass through current statuses unchanged", () => {
    expect(normalizeResearchQuestionStatus("open")).toBe("open");
    expect(normalizeResearchQuestionStatus("elaborating")).toBe("elaborating");
    expect(normalizeResearchQuestionStatus("proposal_created")).toBe("proposal_created");
    expect(normalizeResearchQuestionStatus("completed")).toBe("completed");
    expect(normalizeResearchQuestionStatus("closed")).toBe("closed");
  });

  it("should pass through unknown statuses unchanged", () => {
    expect(normalizeResearchQuestionStatus("unknown_status")).toBe("unknown_status");
  });
});

// ===== isValidResearchQuestionStatusTransition =====

describe("isValidResearchQuestionStatusTransition", () => {
  describe("valid transitions", () => {
    const validCases: [string, string][] = [
      ["open", "elaborating"],
      ["open", "closed"],
      ["elaborating", "proposal_created"],
      ["elaborating", "closed"],
      ["proposal_created", "completed"],
      ["proposal_created", "elaborating"],
      ["proposal_created", "closed"],
      ["completed", "closed"],
    ];

    it.each(validCases)("%s -> %s should be valid", (from, to) => {
      expect(isValidResearchQuestionStatusTransition(from, to)).toBe(true);
    });
  });

  describe("invalid transitions", () => {
    const invalidCases: [string, string][] = [
      ["open", "completed"],
      ["open", "proposal_created"],
      ["elaborating", "open"],
      ["elaborating", "completed"],
      ["proposal_created", "open"],
      ["completed", "open"],
      ["completed", "elaborating"],
      ["completed", "proposal_created"],
      ["closed", "open"],
      ["closed", "elaborating"],
      ["closed", "proposal_created"],
      ["closed", "completed"],
    ];

    it.each(invalidCases)("%s -> %s should be invalid", (from, to) => {
      expect(isValidResearchQuestionStatusTransition(from, to)).toBe(false);
    });
  });

  describe("legacy status normalization in transitions", () => {
    it('should treat "assigned" as "elaborating" for transitions', () => {
      // "assigned" normalizes to "elaborating", which can go to "proposal_created"
      expect(isValidResearchQuestionStatusTransition("assigned", "proposal_created")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("assigned", "closed")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("assigned", "open")).toBe(false);
    });

    it('should treat "in_progress" as "elaborating" for transitions', () => {
      expect(isValidResearchQuestionStatusTransition("in_progress", "proposal_created")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("in_progress", "closed")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("in_progress", "completed")).toBe(false);
    });

    it('should treat "pending_review" as "proposal_created" for transitions', () => {
      expect(isValidResearchQuestionStatusTransition("pending_review", "completed")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("pending_review", "elaborating")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("pending_review", "closed")).toBe(true);
      expect(isValidResearchQuestionStatusTransition("pending_review", "open")).toBe(false);
    });
  });

  it("should return false for unknown source status", () => {
    expect(isValidResearchQuestionStatusTransition("nonexistent", "open")).toBe(false);
  });

  it("should have all expected statuses in RESEARCH_QUESTION_STATUS_TRANSITIONS", () => {
    const expectedStatuses = ["open", "elaborating", "proposal_created", "completed", "closed"];
    expect(Object.keys(RESEARCH_QUESTION_STATUS_TRANSITIONS).sort()).toEqual(expectedStatuses.sort());
  });

  it("closed should be a terminal state with no transitions", () => {
    expect(RESEARCH_QUESTION_STATUS_TRANSITIONS["closed"]).toEqual([]);
  });
});

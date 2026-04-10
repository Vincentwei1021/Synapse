import { describe, it, expect } from "vitest";
import { getAgentTransport, isRealtimeAgent, VALID_AGENT_TYPES, getTypesByTransport } from "@/lib/agent-transport";

describe("agent-transport", () => {
  describe("VALID_AGENT_TYPES", () => {
    it("contains openclaw and claude_code", () => {
      expect(VALID_AGENT_TYPES).toContain("openclaw");
      expect(VALID_AGENT_TYPES).toContain("claude_code");
    });
  });

  describe("getAgentTransport", () => {
    it("returns realtime for openclaw", () => {
      expect(getAgentTransport("openclaw")).toBe("realtime");
    });

    it("returns poll for claude_code", () => {
      expect(getAgentTransport("claude_code")).toBe("poll");
    });

    it("returns poll for unknown types", () => {
      expect(getAgentTransport("unknown")).toBe("poll");
    });
  });

  describe("isRealtimeAgent", () => {
    it("returns true for openclaw", () => {
      expect(isRealtimeAgent("openclaw")).toBe(true);
    });

    it("returns false for claude_code", () => {
      expect(isRealtimeAgent("claude_code")).toBe(false);
    });

    it("returns false for unknown types", () => {
      expect(isRealtimeAgent("unknown")).toBe(false);
    });
  });

  describe("getTypesByTransport", () => {
    it("returns openclaw for realtime", () => {
      expect(getTypesByTransport("realtime")).toEqual(["openclaw"]);
    });

    it("returns claude_code for poll", () => {
      expect(getTypesByTransport("poll")).toEqual(["claude_code"]);
    });
  });
});

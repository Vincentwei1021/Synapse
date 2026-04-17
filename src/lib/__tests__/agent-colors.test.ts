import { describe, it, expect } from "vitest";
import {
  AGENT_COLOR_PALETTE,
  AGENT_COLOR_NAMES,
  DEFAULT_AGENT_COLOR_NAME,
  getAgentColor,
  isValidAgentColorName,
} from "@/lib/agent-colors";

describe("agent-colors", () => {
  it("exposes exactly 12 palette entries with unique names", () => {
    expect(AGENT_COLOR_PALETTE.length).toBe(12);
    expect(new Set(AGENT_COLOR_NAMES).size).toBe(12);
  });

  it("default name is terracotta and resolves to #C67A52", () => {
    expect(DEFAULT_AGENT_COLOR_NAME).toBe("terracotta");
    const first = AGENT_COLOR_PALETTE[0];
    expect(first.name).toBe("terracotta");
    expect(first.primary.toUpperCase()).toBe("#C67A52");
  });

  it("isValidAgentColorName accepts known names and rejects others", () => {
    expect(isValidAgentColorName("terracotta")).toBe(true);
    expect(isValidAgentColorName("violet")).toBe(true);
    expect(isValidAgentColorName("not-a-color")).toBe(false);
    expect(isValidAgentColorName(null)).toBe(false);
    expect(isValidAgentColorName(undefined)).toBe(false);
  });

  it("getAgentColor returns explicit palette entry when name provided", () => {
    const entry = getAgentColor("any-uuid", "violet");
    expect(entry.name).toBe("violet");
  });

  it("getAgentColor ignores invalid explicit name and falls back to hash", () => {
    const entry = getAgentColor("agent-uuid-abc", "not-a-color");
    expect(AGENT_COLOR_NAMES).toContain(entry.name);
  });

  it("getAgentColor is deterministic for same uuid without explicit name", () => {
    const a = getAgentColor("same-uuid", null);
    const b = getAgentColor("same-uuid", undefined);
    expect(a.name).toBe(b.name);
  });

  it("getAgentColor returns a palette entry with primary and light for any uuid", () => {
    const color = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    expect(color.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.light).toMatch(/^#[0-9a-f]{6}$/i);
    const match = AGENT_COLOR_PALETTE.find((c) => c.name === color.name);
    expect(match).toBeDefined();
  });

  it("returns a fallback color for empty string", () => {
    const color = getAgentColor("");
    expect(color.name).toBe("terracotta");
  });
});

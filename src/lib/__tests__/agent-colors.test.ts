import { describe, it, expect } from "vitest";
import { getAgentColor, AGENT_COLOR_PALETTE } from "@/lib/agent-colors";

describe("getAgentColor", () => {
  it("returns a color pair with primary and light keys", () => {
    const color = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    expect(color).toHaveProperty("primary");
    expect(color).toHaveProperty("light");
    expect(color.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.light).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns the same color for the same UUID", () => {
    const a = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    const b = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    expect(a).toEqual(b);
  });

  it("returns a valid palette entry for any UUID", () => {
    const uuids = [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "12345678-1234-1234-1234-123456789abc",
    ];
    for (const uuid of uuids) {
      const color = getAgentColor(uuid);
      const match = AGENT_COLOR_PALETTE.find((c) => c.primary === color.primary && c.light === color.light);
      expect(match).toBeDefined();
    }
  });

  it("returns a fallback color for empty string", () => {
    const color = getAgentColor("");
    expect(color).toHaveProperty("primary");
  });
});

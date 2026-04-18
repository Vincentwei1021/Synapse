import { describe, expect, it } from "vitest";

import { getSidebarSectionFrameGlowColors } from "@/components/sidebar-section-frame.helpers";

describe("getSidebarSectionFrameGlowColors", () => {
  it("uses the first active agent color for the glow treatment", () => {
    expect(
      getSidebarSectionFrameGlowColors([
        { uuid: "agent-a", name: "Agent A", color: "emerald" },
        { uuid: "agent-b", name: "Agent B", color: "rose" },
      ]),
    ).toEqual({
      primary: "#10b981",
      light: "#6ee7b7",
    });
  });

  it("returns null when there are no active agents", () => {
    expect(getSidebarSectionFrameGlowColors([])).toBeNull();
  });
});

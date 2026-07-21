import { describe, it, expect } from "vitest";
import { buildTurnPrompt } from "../prompt-builder";

describe("buildTurnPrompt", () => {
  it("first turn references experiment uuid, title, project, and MCP tools", () => {
    const p = buildTurnPrompt({
      experimentUuid: "exp-1", researchProjectUuid: "proj-1",
      title: "Train A", message: "kick off", isFirstTurn: true,
    });
    expect(p).toContain("exp-1");
    expect(p).toContain("proj-1");
    expect(p).toContain("Train A");
    expect(p).toMatch(/synapse_get_experiment/);
  });

  it("resume turn is a continuation carrying the new message + uuid", () => {
    const p = buildTurnPrompt({ experimentUuid: "exp-2", message: "stop early", isFirstTurn: false });
    expect(p).toContain("exp-2");
    expect(p).toContain("stop early");
  });

  it("tolerates missing title/message/project", () => {
    const p = buildTurnPrompt({ experimentUuid: "exp-3", isFirstTurn: true });
    expect(p).toContain("exp-3");
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
  });
});

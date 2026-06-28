import { describe, it, expect, vi } from "vitest";
import { printPosture } from "../index";

describe("printPosture", () => {
  it("announces safe default posture", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    printPosture({ synapseUrl: "https://s", apiKey: "syn_x", yolo: false, model: null, cwd: "/w" }, logger);
    const out = logger.info.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toContain("mcp__synapse");
    expect(out).not.toContain("syn_x"); // never leak the key
  });

  it("announces yolo posture when enabled", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    printPosture({ synapseUrl: "https://s", apiKey: "syn_x", yolo: true, model: null, cwd: "/w" }, logger);
    const out = logger.info.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toMatch(/dangerously-skip-permissions|YOLO/i);
  });
});

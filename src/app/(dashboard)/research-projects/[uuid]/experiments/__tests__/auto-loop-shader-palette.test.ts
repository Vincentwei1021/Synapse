import { describe, expect, it } from "vitest";
import { autoLoopShaderPalette, type AutoLoopShaderMode } from "../auto-loop-shader-palette";

describe("autoLoopShaderPalette", () => {
  it("returns the human_review palette", () => {
    expect(autoLoopShaderPalette("human_review")).toEqual([
      "#064e3b",
      "#10b981",
      "#34d399",
      "#0ea5e9",
    ]);
  });

  it("returns the full_auto palette", () => {
    expect(autoLoopShaderPalette("full_auto")).toEqual([
      "#064e3b",
      "#10b981",
      "#22d3ee",
      "#a78bfa",
    ]);
  });

  it("falls back to the human_review palette for unknown modes", () => {
    expect(autoLoopShaderPalette("something_else" as AutoLoopShaderMode)).toEqual([
      "#064e3b",
      "#10b981",
      "#34d399",
      "#0ea5e9",
    ]);
  });
});

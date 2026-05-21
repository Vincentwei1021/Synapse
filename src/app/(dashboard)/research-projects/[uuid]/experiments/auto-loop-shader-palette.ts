export type AutoLoopShaderMode = "human_review" | "full_auto";

const HUMAN_REVIEW_PALETTE = ["#064e3b", "#10b981", "#34d399", "#0ea5e9"] as const;
const FULL_AUTO_PALETTE = ["#064e3b", "#10b981", "#22d3ee", "#a78bfa"] as const;

export function autoLoopShaderPalette(mode: AutoLoopShaderMode): readonly string[] {
  if (mode === "full_auto") return FULL_AUTO_PALETTE;
  return HUMAN_REVIEW_PALETTE;
}

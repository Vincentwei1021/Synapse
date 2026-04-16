export const AGENT_COLOR_PALETTE = [
  { primary: "#3b82f6", light: "#93bbfd" },  // Blue (theme-aligned default)
  { primary: "#8b5cf6", light: "#c4b5fd" },  // Violet
  { primary: "#ec4899", light: "#f9a8d4" },  // Pink
  { primary: "#f97316", light: "#fdba74" },  // Orange
  { primary: "#10b981", light: "#6ee7b7" },  // Emerald
  { primary: "#06b6d4", light: "#67e8f9" },  // Cyan
  { primary: "#eab308", light: "#fde047" },  // Yellow
  { primary: "#f43f5e", light: "#fda4af" },  // Rose
  { primary: "#6366f1", light: "#a5b4fc" },  // Indigo
  { primary: "#14b8a6", light: "#5eead4" },  // Teal
  { primary: "#d946ef", light: "#f0abfc" },  // Fuchsia
  { primary: "#84cc16", light: "#bef264" },  // Lime
] as const;

function hashUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getAgentColor(agentUuid: string): { primary: string; light: string } {
  if (!agentUuid) return AGENT_COLOR_PALETTE[0];
  const index = hashUuid(agentUuid) % AGENT_COLOR_PALETTE.length;
  return AGENT_COLOR_PALETTE[index];
}

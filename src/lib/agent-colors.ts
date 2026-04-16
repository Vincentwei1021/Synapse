export const AGENT_COLOR_PALETTE = [
  { primary: "#3b82f6", light: "#60a5fa" },  // Blue
  { primary: "#8b5cf6", light: "#c084fc" },  // Violet
  { primary: "#ec4899", light: "#f472b6" },  // Pink
  { primary: "#f97316", light: "#fb923c" },  // Orange
  { primary: "#10b981", light: "#34d399" },  // Emerald
  { primary: "#06b6d4", light: "#22d3ee" },  // Cyan
  { primary: "#eab308", light: "#facc15" },  // Yellow
  { primary: "#f43f5e", light: "#fb7185" },  // Rose
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

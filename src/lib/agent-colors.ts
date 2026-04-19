// Palette of 12 agent colors used for presence indicators, sidebar activity
// frames, and anywhere else an agent needs a consistent visual identity.

export interface AgentColorEntry {
  name: string;
  primary: string;
  light: string;
}

export const AGENT_COLOR_PALETTE: readonly AgentColorEntry[] = [
  { name: "terracotta", primary: "#C67A52", light: "#e0a882" },
  { name: "violet",     primary: "#8b5cf6", light: "#c4b5fd" },
  { name: "pink",       primary: "#ec4899", light: "#f9a8d4" },
  { name: "orange",     primary: "#f97316", light: "#fdba74" },
  { name: "emerald",    primary: "#10b981", light: "#6ee7b7" },
  { name: "cyan",       primary: "#06b6d4", light: "#67e8f9" },
  { name: "yellow",     primary: "#eab308", light: "#fde047" },
  { name: "rose",       primary: "#f43f5e", light: "#fda4af" },
  { name: "indigo",     primary: "#6366f1", light: "#a5b4fc" },
  { name: "teal",       primary: "#14b8a6", light: "#5eead4" },
  { name: "fuchsia",    primary: "#d946ef", light: "#f0abfc" },
  { name: "lime",       primary: "#84cc16", light: "#bef264" },
] as const;

export const AGENT_COLOR_NAMES = AGENT_COLOR_PALETTE.map((c) => c.name);

export const DEFAULT_AGENT_COLOR_NAME = "terracotta";

const byName = new Map(AGENT_COLOR_PALETTE.map((c) => [c.name, c]));

export function isValidAgentColorName(name: unknown): name is string {
  return typeof name === "string" && byName.has(name);
}

function hashUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getAgentColor(agentUuid: string, explicitName?: string | null): AgentColorEntry {
  if (isValidAgentColorName(explicitName)) {
    return byName.get(explicitName)!;
  }
  if (!agentUuid) return AGENT_COLOR_PALETTE[0];
  const index = hashUuid(agentUuid) % AGENT_COLOR_PALETTE.length;
  return AGENT_COLOR_PALETTE[index];
}

// Agent type → notification transport mapping.
// Transport is an internal concept — never stored in DB or exposed to users.

const AGENT_TRANSPORT_MAP: Record<string, "realtime" | "poll"> = {
  openclaw: "realtime",
  claude_code: "poll",
  codex: "poll",
};

export const VALID_AGENT_TYPES = Object.keys(AGENT_TRANSPORT_MAP);

export function getAgentTransport(agentType: string): "realtime" | "poll" {
  return AGENT_TRANSPORT_MAP[agentType] ?? "poll";
}

export function isRealtimeAgent(agentType: string): boolean {
  return getAgentTransport(agentType) === "realtime";
}

export function isRealtimeForAgent(agentType: string, hasLiveConnection: boolean): boolean {
  if (isRealtimeAgent(agentType)) return true;
  return agentType === "claude_code" && hasLiveConnection;
}

/** Returns all agent types that map to the given transport. */
export function getTypesByTransport(transport: "realtime" | "poll"): string[] {
  return Object.entries(AGENT_TRANSPORT_MAP)
    .filter(([, t]) => t === transport)
    .map(([type]) => type);
}

// src/lib/presence-format.ts
export interface ExecutionViewLite {
  experimentUuid: string; title: string; researchProjectUuid: string;
  liveStatus: string; liveMessage: string | null; liveUpdatedAt: string | null;
}
export interface ConnectionViewLite {
  connectionKey: string; agentUuid: string; agentName: string; clientType: string;
  host: string; cwd: string; status: "online" | "offline";
  connectedAt: string; lastSeenAt: string; executions: ExecutionViewLite[];
}

export function onlineAgentCount(connections: ConnectionViewLite[]): number {
  const agents = new Set<string>();
  for (const c of connections) if (c.status === "online") agents.add(c.agentUuid);
  return agents.size;
}

export function totalActiveExecutions(connections: ConnectionViewLite[]): number {
  let n = 0;
  for (const c of connections) if (c.status === "online") n += c.executions.length;
  return n;
}

export function groupByAgent(
  connections: ConnectionViewLite[],
): { agentUuid: string; agentName: string; connections: ConnectionViewLite[] }[] {
  const order: string[] = [];
  const map = new Map<string, { agentUuid: string; agentName: string; connections: ConnectionViewLite[] }>();
  for (const c of connections) {
    let g = map.get(c.agentUuid);
    if (!g) {
      g = { agentUuid: c.agentUuid, agentName: c.agentName, connections: [] };
      map.set(c.agentUuid, g);
      order.push(c.agentUuid);
    }
    g.connections.push(c);
  }
  return order.map((uuid) => map.get(uuid)!);
}

export function formatUptime(connectedAtIso: string, nowMs: number): string {
  const elapsed = Math.max(0, Math.floor((nowMs - Date.parse(connectedAtIso)) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function parseConnectionsResponse(json: unknown): ConnectionViewLite[] {
  if (json && typeof json === "object" && "data" in json) {
    const data = (json as { data: unknown }).data;
    if (Array.isArray(data)) return data as ConnectionViewLite[];
  }
  return [];
}

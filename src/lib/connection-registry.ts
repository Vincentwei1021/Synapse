// Process-level in-memory registry of live agent connections.
// Keyed by (agentUuid, host, cwd). Liveness is derived from lastSeenAt vs a
// stale threshold; no DB and no Redis — connection liveness is process-local
// and self-heals through periodic heartbeats.

export const STALE_THRESHOLD_MS = 45_000;

export type ConnectionLiveness = "online" | "offline";

export interface ConnectionRecord {
  connectionKey: string;
  agentUuid: string;
  companyUuid: string;
  host: string;
  cwd: string;
  pid: number | null;
  clientType: string;
  connectedAt: number;
  lastSeenAt: number;
}

export interface HeartbeatInput {
  agentUuid: string;
  companyUuid: string;
  host: string;
  cwd: string;
  pid?: number | null;
  clientType: string;
  now: number;
}

// globalThis singleton — Next.js route handlers use separate module graphs.
const globalForRegistry = globalThis as unknown as {
  synapseConnectionRegistry: Map<string, ConnectionRecord> | undefined;
};
const store: Map<string, ConnectionRecord> =
  (globalForRegistry.synapseConnectionRegistry ??= new Map());

export function buildConnectionKey(agentUuid: string, host: string, cwd: string): string {
  return `${agentUuid}::${host}::${cwd}`;
}

export function upsertConnection(input: HeartbeatInput): ConnectionRecord {
  const connectionKey = buildConnectionKey(input.agentUuid, input.host, input.cwd);
  const existing = store.get(connectionKey);
  const record: ConnectionRecord = {
    connectionKey,
    agentUuid: input.agentUuid,
    companyUuid: input.companyUuid,
    host: input.host,
    cwd: input.cwd,
    pid: input.pid ?? null,
    clientType: input.clientType,
    connectedAt: existing?.connectedAt ?? input.now,
    lastSeenAt: input.now,
  };
  store.set(connectionKey, record);
  return record;
}

export function removeConnection(connectionKey: string): void {
  store.delete(connectionKey);
}

export function livenessOf(record: ConnectionRecord, now: number): ConnectionLiveness {
  return now - record.lastSeenAt <= STALE_THRESHOLD_MS ? "online" : "offline";
}

export function listConnections(
  now: number,
  opts: { agentUuids?: string[]; pruneOffline?: boolean } = {},
): ConnectionRecord[] {
  const result: ConnectionRecord[] = [];
  for (const record of store.values()) {
    if (opts.pruneOffline && livenessOf(record, now) === "offline") {
      store.delete(record.connectionKey);
      continue;
    }
    if (opts.agentUuids && !opts.agentUuids.includes(record.agentUuid)) continue;
    result.push(record);
  }
  return result;
}

export function _resetRegistryForTest(): void {
  store.clear();
}

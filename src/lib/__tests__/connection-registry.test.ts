import { describe, it, expect, beforeEach } from "vitest";
import {
  STALE_THRESHOLD_MS,
  buildConnectionKey,
  upsertConnection,
  removeConnection,
  livenessOf,
  listConnections,
  _resetRegistryForTest,
} from "@/lib/connection-registry";

const base = {
  agentUuid: "agent-1",
  companyUuid: "company-1",
  host: "box-a",
  cwd: "/home/ubuntu/Synapse",
  clientType: "openclaw",
};

describe("connection-registry", () => {
  beforeEach(() => _resetRegistryForTest());

  it("builds a stable composite key", () => {
    expect(buildConnectionKey("a", "h", "/c")).toBe("a::h::/c");
  });

  it("upsert creates then updates the same record by key", () => {
    const first = upsertConnection({ ...base, pid: 100, now: 1_000 });
    expect(first.connectedAt).toBe(1_000);
    expect(first.lastSeenAt).toBe(1_000);

    const second = upsertConnection({ ...base, pid: 100, now: 5_000 });
    expect(second.connectionKey).toBe(first.connectionKey);
    expect(second.connectedAt).toBe(1_000); // preserved
    expect(second.lastSeenAt).toBe(5_000); // advanced
    expect(listConnections(5_000)).toHaveLength(1);
  });

  it("different cwd is a distinct connection", () => {
    upsertConnection({ ...base, now: 1_000 });
    upsertConnection({ ...base, cwd: "/other", now: 1_000 });
    expect(listConnections(1_000)).toHaveLength(2);
  });

  it("liveness is online within threshold, offline past it", () => {
    const rec = upsertConnection({ ...base, now: 1_000 });
    expect(livenessOf(rec, 1_000 + STALE_THRESHOLD_MS - 1)).toBe("online");
    expect(livenessOf(rec, 1_000 + STALE_THRESHOLD_MS + 1)).toBe("offline");
  });

  it("listConnections filters by agentUuids", () => {
    upsertConnection({ ...base, now: 1_000 });
    upsertConnection({ ...base, agentUuid: "agent-2", now: 1_000 });
    const only = listConnections(1_000, { agentUuids: ["agent-2"] });
    expect(only).toHaveLength(1);
    expect(only[0].agentUuid).toBe("agent-2");
  });

  it("pruneOffline drops stale records from the store", () => {
    upsertConnection({ ...base, now: 1_000 });
    const after = listConnections(1_000 + STALE_THRESHOLD_MS + 1, { pruneOffline: true });
    expect(after).toHaveLength(0);
    // confirm it was actually removed, not just filtered
    expect(listConnections(1_000)).toHaveLength(0);
  });

  it("removeConnection deletes by key", () => {
    const rec = upsertConnection({ ...base, now: 1_000 });
    removeConnection(rec.connectionKey);
    expect(listConnections(1_000)).toHaveLength(0);
  });
});

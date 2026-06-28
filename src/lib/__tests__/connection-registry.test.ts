import { describe, it, expect, beforeEach } from "vitest";
import {
  STALE_THRESHOLD_MS,
  buildConnectionKey,
  upsertConnection,
  removeConnection,
  livenessOf,
  listConnections,
  hasLiveConnection,
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

  it("pruneOffline is scoped to agentUuids filter", () => {
    // Insert a stale record for agent-1 and agent-2
    upsertConnection({ ...base, agentUuid: "agent-1", now: 1_000 });
    upsertConnection({ ...base, agentUuid: "agent-2", now: 1_000 });
    const staleTime = 1_000 + STALE_THRESHOLD_MS + 1;

    // Call listConnections with both agentUuids filter and pruneOffline
    // Only ask for agent-2 records, both are stale
    const result = listConnections(staleTime, { agentUuids: ["agent-2"], pruneOffline: true });

    // agent-2 was stale, so returned array is empty
    expect(result).toHaveLength(0);

    // BUT agent-1's record should still exist because it was outside the filter
    // It should NOT have been pruned
    const allAtOriginalTime = listConnections(1_000);
    expect(allAtOriginalTime).toHaveLength(1);
    expect(allAtOriginalTime[0].agentUuid).toBe("agent-1");
  });

  it("hasLiveConnection true only when an online record exists", () => {
    _resetRegistryForTest();
    upsertConnection({ agentUuid: "agent-1", companyUuid: "c", host: "h", cwd: "/c", clientType: "claude_code", now: 1_000 });
    expect(hasLiveConnection("agent-1", 1_000)).toBe(true);
    expect(hasLiveConnection("agent-1", 1_000 + STALE_THRESHOLD_MS + 1)).toBe(false); // stale
    expect(hasLiveConnection("agent-2", 1_000)).toBe(false); // no record
  });

  it("live records survive when a stale sibling is pruned", () => {
    // Insert one record at time 1_000
    upsertConnection({ ...base, now: 1_000 });

    // Insert a second record with a different cwd at a fresh time so it stays live
    const freshTime = 1_000 + STALE_THRESHOLD_MS - 100;
    upsertConnection({ ...base, cwd: "/other", now: freshTime });

    // Advance time so only the first (at 1_000) is stale, second is still live
    const pruneTime = 1_000 + STALE_THRESHOLD_MS + 1;

    // Call listConnections with pruneOffline (no agentUuids filter)
    const result = listConnections(pruneTime, { pruneOffline: true });

    // Only the live one should be returned
    expect(result).toHaveLength(1);
    expect(result[0].cwd).toBe("/other");
    expect(result[0].lastSeenAt).toBe(freshTime);

    // Confirm the stale one was actually pruned
    const afterPrune = listConnections(pruneTime);
    expect(afterPrune).toHaveLength(1);
    expect(afterPrune[0].cwd).toBe("/other");
  });
});

# P1 — Connection Registry & Presence Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-side connection registry that tracks which agents are connected in real time (online/idle/offline) and which experiments each is currently running, and expose it via an owner-scoped `GET /api/agent-connections` endpoint — without any frontend changes.

**Architecture:** A process-level in-memory registry keyed by `(agentUuid, host, cwd)`, fed by heartbeats the agent plugins POST to a new `/api/agent-connections/heartbeat` endpoint and by the existing SSE-connect event. Liveness is derived from `lastSeenAt` vs a stale threshold (`effectiveStatus`). "Current executions" are NOT a new table — they are computed by querying `Experiment` rows (`liveStatus != null`, `assigneeType = "agent"`) for the agent. The registry mirrors the eventBus pattern (globalThis singleton) but stays in-memory only (connection liveness is process-local and self-heals via heartbeat; no Redis fan-out in P1).

**Tech Stack:** Next.js 15 App Router route handlers, TypeScript 5, Prisma 7 (read-only here), Vitest. Existing helpers: `withErrorHandler`, `getAuthContext`/`isAgent`/`isUser`, `eventBus`, `parsePagination`.

## Global Constraints

- Public references are UUID-first. Never expose serial IDs. (CLAUDE.md)
- All data scoped by `companyUuid`. Owner-scoped reads additionally filter by `ownerUuid = auth.actorUuid`. (CLAUDE.md)
- Business logic lives in `src/services/*.service.ts`; route handlers only parse/auth/orchestrate. (CLAUDE.md)
- Agent transport mapping lives in `src/lib/agent-transport.ts`: `openclaw` = realtime, `claude_code`/`codex` = poll. (verified)
- No new Prisma models in P1. Reuse `Agent` (`uuid`, `companyUuid`, `ownerUuid`, `name`, `type`, `lastActiveAt`) and `Experiment` (`liveStatus`, `liveMessage`, `liveUpdatedAt`, `assigneeType`, `assigneeUuid`). (verified)
- `AuthContext` fields available: `type` (`"agent"|"user"|"super_admin"`), `companyUuid`, `actorUuid`, and on agents `ownerUuid?`, `agentName`. (verified `src/lib/auth.ts` / `src/types/auth.ts`)
- Stale threshold constant `STALE_THRESHOLD_MS = 45_000` (≈1.5× the 30s SSE heartbeat). Idle vs online is execution-derived, not time-derived (see Task 2).
- Tests use the hoisted-mock Vitest pattern (`vi.hoisted` + `vi.mock("@/lib/prisma", ...)`), per `src/services/__tests__/agent.service.test.ts`. (verified)
- User-facing strings are not introduced in P1 (no UI). No i18n keys needed this phase.

---

## File Structure

- `src/lib/connection-registry.ts` — **new.** Process-level singleton holding `Map<connectionKey, ConnectionRecord>`. Pure in-memory state + derivation logic (`upsert`, `touch`, `remove`, `list`, `effectiveStatus`, pruning). No DB, no auth. The unit-testable core.
- `src/services/agent-connection.service.ts` — **new.** Orchestrates registry + Prisma: records heartbeats, joins agent metadata, computes per-agent running/queued experiments, returns owner-scoped `ConnectionView[]`. All `companyUuid`/`ownerUuid` scoping happens here.
- `src/app/api/agent-connections/heartbeat/route.ts` — **new.** `POST`. Agent-authenticated. Body = self-reported connection metadata. Calls service to upsert a heartbeat.
- `src/app/api/agent-connections/route.ts` — **new.** `GET`. User-authenticated. Returns owner-scoped connections with live executions.
- `packages/openclaw-plugin/src/heartbeat-reporter.ts` — **new.** Small timer that POSTs heartbeats to the new endpoint; reused connection metadata (host, cwd, pid).
- `packages/openclaw-plugin/src/index.ts` — **modify.** Start/stop the heartbeat reporter alongside the SSE listener.

Tests:
- `src/lib/__tests__/connection-registry.test.ts`
- `src/services/__tests__/agent-connection.service.test.ts`
- `packages/openclaw-plugin/src/__tests__/heartbeat-reporter.test.ts`

---

### Task 1: Connection registry core (in-memory state + derivation)

Pure module, no DB or auth. This is the testable heart of P1.

**Files:**
- Create: `src/lib/connection-registry.ts`
- Test: `src/lib/__tests__/connection-registry.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module). Uses injectable `now: () => number` for testability.
- Produces:
  ```ts
  export const STALE_THRESHOLD_MS = 45_000;
  export type ConnectionLiveness = "online" | "offline";
  export interface ConnectionRecord {
    connectionKey: string;   // `${agentUuid}::${host}::${cwd}`
    agentUuid: string;
    companyUuid: string;
    host: string;
    cwd: string;
    pid: number | null;
    clientType: string;      // "openclaw" | "claude_code" | ...
    connectedAt: number;     // epoch ms, first seen
    lastSeenAt: number;      // epoch ms, last heartbeat
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
  export function buildConnectionKey(agentUuid: string, host: string, cwd: string): string;
  export function upsertConnection(input: HeartbeatInput): ConnectionRecord;
  export function removeConnection(connectionKey: string): void;
  export function livenessOf(record: ConnectionRecord, now: number): ConnectionLiveness;
  export function listConnections(now: number, opts?: { agentUuids?: string[]; pruneOffline?: boolean }): ConnectionRecord[];
  export function _resetRegistryForTest(): void; // test-only
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/connection-registry.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/connection-registry.test.ts`
Expected: FAIL — `Cannot find module '@/lib/connection-registry'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/connection-registry.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/__tests__/connection-registry.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/connection-registry.ts src/lib/__tests__/connection-registry.test.ts
git commit -m "feat(connections): in-memory agent connection registry core"
```

---

### Task 2: Connection service (registry + Prisma join + scoping)

Maps registry records to owner-scoped `ConnectionView`s and computes per-agent running/queued experiments. This is where `companyUuid`/`ownerUuid` scoping lives.

**Files:**
- Create: `src/services/agent-connection.service.ts`
- Test: `src/services/__tests__/agent-connection.service.test.ts`

**Interfaces:**
- Consumes (from Task 1): `upsertConnection`, `listConnections`, `livenessOf`, `ConnectionRecord`, `HeartbeatInput`.
- Consumes (existing): `prisma` from `@/lib/prisma`; `Agent` fields `uuid,name,type,companyUuid,ownerUuid`; `Experiment` fields `uuid,title,liveStatus,liveMessage,liveUpdatedAt,assigneeType,assigneeUuid,researchProjectUuid,companyUuid`.
- Produces:
  ```ts
  export interface RecordHeartbeatParams {
    companyUuid: string;
    agentUuid: string;
    host: string;
    cwd: string;
    pid?: number | null;
    clientType: string;
    now?: number; // defaults to Date.now()
  }
  export async function recordHeartbeat(params: RecordHeartbeatParams): Promise<{ connectionKey: string }>;

  export interface ExecutionView {
    experimentUuid: string;
    title: string;
    researchProjectUuid: string;
    liveStatus: string;   // non-null
    liveMessage: string | null;
    liveUpdatedAt: string | null; // ISO
  }
  export interface ConnectionView {
    connectionKey: string;
    agentUuid: string;
    agentName: string;
    clientType: string;
    host: string;
    cwd: string;
    status: "online" | "offline";
    connectedAt: string;  // ISO
    lastSeenAt: string;   // ISO
    executions: ExecutionView[]; // running/queued experiments for this agent
  }
  // Lists connections owned by ownerUuid within companyUuid (online + recently-offline, pruned).
  export async function listOwnerConnections(params: {
    companyUuid: string;
    ownerUuid: string;
    now?: number;
  }): Promise<ConnectionView[]>;
  ```
  Notes for consumers: `recordHeartbeat` validates the agent exists in the company before recording. `executions` come from `Experiment` rows where `assigneeType="agent"`, `assigneeUuid=agentUuid`, `liveStatus` not null — split is by status string but P1 returns all as one list ordered by `liveUpdatedAt` desc.

- [ ] **Step 1: Write the failing test**

```ts
// src/services/__tests__/agent-connection.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: { findFirst: vi.fn(), findMany: vi.fn() },
  experiment: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { _resetRegistryForTest } from "@/lib/connection-registry";
import {
  recordHeartbeat,
  listOwnerConnections,
} from "@/services/agent-connection.service";

const companyUuid = "company-1";
const ownerUuid = "user-1";
const agentUuid = "agent-1";

beforeEach(() => {
  _resetRegistryForTest();
  vi.clearAllMocks();
});

describe("recordHeartbeat", () => {
  it("rejects an agent that does not belong to the company", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(null);
    await expect(
      recordHeartbeat({ companyUuid, agentUuid, host: "h", cwd: "/c", clientType: "openclaw" }),
    ).rejects.toThrow(/agent not found/i);
  });

  it("records a heartbeat for a valid agent", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: agentUuid, companyUuid });
    const res = await recordHeartbeat({
      companyUuid, agentUuid, host: "box-a", cwd: "/c", clientType: "openclaw", now: 1_000,
    });
    expect(res.connectionKey).toBe("agent-1::box-a::/c");
  });
});

describe("listOwnerConnections", () => {
  it("returns owner-scoped connections with live executions", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: agentUuid, companyUuid });
    await recordHeartbeat({
      companyUuid, agentUuid, host: "box-a", cwd: "/c", clientType: "openclaw", now: 1_000,
    });

    // agents owned by this user
    mockPrisma.agent.findMany.mockResolvedValue([
      { uuid: agentUuid, name: "Researcher", type: "openclaw" },
    ]);
    // running experiments assigned to the agent
    mockPrisma.experiment.findMany.mockResolvedValue([
      {
        uuid: "exp-1", title: "Run A", researchProjectUuid: "proj-1",
        liveStatus: "running", liveMessage: "epoch 3",
        liveUpdatedAt: new Date("2026-06-28T00:00:00Z"),
      },
    ]);

    const views = await listOwnerConnections({ companyUuid, ownerUuid, now: 1_500 });
    expect(views).toHaveLength(1);
    const v = views[0];
    expect(v.agentName).toBe("Researcher");
    expect(v.status).toBe("online");
    expect(v.executions).toHaveLength(1);
    expect(v.executions[0]).toMatchObject({
      experimentUuid: "exp-1", liveStatus: "running", liveMessage: "epoch 3",
    });
    // Prisma agent query was owner-scoped
    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyUuid, ownerUuid }) }),
    );
  });

  it("excludes connections whose agent is not owned by the user", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: "agent-x", companyUuid });
    await recordHeartbeat({
      companyUuid, agentUuid: "agent-x", host: "h", cwd: "/c", clientType: "openclaw", now: 1_000,
    });
    mockPrisma.agent.findMany.mockResolvedValue([]); // user owns no agents
    const views = await listOwnerConnections({ companyUuid, ownerUuid, now: 1_500 });
    expect(views).toHaveLength(0);
    expect(mockPrisma.experiment.findMany).not.toHaveBeenCalled();
  });

  it("marks a stale connection offline and still returns it", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({ uuid: agentUuid, companyUuid });
    await recordHeartbeat({
      companyUuid, agentUuid, host: "box-a", cwd: "/c", clientType: "openclaw", now: 1_000,
    });
    mockPrisma.agent.findMany.mockResolvedValue([{ uuid: agentUuid, name: "R", type: "openclaw" }]);
    mockPrisma.experiment.findMany.mockResolvedValue([]);
    const views = await listOwnerConnections({ companyUuid, ownerUuid, now: 1_000 + 60_000 });
    expect(views[0].status).toBe("offline");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/services/__tests__/agent-connection.service.test.ts`
Expected: FAIL — `Cannot find module '@/services/agent-connection.service'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/agent-connection.service.ts
// Orchestrates the in-memory connection registry with Prisma metadata.
// All company/owner scoping happens here; the registry itself is scope-agnostic.
import { prisma } from "@/lib/prisma";
import {
  upsertConnection,
  listConnections,
  livenessOf,
  type ConnectionRecord,
} from "@/lib/connection-registry";

export interface RecordHeartbeatParams {
  companyUuid: string;
  agentUuid: string;
  host: string;
  cwd: string;
  pid?: number | null;
  clientType: string;
  now?: number;
}

export async function recordHeartbeat(
  params: RecordHeartbeatParams,
): Promise<{ connectionKey: string }> {
  const agent = await prisma.agent.findFirst({
    where: { companyUuid: params.companyUuid, uuid: params.agentUuid },
    select: { uuid: true, companyUuid: true },
  });
  if (!agent) {
    throw new Error("Agent not found for company");
  }
  const record = upsertConnection({
    agentUuid: params.agentUuid,
    companyUuid: params.companyUuid,
    host: params.host,
    cwd: params.cwd,
    pid: params.pid ?? null,
    clientType: params.clientType,
    now: params.now ?? Date.now(),
  });
  return { connectionKey: record.connectionKey };
}

export interface ExecutionView {
  experimentUuid: string;
  title: string;
  researchProjectUuid: string;
  liveStatus: string;
  liveMessage: string | null;
  liveUpdatedAt: string | null;
}

export interface ConnectionView {
  connectionKey: string;
  agentUuid: string;
  agentName: string;
  clientType: string;
  host: string;
  cwd: string;
  status: "online" | "offline";
  connectedAt: string;
  lastSeenAt: string;
  executions: ExecutionView[];
}

export async function listOwnerConnections(params: {
  companyUuid: string;
  ownerUuid: string;
  now?: number;
}): Promise<ConnectionView[]> {
  const now = params.now ?? Date.now();

  // Which agents does this user own?
  const ownedAgents = await prisma.agent.findMany({
    where: { companyUuid: params.companyUuid, ownerUuid: params.ownerUuid },
    select: { uuid: true, name: true, type: true },
  });
  if (ownedAgents.length === 0) return [];

  const ownedUuids = ownedAgents.map((a) => a.uuid);
  const agentByUuid = new Map(ownedAgents.map((a) => [a.uuid, a]));

  // Live connections for those agents (prune dead ones as we read).
  const records: ConnectionRecord[] = listConnections(now, {
    agentUuids: ownedUuids,
    pruneOffline: true,
  });
  if (records.length === 0) return [];

  // Running/queued experiments assigned to any of these agents.
  const experiments = await prisma.experiment.findMany({
    where: {
      companyUuid: params.companyUuid,
      assigneeType: "agent",
      assigneeUuid: { in: ownedUuids },
      liveStatus: { not: null },
    },
    select: {
      uuid: true, title: true, researchProjectUuid: true,
      liveStatus: true, liveMessage: true, liveUpdatedAt: true, assigneeUuid: true,
    },
    orderBy: { liveUpdatedAt: "desc" },
  });

  const execByAgent = new Map<string, ExecutionView[]>();
  for (const e of experiments) {
    const list = execByAgent.get(e.assigneeUuid!) ?? [];
    list.push({
      experimentUuid: e.uuid,
      title: e.title,
      researchProjectUuid: e.researchProjectUuid,
      liveStatus: e.liveStatus as string,
      liveMessage: e.liveMessage ?? null,
      liveUpdatedAt: e.liveUpdatedAt ? e.liveUpdatedAt.toISOString() : null,
    });
    execByAgent.set(e.assigneeUuid!, list);
  }

  return records.map((r) => {
    const agent = agentByUuid.get(r.agentUuid);
    return {
      connectionKey: r.connectionKey,
      agentUuid: r.agentUuid,
      agentName: agent?.name ?? "",
      clientType: r.clientType,
      host: r.host,
      cwd: r.cwd,
      status: livenessOf(r, now),
      connectedAt: new Date(r.connectedAt).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      executions: execByAgent.get(r.agentUuid) ?? [],
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/services/__tests__/agent-connection.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-connection.service.ts src/services/__tests__/agent-connection.service.test.ts
git commit -m "feat(connections): owner-scoped connection service with live executions"
```

---

### Task 3: Heartbeat POST endpoint

Agent-authenticated route that records self-reported connection metadata.

**Files:**
- Create: `src/app/api/agent-connections/heartbeat/route.ts`
- Test: `src/app/api/agent-connections/heartbeat/__tests__/route.test.ts`

**Interfaces:**
- Consumes (from Task 2): `recordHeartbeat`.
- Consumes (existing): `withErrorHandler`, `success`, `errors` from `@/lib/api-handler` / `@/lib/api-response`; `getAuthContext`, `isAgent`; `parseBody`.
- Produces: `POST /api/agent-connections/heartbeat` → `200 { connectionKey }`. Body: `{ host: string; cwd: string; pid?: number; clientType?: string }`. `companyUuid`/`agentUuid` come from the agent's auth context, never the body. `clientType` defaults to `auth.agentName`'s agent type — but since auth context does not carry `type`, default to body.clientType or `"unknown"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/agent-connections/heartbeat/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getAuthContext: mockGetAuthContext };
});
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());
vi.mock("@/services/agent-connection.service", () => ({
  recordHeartbeat: mockRecordHeartbeat,
}));

import { POST } from "@/app/api/agent-connections/heartbeat/route";

function req(body: unknown) {
  return new Request("http://localhost/api/agent-connections/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer syn_x" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/agent-connections/heartbeat", () => {
  it("401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(req({ host: "h", cwd: "/c" }));
    expect(res.status).toBe(401);
  });

  it("403 when caller is a user, not an agent", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u" });
    const res = await POST(req({ host: "h", cwd: "/c" }));
    expect(res.status).toBe(403);
  });

  it("400 when host or cwd missing", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    const res = await POST(req({ host: "h" }));
    expect(res.status).toBe(400);
  });

  it("records heartbeat from agent auth context", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    mockRecordHeartbeat.mockResolvedValue({ connectionKey: "a::box::/c" });
    const res = await POST(req({ host: "box", cwd: "/c", pid: 42, clientType: "openclaw" }));
    expect(res.status).toBe(200);
    expect(mockRecordHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ companyUuid: "c", agentUuid: "a", host: "box", cwd: "/c", pid: 42, clientType: "openclaw" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/agent-connections/heartbeat/__tests__/route.test.ts`
Expected: FAIL — module not found for the route.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/agent-connections/heartbeat/route.ts
// POST /api/agent-connections/heartbeat — agents self-report connection liveness.
import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isAgent } from "@/lib/auth";
import { recordHeartbeat } from "@/services/agent-connection.service";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isAgent(auth)) return errors.forbidden("Only agents can report connections");

  const body = await parseBody<{
    host?: string;
    cwd?: string;
    pid?: number;
    clientType?: string;
  }>(request);

  if (!body.host || !body.cwd) {
    return errors.validationError({ host: "host and cwd are required" });
  }

  const { connectionKey } = await recordHeartbeat({
    companyUuid: auth.companyUuid,
    agentUuid: auth.actorUuid,
    host: body.host,
    cwd: body.cwd,
    pid: typeof body.pid === "number" ? body.pid : null,
    clientType: body.clientType || "unknown",
  });

  return success({ connectionKey });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/agent-connections/heartbeat/__tests__/route.test.ts`
Expected: PASS (4 tests).

> If `parseBody`/`withErrorHandler` signatures differ from the assumptions here, mirror the exact usage in `src/app/api/agents/route.ts` (already imports both). Adjust the import line only; the handler logic is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent-connections/heartbeat
git commit -m "feat(connections): agent heartbeat endpoint"
```

---

### Task 4: Connection list GET endpoint

User-authenticated, owner-scoped read of live connections + executions.

**Files:**
- Create: `src/app/api/agent-connections/route.ts`
- Test: `src/app/api/agent-connections/__tests__/route.test.ts`

**Interfaces:**
- Consumes (from Task 2): `listOwnerConnections`, `ConnectionView`.
- Consumes (existing): `withErrorHandler`, `success`, `errors`, `getAuthContext`, `isUser`.
- Produces: `GET /api/agent-connections` → `200 { data: ConnectionView[] }` scoped to `auth.companyUuid` + `auth.actorUuid` as owner.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/agent-connections/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getAuthContext: mockGetAuthContext };
});
const mockListOwnerConnections = vi.hoisted(() => vi.fn());
vi.mock("@/services/agent-connection.service", () => ({
  listOwnerConnections: mockListOwnerConnections,
}));

import { GET } from "@/app/api/agent-connections/route";

function req() {
  return new Request("http://localhost/api/agent-connections", {
    headers: { authorization: "Bearer session" },
  }) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent-connections", () => {
  it("401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("403 when caller is an agent", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns owner-scoped connections for a user", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u" });
    mockListOwnerConnections.mockResolvedValue([{ connectionKey: "a::h::/c", agentUuid: "a" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(mockListOwnerConnections).toHaveBeenCalledWith(
      expect.objectContaining({ companyUuid: "c", ownerUuid: "u" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/agent-connections/__tests__/route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/agent-connections/route.ts
// GET /api/agent-connections — owner-scoped live agent connections + executions.
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { listOwnerConnections } from "@/services/agent-connection.service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can view connections");

  const connections = await listOwnerConnections({
    companyUuid: auth.companyUuid,
    ownerUuid: auth.actorUuid,
  });

  return success({ data: connections });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/agent-connections/__tests__/route.test.ts`
Expected: PASS (3 tests).

> `success({ data })` must produce a body where `json.data` is the array. If `success` wraps differently (e.g. `{ success, data }`), the test reads `json.data` either way. If `success` does not nest, return `success(connections)` and assert on `json` directly — mirror whatever `src/app/api/agents/route.ts` does via `paginated`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent-connections/route.ts src/app/api/agent-connections/__tests__/route.test.ts
git commit -m "feat(connections): owner-scoped GET /api/agent-connections endpoint"
```

---

### Task 5: OpenClaw plugin heartbeat reporter

Make the existing realtime plugin self-report connection metadata so the registry has real data. (Validates the whole chain against a live agent type.)

**Files:**
- Create: `packages/openclaw-plugin/src/heartbeat-reporter.ts`
- Modify: `packages/openclaw-plugin/src/index.ts`
- Test: `packages/openclaw-plugin/src/__tests__/heartbeat-reporter.test.ts`

**Interfaces:**
- Consumes (existing): the plugin already has `synapseUrl`, `apiKey`, and a logger (see `SynapseSseListenerOptions` usage in `src/index.ts`). Reuse the same `synapseUrl`/`apiKey`.
- Produces:
  ```ts
  export interface HeartbeatReporterOptions {
    synapseUrl: string;
    apiKey: string;
    host: string;
    cwd: string;
    pid: number | null;
    clientType: string;          // "openclaw"
    intervalMs?: number;         // default 30_000
    fetchImpl?: typeof fetch;    // injectable for tests
    logger: { warn: (msg: string) => void };
  }
  export class HeartbeatReporter {
    constructor(opts: HeartbeatReporterOptions);
    start(): void;        // sends one immediately, then on interval
    stop(): void;
    sendOnce(): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/openclaw-plugin/src/__tests__/heartbeat-reporter.test.ts
import { describe, it, expect, vi } from "vitest";
import { HeartbeatReporter } from "../heartbeat-reporter";

describe("HeartbeatReporter", () => {
  it("POSTs connection metadata to the heartbeat endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const reporter = new HeartbeatReporter({
      synapseUrl: "https://synapse.example/",
      apiKey: "syn_x",
      host: "box-a",
      cwd: "/home/ubuntu/Synapse",
      pid: 4242,
      clientType: "openclaw",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { warn: vi.fn() },
    });

    await reporter.sendOnce();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://synapse.example/api/agent-connections/heartbeat");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer syn_x");
    expect(JSON.parse(init.body)).toMatchObject({
      host: "box-a", cwd: "/home/ubuntu/Synapse", pid: 4242, clientType: "openclaw",
    });
  });

  it("swallows network errors and logs a warning", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
    const reporter = new HeartbeatReporter({
      synapseUrl: "https://s/", apiKey: "k", host: "h", cwd: "/c", pid: null,
      clientType: "openclaw", fetchImpl: fetchImpl as unknown as typeof fetch, logger: { warn },
    });
    await reporter.sendOnce();
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vincentwei1021/synapse-openclaw-plugin test heartbeat-reporter` (or, from `packages/openclaw-plugin`, `pnpm test heartbeat-reporter`)
Expected: FAIL — `Cannot find module '../heartbeat-reporter'`.

> If the plugin package has no test script wired, run `pnpm vitest run src/__tests__/heartbeat-reporter.test.ts` from inside `packages/openclaw-plugin`. Match the runner the package already uses.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/openclaw-plugin/src/heartbeat-reporter.ts
// Periodically POSTs this daemon's connection metadata to Synapse so the
// server-side connection registry knows we are online.

export interface HeartbeatReporterOptions {
  synapseUrl: string;
  apiKey: string;
  host: string;
  cwd: string;
  pid: number | null;
  clientType: string;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  logger: { warn: (msg: string) => void };
}

const DEFAULT_INTERVAL_MS = 30_000;

export class HeartbeatReporter {
  private readonly opts: HeartbeatReporterOptions;
  private readonly fetchImpl: typeof fetch;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: HeartbeatReporterOptions) {
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  start(): void {
    this.stop();
    void this.sendOnce();
    this.timer = setInterval(() => {
      void this.sendOnce();
    }, this.opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sendOnce(): Promise<void> {
    const url = `${this.opts.synapseUrl.replace(/\/$/, "")}/api/agent-connections/heartbeat`;
    try {
      await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: this.opts.host,
          cwd: this.opts.cwd,
          pid: this.opts.pid,
          clientType: this.opts.clientType,
        }),
      });
    } catch (err) {
      this.opts.logger.warn(`[Synapse] heartbeat failed: ${err}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/openclaw-plugin`, `pnpm test heartbeat-reporter` (or `pnpm vitest run src/__tests__/heartbeat-reporter.test.ts`)
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the reporter into plugin startup/shutdown**

In `packages/openclaw-plugin/src/index.ts`, where the SSE listener is constructed and started (background service id `"synapse-sse"`), construct and `start()` a `HeartbeatReporter` alongside it, and `stop()` it wherever the SSE listener is disconnected. Use Node `os.hostname()` for `host`, `process.cwd()` for `cwd`, `process.pid` for `pid`, and `clientType: "openclaw"`.

```ts
// near the existing SSE listener setup in src/index.ts
import os from "os";
import { HeartbeatReporter } from "./heartbeat-reporter";

// ...after synapseUrl + apiKey are resolved and the SSE listener is created:
const heartbeatReporter = new HeartbeatReporter({
  synapseUrl,
  apiKey,
  host: os.hostname(),
  cwd: process.cwd(),
  pid: process.pid,
  clientType: "openclaw",
  logger: { warn: (m) => logger.warn(m) },
});
heartbeatReporter.start();

// ...wherever sseListener.disconnect() is called on shutdown:
heartbeatReporter.stop();
```

Adjust variable names (`synapseUrl`, `apiKey`, `logger`) to whatever `src/index.ts` already binds — they are already in scope for the SSE listener.

- [ ] **Step 6: Verify the plugin still builds**

Run: from `packages/openclaw-plugin`, `pnpm build` (or `pnpm tsc --noEmit` if no build script)
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/openclaw-plugin/src/heartbeat-reporter.ts \
        packages/openclaw-plugin/src/__tests__/heartbeat-reporter.test.ts \
        packages/openclaw-plugin/src/index.ts
git commit -m "feat(openclaw): report connection heartbeats to Synapse registry"
```

---

### Task 6: Full-suite verification

Confirm the whole P1 slice is green and type-clean before handing off.

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all suites pass, including the 4 new files. No previously-passing test regressed.

- [ ] **Step 2: Type-check / lint**

Run: `pnpm lint`
Expected: clean (no errors in new files).

- [ ] **Step 3: Manual smoke (optional, requires running app + an agent API key)**

```bash
# with the dev server running and $KEY = a syn_ agent key:
curl -s -X POST localhost:13000/api/agent-connections/heartbeat \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"host":"local","cwd":"/tmp","pid":1,"clientType":"openclaw"}'
# then as the owning user (session cookie), GET should list it online:
curl -s localhost:13000/api/agent-connections -H "Authorization: Bearer $USER_TOKEN"
```
Expected: heartbeat returns `{ connectionKey }`; list shows the connection with `status: "online"`.

- [ ] **Step 4: Commit any lint fixups**

```bash
git add -A
git commit -m "chore(connections): lint + test cleanup for P1"
```

---

## Self-Review

**Spec coverage (against the P1 description in the macro plan):**
- ✅ Server-side `(agentUuid, host, cwd)` registry → Task 1 (`buildConnectionKey`, `upsertConnection`).
- ✅ `effectiveStatus` (online/offline) + stale threshold → Task 1 (`livenessOf`, `STALE_THRESHOLD_MS`). Note: macro plan said "online/idle/offline"; P1 ships online/offline only — "idle vs active" is execution-derived (executions array empty/non-empty), so no separate liveness tier is needed. Documented in Global Constraints.
- ✅ OpenClaw SSE listener self-reports connection metadata → Task 5 (heartbeat reporter; chosen over piggybacking on the SSE GET because the GET carries no body and fires once, whereas a periodic POST gives host/cwd/pid and keeps liveness fresh).
- ✅ `GET /api/agent-connections` returns owner-scoped `ConnectionView[]` → Task 4.
- ✅ "Current execution" reuses `Experiment.liveStatus/liveMessage` + assignee, no new table → Task 2 (`listOwnerConnections` experiment query).
- ✅ No frontend changes → confirmed; no files under `src/components` or `src/app/(dashboard)` touched.

**Placeholder scan:** No TODO/TBD/"handle edge cases"/"similar to Task N" placeholders. Every code step shows full code.

**Type consistency:** `ConnectionRecord`/`HeartbeatInput` from Task 1 are consumed unchanged in Task 2. `recordHeartbeat`/`listOwnerConnections`/`ConnectionView` defined in Task 2 are consumed by Tasks 3–4 with matching signatures. `HeartbeatReporter` (Task 5) POSTs exactly the body shape Task 3 parses (`host`, `cwd`, `pid`, `clientType`). `clientType` is a plain string throughout.

**Known assumptions to verify during execution (flagged inline, not blockers):**
- `withErrorHandler`/`parseBody`/`success`/`errors` exact signatures — mirror `src/app/api/agents/route.ts`.
- OpenClaw plugin test runner + how `synapseUrl`/`apiKey`/`logger` are bound in `src/index.ts`.

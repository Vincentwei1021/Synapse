# P3 — Agent Presence & Execution Observation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface live agent connection state (built in P1/P2) in the product UI: an online dot + active-task count in the @mention dropdown, a sidebar "N agents online" pill with a popover listing what each connection is running, a connections section in the existing `/agents` detail panel, and a reusable `ExecutionRow` that deep-links to the experiment detail panel.

**Architecture:** All four surfaces read the P1 connection registry through owner-scoped HTTP endpoints (no new realtime channel — the registry is process-local and self-heals via the P2 heartbeat). The sidebar pill/popover and the `/agents` connections section poll `GET /api/agent-connections` (~15s). The @mention dropdown gets `online`/`activeCount` fields added to the existing `GET /api/mentionables` payload (computed server-side via `agentHasLiveConnection`). A single shell-level `AgentPresenceProvider` owns one poll + exposes the data to the pill, popover, and (where mounted) other consumers, so there is no duplicate fetching.

**Tech Stack:** Next.js 15 App Router (client components for live UI), React 19, TypeScript 5, Tailwind 4, next-intl, existing shadcn primitives (Badge, Popover, Avatar/AvatarBadge, Tooltip, ScrollArea, Skeleton), Vitest. Reuses P1: `GET /api/agent-connections` → `ConnectionView[]`, `agentHasLiveConnection(agentUuid, now?)`.

## Global Constraints

- User-facing text MUST use i18n keys in BOTH `messages/en.json` and `messages/zh.json`. New keys under a new top-level `"presence"` section (e.g. `presence.agentsOnline`, `presence.idle`, `presence.nActive`, `presence.running`, `presence.offline`, `presence.noConnections`, `presence.viewAll`, `presence.uptime`). Pluralized counts use ICU: `"{count, plural, one {# agent online} other {# agents online}}"`.
- `"use client"` only where there is state/effects/events. The pill, popover, presence provider, ExecutionRow, mention dropdown are client. Do not convert server components unnecessarily.
- Use EXISTING shadcn primitives from `src/components/ui/` (Badge, Popover, Avatar+AvatarBadge, Tooltip, ScrollArea, Skeleton, Separator). Do not add new primitives.
- Reuse agent visuals: `getAgentColor(agentUuid, name?)` from `src/lib/agent-colors.ts` and `<AgentTypeIcon type={...}/>` from `src/components/agent-type-icon.tsx`.
- Owner/company scoping is already enforced server-side: `GET /api/agent-connections` is user-only and owner-scoped (P1); `GET /api/mentionables` is already scoped by `searchMentionables`. Do not weaken either.
- Connection liveness threshold is `STALE_THRESHOLD_MS = 45_000` (P1). The poll cadence is 15s (well under the threshold so a connection never falsely reads offline between polls).
- Experiment deep-link URL (verified): `/research-projects/<researchProjectUuid>/experiments?selected=<experimentUuid>`.
- `ConnectionView` shape (P1, verified): `{ connectionKey, agentUuid, agentName, clientType, host, cwd, status: "online"|"offline", connectedAt, lastSeenAt, executions: { experimentUuid, title, researchProjectUuid, liveStatus, liveMessage, liveUpdatedAt }[] }`.
- `Mentionable` shape (verified): `{ type: "user"|"agent", uuid, name, email?, avatarUrl?, roles? }`. Only agents get presence fields.
- Tests: Vitest. Service/route tests use the hoisted-mock prisma pattern. Component logic that is pure (formatting, aggregation, sort) is extracted into testable helpers; React rendering is tested only where a helper cannot cover it.

---

## File Structure

**Server (presence data for mentions):**
- `src/services/mention.service.ts` — **modify.** Add `online`/`activeCount` to agent `Mentionable`s and a sort that ranks online agents first.
- `src/services/__tests__/mention.service.test.ts` — **modify/extend.**

**Client data layer:**
- `src/contexts/agent-presence-context.tsx` — **new.** `AgentPresenceProvider` + `useAgentPresence()` hook: one 15s poll of `/api/agent-connections`, exposes `{ connections, onlineAgentCount, loading, error, refresh }`.
- `src/lib/presence-format.ts` — **new.** Pure helpers: `summarizeConnections(connections)` → `{ onlineAgentCount, byAgent }`; `formatUptime(connectedAt, now)` → `"HH:MM:SS"`; `executionCountFor(connections)`.
- `src/lib/__tests__/presence-format.test.ts` — **new.**

**Client components:**
- `src/components/presence/execution-row.tsx` — **new.** `ExecutionRow` (inline + stacked variants), deep-links to experiment panel.
- `src/components/presence/agent-online-pill.tsx` — **new.** Sidebar pill + popover.
- `src/components/presence/connection-list.tsx` — **new.** Shared list of connections (used by popover + `/agents` section).
- `src/components/presence/__tests__/*` — tests for the pure parts.

**Integration:**
- `src/app/(dashboard)/layout.tsx` — **modify.** Wrap shell in `AgentPresenceProvider`; mount `<AgentOnlinePill/>` in the sidebar footer above the user profile.
- `src/components/mention-editor.tsx` — **modify.** Render online dot + status line in candidate rows.
- `src/app/(dashboard)/agents/agents-page-client.tsx` — **modify.** Add a "Connections" section to the detail panel using `useAgentPresence()` filtered to the selected agent.
- `messages/en.json`, `messages/zh.json` — **modify.** Add `presence` section.

---

### Task 1: Mention presence fields (server)

Add `online` + `activeCount` to agent mentionables and rank online agents first.

**Files:**
- Modify: `src/services/mention.service.ts`
- Modify: `src/services/__tests__/mention.service.test.ts`

**Interfaces:**
- Consumes (existing): `agentHasLiveConnection(agentUuid, now?)` from `@/services/agent-connection.service`; `hasLiveConnection`/`listConnections` from `@/lib/connection-registry`.
- Produces: `Mentionable` gains two optional fields:
  ```ts
  export interface Mentionable {
    type: "user" | "agent";
    uuid: string;
    name: string;
    email?: string | null;
    avatarUrl?: string | null;
    roles?: string[];
    online?: boolean;       // agents only; true if a live daemon connection exists
    activeCount?: number;   // agents only; count of running/queued experiments across that agent's live connections
  }
  ```
  After assembling agent results, set `online = agentHasLiveConnection(agent.uuid)` and `activeCount = <number of executions across that agent's online connections>`. For `activeCount`, use a new helper in `connection-registry.ts`: `liveExecutionCount(agentUuid, now)` is NOT needed — instead reuse `listConnections(now, { agentUuids: [uuid] })` filtered to online and sum nothing here (executions live in the service layer's experiment query, not the registry). To keep Task 1 self-contained and avoid a DB round-trip per candidate, `activeCount` is derived from the registry's connection presence only as a count of online connections is wrong. **Decision:** `activeCount` = number of online connections for that agent is NOT meaningful. Instead, compute `activeCount` from running experiments assigned to the agent via a single batched query: add `countActiveExperimentsByAgent(companyUuid, agentUuids[])` to `agent-connection.service.ts` (returns `Map<agentUuid, number>` of experiments with `assigneeType="agent"`, `assigneeUuid in agentUuids`, `liveStatus != null`). Call it once for all agent candidates. Sort: online agents first, then by original order.

- [ ] **Step 1: Add the batched active-count helper (failing test first)**

Add to `src/services/__tests__/agent-connection.service.test.ts`:
```ts
import { countActiveExperimentsByAgent } from "@/services/agent-connection.service";

describe("countActiveExperimentsByAgent", () => {
  it("returns a per-agent count of live experiments, company-scoped", async () => {
    mockPrisma.experiment.findMany.mockResolvedValue([
      { assigneeUuid: "agent-1" },
      { assigneeUuid: "agent-1" },
      { assigneeUuid: "agent-2" },
    ]);
    const map = await countActiveExperimentsByAgent("company-1", ["agent-1", "agent-2", "agent-3"]);
    expect(map.get("agent-1")).toBe(2);
    expect(map.get("agent-2")).toBe(1);
    expect(map.get("agent-3") ?? 0).toBe(0);
    expect(mockPrisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid: "company-1",
          assigneeType: "agent",
          assigneeUuid: { in: ["agent-1", "agent-2", "agent-3"] },
          liveStatus: { not: null },
        }),
      }),
    );
  });

  it("returns an empty map for no agents (no query)", async () => {
    mockPrisma.experiment.findMany.mockClear();
    const map = await countActiveExperimentsByAgent("company-1", []);
    expect(map.size).toBe(0);
    expect(mockPrisma.experiment.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/__tests__/agent-connection.service.test.ts`
Expected: FAIL — `countActiveExperimentsByAgent` not exported.

- [ ] **Step 3: Implement the helper**

In `src/services/agent-connection.service.ts`, add:
```ts
export async function countActiveExperimentsByAgent(
  companyUuid: string,
  agentUuids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (agentUuids.length === 0) return counts;
  const rows = await prisma.experiment.findMany({
    where: {
      companyUuid,
      assigneeType: "agent",
      assigneeUuid: { in: agentUuids },
      liveStatus: { not: null },
    },
    select: { assigneeUuid: true },
  });
  for (const r of rows) {
    if (!r.assigneeUuid) continue;
    counts.set(r.assigneeUuid, (counts.get(r.assigneeUuid) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/services/__tests__/agent-connection.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire presence into searchMentionables (failing test first)**

Add to `src/services/__tests__/mention.service.test.ts` (follow the file's existing mock setup; mock `@/services/agent-connection.service` `countActiveExperimentsByAgent` and `@/lib/connection-registry` `hasLiveConnection`):
```ts
// at top with other vi.mock calls:
const mockCountActive = vi.hoisted(() => vi.fn());
vi.mock("@/services/agent-connection.service", () => ({
  countActiveExperimentsByAgent: mockCountActive,
}));
const mockHasLive = vi.hoisted(() => vi.fn());
vi.mock("@/lib/connection-registry", () => ({ hasLiveConnection: mockHasLive }));

// in a describe:
it("marks online agents and ranks them first with activeCount", async () => {
  // arrange prisma mocks so two agents come back: agent-A (offline), agent-B (online, 2 active)
  // (use the file's existing agent-result mock shape)
  mockHasLive.mockImplementation((uuid: string) => uuid === "agent-B");
  mockCountActive.mockResolvedValue(new Map([["agent-B", 2]]));
  const results = await searchMentionables({
    companyUuid: "c", query: "", actorType: "user", actorUuid: "u", ownerUuid: "u", limit: 10,
  });
  const agents = results.filter((r) => r.type === "agent");
  const b = agents.find((a) => a.uuid === "agent-B")!;
  const a = agents.find((a) => a.uuid === "agent-A")!;
  expect(b.online).toBe(true);
  expect(b.activeCount).toBe(2);
  expect(a.online).toBe(false);
  expect(a.activeCount).toBe(0);
  // online agent ranked before offline among agents
  expect(agents.findIndex((x) => x.uuid === "agent-B")).toBeLessThan(agents.findIndex((x) => x.uuid === "agent-A"));
});
```
(Match the test file's real prisma agent mock shape; the assertions above are the contract.)

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm test src/services/__tests__/mention.service.test.ts`
Expected: FAIL — agents have no `online`/`activeCount` and ordering not applied.

- [ ] **Step 7: Implement presence enrichment in searchMentionables**

In `src/services/mention.service.ts`: add the two fields to the `Mentionable` interface. After the agent `Mentionable[]` portion is assembled (both the empty-query starter path and the search path), enrich agents:
```ts
import { hasLiveConnection } from "@/lib/connection-registry";
import { countActiveExperimentsByAgent } from "@/services/agent-connection.service";
// ...
// after agent results are collected into `results` (or a local agent array):
const agentUuids = results.filter((r) => r.type === "agent").map((r) => r.uuid);
const activeCounts = await countActiveExperimentsByAgent(params.companyUuid, agentUuids);
const now = Date.now();
for (const r of results) {
  if (r.type !== "agent") continue;
  r.online = hasLiveConnection(r.uuid, now);
  r.activeCount = activeCounts.get(r.uuid) ?? 0;
}
// stable sort: online agents first, users/others keep relative order
results.sort((a, b) => {
  const ao = a.type === "agent" && a.online ? 1 : 0;
  const bo = b.type === "agent" && b.online ? 1 : 0;
  return bo - ao;
});
```
(If `searchMentionables` returns early with a sliced starter set, apply the same enrichment + sort before the slice so online agents survive the limit. Read the function first and place the enrichment so BOTH paths get it — factor a local `enrich(results)` helper if cleaner.)

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm test src/services/__tests__/mention.service.test.ts src/services/__tests__/agent-connection.service.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/services/mention.service.ts src/services/agent-connection.service.ts \
        src/services/__tests__/mention.service.test.ts src/services/__tests__/agent-connection.service.test.ts
git commit -m "feat(presence): add online + activeCount to mention candidates"
```

---

### Task 2: Presence formatting helpers (pure)

Pure functions the UI components rely on. Fully unit-tested with no React.

**Files:**
- Create: `src/lib/presence-format.ts`
- Test: `src/lib/__tests__/presence-format.test.ts`

**Interfaces:**
- Consumes: the `ConnectionView` shape (define a local matching type to avoid importing server code into a client-shared lib):
  ```ts
  export interface ExecutionViewLite {
    experimentUuid: string; title: string; researchProjectUuid: string;
    liveStatus: string; liveMessage: string | null; liveUpdatedAt: string | null;
  }
  export interface ConnectionViewLite {
    connectionKey: string; agentUuid: string; agentName: string; clientType: string;
    host: string; cwd: string; status: "online" | "offline";
    connectedAt: string; lastSeenAt: string; executions: ExecutionViewLite[];
  }
  ```
- Produces:
  ```ts
  // Count of distinct agents that have at least one ONLINE connection.
  export function onlineAgentCount(connections: ConnectionViewLite[]): number;
  // Total executions across ONLINE connections (running + queued).
  export function totalActiveExecutions(connections: ConnectionViewLite[]): number;
  // Group connections by agentUuid (preserving input order of first appearance).
  export function groupByAgent(connections: ConnectionViewLite[]): { agentUuid: string; agentName: string; connections: ConnectionViewLite[] }[];
  // "HH:MM:SS" elapsed since connectedAt (ISO) at `nowMs`; clamps negatives to 0.
  export function formatUptime(connectedAtIso: string, nowMs: number): string;
  // Parse the GET /api/agent-connections JSON body into a connections array.
  // P1 returns success(connections) → array at json.data. Tolerates missing/non-array → [].
  export function parseConnectionsResponse(json: unknown): ConnectionViewLite[];
  ```
  NOTE (pre-flight fact): the repo has NO React component test infra (no @testing-library, no jsdom). Do NOT add it. `parseConnectionsResponse` is the testable seam the provider (Task 3) builds on, so the provider's data path is covered without rendering React.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/presence-format.test.ts
import { describe, it, expect } from "vitest";
import { onlineAgentCount, totalActiveExecutions, groupByAgent, formatUptime, type ConnectionViewLite } from "@/lib/presence-format";

function conn(over: Partial<ConnectionViewLite>): ConnectionViewLite {
  return {
    connectionKey: "k", agentUuid: "a", agentName: "A", clientType: "claude_code",
    host: "h", cwd: "/c", status: "online", connectedAt: "2026-06-28T00:00:00.000Z",
    lastSeenAt: "2026-06-28T00:00:10.000Z", executions: [], ...over,
  };
}
const exec = (uuid: string) => ({ experimentUuid: uuid, title: "T", researchProjectUuid: "p", liveStatus: "running", liveMessage: null, liveUpdatedAt: null });

describe("onlineAgentCount", () => {
  it("counts distinct agents with an online connection", () => {
    expect(onlineAgentCount([
      conn({ agentUuid: "a", status: "online" }),
      conn({ agentUuid: "a", connectionKey: "k2", status: "online" }), // same agent
      conn({ agentUuid: "b", status: "offline" }),                     // offline
      conn({ agentUuid: "c", status: "online" }),
    ])).toBe(2); // a and c
  });
  it("is 0 for empty", () => expect(onlineAgentCount([])).toBe(0));
});

describe("totalActiveExecutions", () => {
  it("sums executions across online connections only", () => {
    expect(totalActiveExecutions([
      conn({ status: "online", executions: [exec("e1"), exec("e2")] }),
      conn({ status: "offline", executions: [exec("e3")] }), // excluded
    ])).toBe(2);
  });
});

describe("groupByAgent", () => {
  it("groups connections under their agent preserving first-seen order", () => {
    const g = groupByAgent([
      conn({ agentUuid: "b", agentName: "Bee" }),
      conn({ agentUuid: "a", agentName: "Ay", connectionKey: "k2" }),
      conn({ agentUuid: "b", agentName: "Bee", connectionKey: "k3" }),
    ]);
    expect(g.map((x) => x.agentUuid)).toEqual(["b", "a"]);
    expect(g[0].connections).toHaveLength(2);
  });
});

describe("formatUptime", () => {
  it("formats elapsed as HH:MM:SS", () => {
    const start = "2026-06-28T00:00:00.000Z";
    const now = Date.parse("2026-06-28T01:02:03.000Z");
    expect(formatUptime(start, now)).toBe("01:02:03");
  });
  it("clamps negative to 00:00:00", () => {
    const start = "2026-06-28T00:00:10.000Z";
    expect(formatUptime(start, Date.parse("2026-06-28T00:00:00.000Z"))).toBe("00:00:00");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/__tests__/presence-format.test.ts`
Expected: FAIL — `@/lib/presence-format` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

Add a test for `parseConnectionsResponse` in the Task 2 test file:
```ts
describe("parseConnectionsResponse", () => {
  it("extracts the array at json.data", () => {
    expect(parseConnectionsResponse({ data: [conn({})] })).toHaveLength(1);
  });
  it("returns [] for malformed/missing data", () => {
    expect(parseConnectionsResponse({})).toEqual([]);
    expect(parseConnectionsResponse(null)).toEqual([]);
    expect(parseConnectionsResponse({ data: "nope" })).toEqual([]);
  });
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/__tests__/presence-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/presence-format.ts src/lib/__tests__/presence-format.test.ts
git commit -m "feat(presence): pure formatting/aggregation helpers"
```

---

### Task 3: AgentPresenceProvider (single poll, shell-level context)

One poll of `/api/agent-connections`; exposes data to all consumers.

**Files:**
- Create: `src/contexts/agent-presence-context.tsx`
- (NO test file — the repo has no React test infra. The provider's data path is `parseConnectionsResponse` (Task 2), already unit-tested. The provider itself is thin effect-wiring; it is covered by the final review + manual smoke. Do NOT add jsdom/testing-library.)

**Interfaces:**
- Consumes (Task 2): types `ConnectionViewLite`, `onlineAgentCount`, `parseConnectionsResponse`.
- Produces:
  ```ts
  export interface AgentPresenceValue {
    connections: ConnectionViewLite[];
    onlineAgentCount: number;
    loading: boolean;
    error: boolean;
    refresh: () => void;
  }
  export function AgentPresenceProvider(props: {
    children: React.ReactNode;
    pollMs?: number;       // default 15_000
    fetchImpl?: typeof fetch; // injectable for tests
  }): JSX.Element;
  export function useAgentPresence(): AgentPresenceValue;
  // Returns connections for one agent (online-aware) — convenience selector.
  export function useAgentConnections(agentUuid: string): ConnectionViewLite[];
  ```
  Provider fetches `/api/agent-connections` on mount and every `pollMs`; parses `json.data` (P1 returns `success(connections)` → array at `.data`); tolerates fetch failure (sets `error`, keeps last good data); clears the interval on unmount. `useAgentPresence` throws if used outside the provider. `useAgentConnections` filters `connections` by `agentUuid`.

- [ ] **Step 1: Confirm the data seam is tested**

The provider parses responses via `parseConnectionsResponse` (Task 2), which already has unit tests. No React-rendering test is added (no jsdom in repo). Proceed to implement; the effect-wiring is verified by typecheck + the final review + manual smoke.

- [ ] **Step 2: Write the implementation (use parseConnectionsResponse)**

```tsx
// src/contexts/agent-presence-context.tsx
"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { onlineAgentCount as countOnline, parseConnectionsResponse, type ConnectionViewLite } from "@/lib/presence-format";

export interface AgentPresenceValue {
  connections: ConnectionViewLite[];
  onlineAgentCount: number;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

const Ctx = createContext<AgentPresenceValue | null>(null);

export function AgentPresenceProvider({
  children,
  pollMs = 15_000,
  fetchImpl,
}: {
  children: React.ReactNode;
  pollMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const doFetch = fetchImpl ?? fetch;
  const [connections, setConnections] = useState<ConnectionViewLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await doFetch("/api/agent-connections", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!mounted.current) return;
      setConnections(parseConnectionsResponse(json));
      setError(false);
    } catch {
      if (!mounted.current) return;
      setError(true); // keep last good `connections`
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [doFetch]);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, pollMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load, pollMs]);

  const value: AgentPresenceValue = {
    connections,
    onlineAgentCount: countOnline(connections),
    loading,
    error,
    refresh: load,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentPresence(): AgentPresenceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAgentPresence must be used within AgentPresenceProvider");
  return v;
}

export function useAgentConnections(agentUuid: string): ConnectionViewLite[] {
  return useAgentPresence().connections.filter((c) => c.agentUuid === agentUuid);
}
```

- [ ] **Step 3: Typecheck the provider**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'agent-presence-context' || echo "no type errors in provider"`
Expected: no errors in the new file.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/agent-presence-context.tsx src/contexts/__tests__/agent-presence-context.test.tsx
git commit -m "feat(presence): AgentPresenceProvider single-poll context"
```

---

### Task 4: ExecutionRow component

A single execution (experiment) row, deep-linking to the experiment panel. Inline + stacked variants.

**Files:**
- Create: `src/components/presence/execution-row.tsx`
- Create: `src/components/presence/__tests__/execution-row-href.test.ts`

**Interfaces:**
- Consumes (Task 2): `ExecutionViewLite`.
- Produces:
  ```ts
  // pure, exported for test:
  export function experimentHref(researchProjectUuid: string, experimentUuid: string): string;
  // component:
  export function ExecutionRow(props: { execution: ExecutionViewLite; variant?: "inline" | "stacked" }): JSX.Element;
  ```
  `experimentHref` = `/research-projects/${researchProjectUuid}/experiments?selected=${experimentUuid}`. The row renders the title, the `liveStatus` as a Badge, and (when `liveMessage`) a muted second line; it is an `<a href={experimentHref(...)}>`. `inline` = compact one-line; `stacked` = title full width with two-line clamp, status/message on a second line. An Interrupt control is intentionally NOT included (reverse control is P4).

- [ ] **Step 1: Write the failing test (pure href)**

```ts
// src/components/presence/__tests__/execution-row-href.test.ts
import { describe, it, expect } from "vitest";
import { experimentHref } from "@/components/presence/execution-row";

describe("experimentHref", () => {
  it("builds the experiment deep-link with selected param", () => {
    expect(experimentHref("proj-1", "exp-1")).toBe(
      "/research-projects/proj-1/experiments?selected=exp-1",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/presence/__tests__/execution-row-href.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/presence/execution-row.tsx
"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ExecutionViewLite } from "@/lib/presence-format";

export function experimentHref(researchProjectUuid: string, experimentUuid: string): string {
  return `/research-projects/${researchProjectUuid}/experiments?selected=${experimentUuid}`;
}

export function ExecutionRow({
  execution,
  variant = "inline",
}: {
  execution: ExecutionViewLite;
  variant?: "inline" | "stacked";
}) {
  const href = experimentHref(execution.researchProjectUuid, execution.experimentUuid);
  if (variant === "stacked") {
    return (
      <Link href={href} className="block rounded-md px-2 py-1.5 hover:bg-muted/60">
        <div className="line-clamp-2 text-xs font-medium">{execution.title}</div>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{execution.liveStatus}</Badge>
          {execution.liveMessage ? (
            <span className="truncate text-[10px] text-muted-foreground">{execution.liveMessage}</span>
          ) : null}
        </div>
      </Link>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
      <span className="truncate text-xs font-medium">{execution.title}</span>
      <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{execution.liveStatus}</Badge>
    </Link>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/components/presence/__tests__/execution-row-href.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/presence/execution-row.tsx src/components/presence/__tests__/execution-row-href.test.ts
git commit -m "feat(presence): ExecutionRow with experiment deep-link"
```

---

### Task 5: ConnectionList component

Shared presentational list of connections grouped by agent — used by the popover and the `/agents` detail section.

**Files:**
- Create: `src/components/presence/connection-list.tsx`
- Test: `src/components/presence/__tests__/connection-list-helpers.test.ts` (pure helpers only)

**Interfaces:**
- Consumes (Task 2): `groupByAgent`, `formatUptime`, `ConnectionViewLite`; (Task 4): `ExecutionRow`; agent visuals: `getAgentColor`, `AgentTypeIcon`.
- Produces:
  ```ts
  // pure helper exported for test:
  export function connectionStatusLabel(c: { status: "online"|"offline" }): "online" | "offline";
  // component:
  export function ConnectionList(props: {
    connections: ConnectionViewLite[];
    nowMs: number;             // injected so uptime is deterministic/testable & avoids Date.now in render churn
    variant?: "inline" | "stacked";
    emptyLabel: string;        // i18n'd by caller
  }): JSX.Element;
  ```
  Renders, per agent group: agent name + type icon (colored via `getAgentColor`), each connection's `host` · `cwd` with an online pulse dot + `formatUptime`, then its `executions` as `ExecutionRow`s. Empty → `emptyLabel`. Keep the pure label helper trivial but real (it is the only unit-testable seam; the rest is presentational and covered by the final review + manual check).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/presence/__tests__/connection-list-helpers.test.ts
import { describe, it, expect } from "vitest";
import { connectionStatusLabel } from "@/components/presence/connection-list";

describe("connectionStatusLabel", () => {
  it("passes through online/offline", () => {
    expect(connectionStatusLabel({ status: "online" })).toBe("online");
    expect(connectionStatusLabel({ status: "offline" })).toBe("offline");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/presence/__tests__/connection-list-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/presence/connection-list.tsx
"use client";
import { groupByAgent, formatUptime, type ConnectionViewLite } from "@/lib/presence-format";
import { ExecutionRow } from "@/components/presence/execution-row";
import { getAgentColor } from "@/lib/agent-colors";
import { AgentTypeIcon } from "@/components/agent-type-icon";

export function connectionStatusLabel(c: { status: "online" | "offline" }): "online" | "offline" {
  return c.status;
}

export function ConnectionList({
  connections,
  nowMs,
  variant = "stacked",
  emptyLabel,
}: {
  connections: ConnectionViewLite[];
  nowMs: number;
  variant?: "inline" | "stacked";
  emptyLabel: string;
}) {
  if (connections.length === 0) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">{emptyLabel}</div>;
  }
  const groups = groupByAgent(connections);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const color = getAgentColor(g.agentUuid, g.agentName);
        return (
          <div key={g.agentUuid} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-2">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded"
                style={{ backgroundColor: color.light, color: color.primary }}
              >
                <AgentTypeIcon type={g.connections[0]?.clientType ?? "claude_code"} className="h-3 w-3" />
              </span>
              <span className="text-xs font-medium">{g.agentName}</span>
            </div>
            {g.connections.map((c) => (
              <div key={c.connectionKey} className="pl-2">
                <div className="flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${c.status === "online" ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    aria-hidden
                  />
                  <span className="truncate">{c.host} · {c.cwd}</span>
                  {c.status === "online" ? (
                    <span className="ml-auto font-mono tabular-nums">{formatUptime(c.connectedAt, nowMs)}</span>
                  ) : null}
                </div>
                {c.executions.map((e) => (
                  <ExecutionRow key={e.experimentUuid} execution={e} variant={variant} />
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/components/presence/__tests__/connection-list-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/presence/connection-list.tsx src/components/presence/__tests__/connection-list-helpers.test.ts
git commit -m "feat(presence): ConnectionList grouped-by-agent view"
```

---

### Task 6: Sidebar online pill + popover

The shell pill showing "N agents online" with a popover of connections.

**Files:**
- Create: `src/components/presence/agent-online-pill.tsx`
- Test: covered by Task 2/5 pure helpers + the i18n key existence check in Task 8; no new unit test file (pure logic already tested). If a testable seam emerges (e.g. the pill's label builder), extract and test it.

**Interfaces:**
- Consumes: `useAgentPresence` (Task 3), `ConnectionList` (Task 5), shadcn `Badge`, `Popover`, `ScrollArea`, `useTranslations`.
- Produces: `export function AgentOnlinePill(): JSX.Element`. Renders nothing visible when `loading && connections.length===0` (a Skeleton is fine). Pill text uses ICU plural `presence.agentsOnline`. Click → Popover with `ConnectionList` (online connections only, `variant="stacked"`), header, and (if applicable) a "View all" link to `/agents`.

- [ ] **Step 1: Implement the component**

```tsx
// src/components/presence/agent-online-pill.tsx
"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAgentPresence } from "@/contexts/agent-presence-context";
import { ConnectionList } from "@/components/presence/connection-list";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgentOnlinePill() {
  const t = useTranslations();
  const { connections, onlineAgentCount, loading } = useAgentPresence();
  const onlineConnections = connections.filter((c) => c.status === "online");
  // Use a stable now for uptime within one render; the 15s poll re-renders anyway.
  const nowMs = Date.now();

  if (loading && connections.length === 0) {
    return (
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground" aria-hidden>
        {t("presence.loading")}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-left text-[11px] hover:bg-muted/60"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${onlineAgentCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            aria-hidden
          />
          <span className="font-medium tabular-nums">
            {t("presence.agentsOnline", { count: onlineAgentCount })}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[min(92vw,360px)] p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold">{t("presence.title")}</span>
          <Link href="/agents" className="text-[11px] text-muted-foreground hover:underline">
            {t("presence.viewAll")}
          </Link>
        </div>
        <ScrollArea className="max-h-[50vh]">
          <ConnectionList
            connections={onlineConnections}
            nowMs={nowMs}
            variant="stacked"
            emptyLabel={t("presence.noConnections")}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck the new component**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'agent-online-pill|connection-list|execution-row|agent-presence' || echo "no type errors in new presence files"`
Expected: no errors in the new files. (Repo-wide tsc may report pre-existing errors elsewhere; only the presence files matter here.)

- [ ] **Step 3: Commit**

```bash
git add src/components/presence/agent-online-pill.tsx
git commit -m "feat(presence): sidebar online pill + connections popover"
```

---

### Task 7: Mount provider + pill in the dashboard shell

Wire the provider around the shell and the pill into the sidebar footer.

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `AgentPresenceProvider` (Task 3), `AgentOnlinePill` (Task 6).

- [ ] **Step 1: Wrap the shell with the provider**

Read `src/app/(dashboard)/layout.tsx`. It is a client component. Wrap the returned shell tree (the outermost element that contains BOTH the sidebar and the main content) in `<AgentPresenceProvider>`. Place it so the pill (in the sidebar) and any future consumers share one provider. Add the import:
```tsx
import { AgentPresenceProvider } from "@/contexts/agent-presence-context";
```
The provider must wrap the sidebar — it does NOT need to be inside the project-only `RealtimeProvider` (presence is global). If the existing structure makes wrapping the whole return cleanest, do that.

- [ ] **Step 2: Mount the pill in the sidebar footer**

In the `SidebarContent` component (the shared sidebar body), add `<AgentOnlinePill />` just ABOVE the user profile block (the avatar+name+logout at the bottom) and below `OnboardingProgress`. Import:
```tsx
import { AgentOnlinePill } from "@/components/presence/agent-online-pill";
```
It renders in both desktop and mobile sidebar (shared `SidebarContent`), which is fine.

- [ ] **Step 3: Verify the app builds and the shell renders**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'layout\.tsx' || echo "no new type errors in layout"`
Expected: no new type errors attributable to the edit.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/layout.tsx"
git commit -m "feat(presence): mount AgentPresenceProvider + online pill in shell"
```

---

### Task 8: i18n keys for presence

Add the `presence` section to both locales. (Done as its own task so the reviewer can gate copy + ICU correctness; the components above already reference these keys.)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add the `presence` section to `messages/en.json`**

Add a top-level `"presence"` object:
```json
"presence": {
  "title": "Agent connections",
  "loading": "Checking agents…",
  "agentsOnline": "{count, plural, =0 {No agents online} one {# agent online} other {# agents online}}",
  "viewAll": "View all",
  "noConnections": "No active connections",
  "offline": "Offline",
  "online": "Online",
  "idle": "Idle",
  "nActive": "{count, plural, one {# active} other {# active}}",
  "running": "Running",
  "uptime": "Uptime",
  "connections": "Connections"
}
```

- [ ] **Step 2: Add the matching `presence` section to `messages/zh.json`**

```json
"presence": {
  "title": "智能体连接",
  "loading": "正在检查智能体…",
  "agentsOnline": "{count, plural, =0 {无在线智能体} other {# 个智能体在线}}",
  "viewAll": "查看全部",
  "noConnections": "暂无活跃连接",
  "offline": "离线",
  "online": "在线",
  "idle": "空闲",
  "nActive": "{count, plural, other {# 个进行中}}",
  "running": "运行中",
  "uptime": "在线时长",
  "connections": "连接"
}
```

- [ ] **Step 3: Validate both JSON files parse and keys match**

Run:
```bash
node -e "const e=require('./messages/en.json'), z=require('./messages/zh.json'); const ek=Object.keys(e.presence).sort(), zk=Object.keys(z.presence).sort(); if(JSON.stringify(ek)!==JSON.stringify(zk)){console.error('KEY MISMATCH', ek, zk); process.exit(1)} console.log('presence keys match:', ek.join(','))"
```
Expected: `presence keys match: agentsOnline,connections,idle,...` (no mismatch).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n(presence): add presence section (en + zh)"
```

---

### Task 9: @mention dropdown online dot + status line

Render the presence fields (from Task 1) in the candidate rows.

**Files:**
- Modify: `src/components/mention-editor.tsx`

**Interfaces:**
- Consumes: `Mentionable` now carries `online?`/`activeCount?` (Task 1). The candidate renderer is `createSuggestionPopupRenderer()` (imperative DOM) in `mention-editor.tsx`.

- [ ] **Step 1: Render the dot + status for agent candidates**

Read `createSuggestionPopupRenderer()` in `src/components/mention-editor.tsx` (the imperative row builder, ~lines 360+). For agent candidates (`item.type === "agent"`):
- Add a small online dot at the avatar's bottom-right corner when `item.online` (a positioned `<span>` with an emerald background; omit entirely when offline).
- Replace the roles line with a status line: if `item.online`, show `item.activeCount > 0 ? "{n} active" : "Idle"`; if offline, keep showing roles (existing behavior).

Because this is an imperative renderer (not JSX), build the DOM nodes in the same style as the surrounding code. Use literal strings guarded by the existing i18n approach if the renderer already has access to a translator; if it does NOT (imperative code often can't call `useTranslations`), pass the needed strings (`idleLabel`, and an `activeLabel` template) into `createSuggestionPopupRenderer` from the component scope where `useTranslations` IS available, mirroring how other text reaches the renderer. Read how existing labels (e.g. roles, email) are passed/rendered and follow that exact mechanism. Do NOT hardcode English if the renderer can receive translated strings.

- [ ] **Step 2: Manual/type verification**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'mention-editor' || echo "no new type errors in mention-editor"`
Expected: no new type errors.
Then a quick reasoning check: confirm offline candidates are unchanged (still show roles, no dot), online candidates show the dot + active/idle.

- [ ] **Step 3: Commit**

```bash
git add src/components/mention-editor.tsx
git commit -m "feat(presence): online dot + active/idle status in @mention dropdown"
```

---

### Task 10: Connections section in the `/agents` detail panel

Show the selected agent's live connections + executions inside the existing detail panel.

**Files:**
- Modify: `src/app/(dashboard)/agents/agents-page-client.tsx`

**Interfaces:**
- Consumes: `useAgentConnections(agentUuid)` (Task 3), `ConnectionList` (Task 5), `useTranslations`. NOTE: the agents page must be inside `AgentPresenceProvider` — it is, because Task 7 wraps the whole `(dashboard)` shell.

- [ ] **Step 1: Add a Connections section to the detail panel**

Read `agents-page-client.tsx`'s detail panel region (where it renders the selected agent's roles/persona/API-keys/sessions). Add a "Connections" section (use the same section heading style as the adjacent "Sessions"/"API Keys" sections). Inside it:
```tsx
// near other imports
import { useAgentConnections } from "@/contexts/agent-presence-context";
import { ConnectionList } from "@/components/presence/connection-list";
// inside the detail panel render, where `selectedAgent` is in scope:
{selectedAgent ? (
  <section className="...matching-section-classes...">
    <h3 className="...matching-heading-classes...">{t("presence.connections")}</h3>
    <AgentConnectionsSection agentUuid={selectedAgent.uuid} />
  </section>
) : null}
```
Define a small local client subcomponent (same file, below the main component) so the hook is called unconditionally:
```tsx
function AgentConnectionsSection({ agentUuid }: { agentUuid: string }) {
  const t = useTranslations();
  const connections = useAgentConnections(agentUuid);
  return <ConnectionList connections={connections} nowMs={Date.now()} variant="inline" emptyLabel={t("presence.noConnections")} />;
}
```
Match the file's existing section markup/classes so it looks native. Do not poll separately — `useAgentConnections` reads the shared provider.

- [ ] **Step 2: Type/verify**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'agents-page-client' || echo "no new type errors in agents-page-client"`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/agents/agents-page-client.tsx"
git commit -m "feat(presence): connections section in agents detail panel"
```

---

### Task 11: Full-suite verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run all new/changed unit tests**

Run: `pnpm test src/lib/__tests__/presence-format.test.ts src/components/presence src/services/__tests__/mention.service.test.ts src/services/__tests__/agent-connection.service.test.ts`
Expected: all pass. (No `agent-presence-context` test file — repo has no React test infra; its data seam `parseConnectionsResponse` is covered in presence-format tests.)

- [ ] **Step 2: Lint changed files**

Run: `git diff --name-only <P3-base>..HEAD | grep -E '\.(ts|tsx)$' | tr '\n' ' ' | xargs pnpm exec eslint`
Expected: 0 errors in changed files (test-file "ignored" warnings are fine).

- [ ] **Step 3: i18n parity check**

Run: `node -e "const e=require('./messages/en.json'), z=require('./messages/zh.json'); const ek=Object.keys(e.presence).sort().join(','), zk=Object.keys(z.presence).sort().join(','); console.log(ek===zk ? 'OK presence parity' : 'MISMATCH')"`
Expected: `OK presence parity`.

- [ ] **Step 4: Manual smoke (optional — requires running app + a live daemon connection or seeded registry)**

With the dev server up and at least one `claude_code` agent reporting a heartbeat (P2 daemon, or `curl` the heartbeat endpoint), confirm:
- Sidebar pill shows "1 agent online"; popover lists the connection + any running experiment; clicking an execution navigates to `/research-projects/<p>/experiments?selected=<exp>`.
- Typing `@` in a comment shows the online agent with a green dot and "Idle"/"N active".
- `/agents` → select the agent → Connections section shows the live connection.

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit -m "chore(presence): lint + test cleanup for P3"
```

---

## Self-Review

**Spec coverage (against macro plan P3's four items):**
- ✅ (1) @mention online dot + "N active"/"Idle" → Task 1 (server fields) + Task 9 (render).
- ✅ (2) Sidebar online pill + popover via one shell-level provider → Tasks 3, 6, 7.
- ✅ (3) Connections deck folded into `/agents` detail → Task 10 (per the user's IA decision).
- ✅ (4) ExecutionRow deep-linking to the experiment panel → Task 4 (URL verified `?selected=`).
- ✅ Single poll, no duplicate fetching → Task 3 provider; pill (Task 6) and agents section (Task 10) both read it.
- ✅ i18n in both locales → Task 8, parity-checked.

**Placeholder scan:** No TODO/TBD. Component tasks that are mostly presentational (Tasks 6, 9, 10) give the full code or a precise edit recipe against the real file; their unit-testable seams (href, formatters, aggregation, counts) are extracted and tested in Tasks 1–5. Task 9's renderer edit is described as a recipe because `createSuggestionPopupRenderer` is imperative DOM whose exact node-construction style must match the surrounding code — the implementer is told to read and mirror it, and to thread translated strings the same way existing labels are threaded (not hardcode English).

**Type consistency:** `ConnectionViewLite`/`ExecutionViewLite` (Task 2) are the single shared shape consumed by Tasks 3–6, 10 and match P1's `ConnectionView` field-for-field. `Mentionable.online/activeCount` (Task 1) are consumed in Task 9. `useAgentPresence`/`useAgentConnections` (Task 3) are consumed by Tasks 6, 10. `experimentHref` (Task 4) is the only deep-link builder. i18n keys referenced in Tasks 6/9/10 are all defined in Task 8.

**Known assumptions flagged inline (not blockers):**
- Whether `@testing-library/react` + jsdom are devDeps (Task 3 Step 3 note) — if absent, fall back to a pure `parseConnectionsResponse` helper rather than adding test infra in this phase.
- `searchMentionables` has two result paths (empty-query starter + search) — Task 1 Step 7 says enrich BOTH before any slice; the implementer must read the function to place it correctly.
- `createSuggestionPopupRenderer`'s string-threading mechanism (Task 9) — read before editing.
- The exact sidebar footer / user-profile markup in `layout.tsx` and the section markup in `agents-page-client.tsx` — read before editing; match existing classes.

**No release-surface impact:** P3 is server + Next app only (no `packages/*` changes, no new published package). Standard app deploy; no npm/plugin publish needed for P3.

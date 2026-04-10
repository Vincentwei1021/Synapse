# Agent Type & Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish OpenClaw vs Claude Code agents so that only realtime-capable agents appear in web UI task dispatch dropdowns, and Claude Code agents discover pending assignments at session start.

**Architecture:** Add `type` field to Agent model; map type to transport capability via a pure utility; filter UI agent selectors by transport; enhance Claude Code plugin SessionStart to surface pending experiments.

**Tech Stack:** Prisma 7, Next.js 15, React 19, Tailwind CSS 4, next-intl, bash hooks

**Spec:** `docs/superpowers/specs/2026-04-11-agent-type-transport-design.md`

---

### Task 1: Prisma Schema — Add `type` field to Agent

**Files:**
- Modify: `prisma/schema.prisma:66-86`

- [ ] **Step 1: Add type field to Agent model**

In `prisma/schema.prisma`, add the `type` field after `roles` (line 72):

```prisma
model Agent {
  id           Int       @id @default(autoincrement())
  uuid         String    @unique @default(uuid())
  companyUuid  String
  company      Company   @relation(fields: [companyUuid], references: [uuid])
  name         String
  roles        String[]  @default(["researcher"])
  type         String    @default("openclaw") // openclaw | claude_code
  persona      String?
  systemPrompt String?
  ownerUuid    String?
  owner        User?     @relation(fields: [ownerUuid], references: [uuid])
  lastActiveAt DateTime?
  createdAt    DateTime  @default(now())

  apiKeys  ApiKey[]
  sessions AgentSession[]

  @@index([companyUuid])
  @@index([ownerUuid])
}
```

- [ ] **Step 2: Generate Prisma client and create migration**

```bash
pnpm db:migrate:dev --name add-agent-type
```

This creates the migration and regenerates the Prisma client. Existing agents get `type = "openclaw"` by default.

- [ ] **Step 3: Verify migration**

```bash
pnpm db:generate
```

Confirm no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add type field to Agent model (openclaw | claude_code)"
```

---

### Task 2: Transport Mapping Utility

**Files:**
- Create: `src/lib/agent-transport.ts`
- Create: `src/lib/__tests__/agent-transport.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/agent-transport.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getAgentTransport, isRealtimeAgent, VALID_AGENT_TYPES } from "@/lib/agent-transport";

describe("agent-transport", () => {
  describe("VALID_AGENT_TYPES", () => {
    it("contains openclaw and claude_code", () => {
      expect(VALID_AGENT_TYPES).toContain("openclaw");
      expect(VALID_AGENT_TYPES).toContain("claude_code");
    });
  });

  describe("getAgentTransport", () => {
    it("returns realtime for openclaw", () => {
      expect(getAgentTransport("openclaw")).toBe("realtime");
    });

    it("returns poll for claude_code", () => {
      expect(getAgentTransport("claude_code")).toBe("poll");
    });

    it("returns poll for unknown types", () => {
      expect(getAgentTransport("unknown")).toBe("poll");
    });
  });

  describe("isRealtimeAgent", () => {
    it("returns true for openclaw", () => {
      expect(isRealtimeAgent("openclaw")).toBe(true);
    });

    it("returns false for claude_code", () => {
      expect(isRealtimeAgent("claude_code")).toBe(false);
    });

    it("returns false for unknown types", () => {
      expect(isRealtimeAgent("unknown")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/__tests__/agent-transport.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the utility**

Create `src/lib/agent-transport.ts`:

```typescript
// Agent type → notification transport mapping.
// Transport is an internal concept — never stored in DB or exposed to users.

const AGENT_TRANSPORT_MAP: Record<string, "realtime" | "poll"> = {
  openclaw: "realtime",
  claude_code: "poll",
};

export const VALID_AGENT_TYPES = Object.keys(AGENT_TRANSPORT_MAP);

export function getAgentTransport(agentType: string): "realtime" | "poll" {
  return AGENT_TRANSPORT_MAP[agentType] ?? "poll";
}

export function isRealtimeAgent(agentType: string): boolean {
  return getAgentTransport(agentType) === "realtime";
}

/** Returns all agent types that map to the given transport. */
export function getTypesByTransport(transport: "realtime" | "poll"): string[] {
  return Object.entries(AGENT_TRANSPORT_MAP)
    .filter(([, t]) => t === transport)
    .map(([type]) => type);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/lib/__tests__/agent-transport.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-transport.ts src/lib/__tests__/agent-transport.test.ts
git commit -m "feat: add agent type → transport mapping utility"
```

---

### Task 3: Agent Service — Add `type` to CRUD

**Files:**
- Modify: `src/services/agent.service.ts:8-29` (interfaces), `:39-62` (listAgents), `:93-113` (createAgent), `:116-142` (updateAgent), `:245-255` (listAgentSummaries)

- [ ] **Step 1: Add `type` to interfaces**

In `src/services/agent.service.ts`, add `type` to the interfaces:

```typescript
export interface AgentListParams {
  companyUuid: string;
  skip: number;
  take: number;
  ownerUuid?: string;
  type?: string;       // filter by exact type
  transport?: string;  // filter by transport capability (maps to types)
}

export interface AgentCreateParams {
  companyUuid: string;
  name: string;
  roles: string[];
  type?: string;
  ownerUuid: string;
  persona?: string | null;
  systemPrompt?: string | null;
}

export interface AgentUpdateParams {
  name?: string;
  roles?: string[];
  type?: string;
  persona?: string | null;
  systemPrompt?: string | null;
}
```

- [ ] **Step 2: Update `listAgents` to support type/transport filtering**

```typescript
import { getTypesByTransport } from "@/lib/agent-transport";

export async function listAgents({ companyUuid, skip, take, ownerUuid, type, transport }: AgentListParams) {
  const where: Record<string, unknown> = { companyUuid, ...(ownerUuid ? { ownerUuid } : {}) };
  if (type) {
    where.type = type;
  } else if (transport) {
    where.type = { in: getTypesByTransport(transport as "realtime" | "poll") };
  }

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        uuid: true,
        name: true,
        roles: true,
        type: true,
        persona: true,
        ownerUuid: true,
        lastActiveAt: true,
        createdAt: true,
        _count: { select: { apiKeys: true } },
      },
    }),
    prisma.agent.count({ where }),
  ]);

  return { agents, total };
}
```

- [ ] **Step 3: Update `createAgent` to accept `type`**

```typescript
export async function createAgent({
  companyUuid,
  name,
  roles,
  type,
  ownerUuid,
  persona,
  systemPrompt,
}: AgentCreateParams) {
  return prisma.agent.create({
    data: { companyUuid, name, roles, type: type || "openclaw", ownerUuid, persona, systemPrompt },
    select: {
      uuid: true,
      name: true,
      roles: true,
      type: true,
      persona: true,
      systemPrompt: true,
      ownerUuid: true,
      createdAt: true,
    },
  });
}
```

- [ ] **Step 4: Update `updateAgent` to accept `type`**

Add `type: true` to the select in `updateAgent` (line 131-139):

```typescript
  return prisma.agent.update({
    where: { uuid },
    data,
    select: {
      uuid: true,
      name: true,
      roles: true,
      type: true,
      persona: true,
      systemPrompt: true,
      ownerUuid: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
```

- [ ] **Step 5: Update `listAgentSummaries` to include `type`**

```typescript
export async function listAgentSummaries(companyUuid: string) {
  return prisma.agent.findMany({
    where: { companyUuid },
    select: {
      uuid: true,
      name: true,
      roles: true,
      type: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 6: Update `getAgentByUuid` select to include `type`**

Note: `getAgent` uses `include` (not `select`), so it already returns all scalar fields including the new `type`. No change needed.

In `getAgentByUuid` (line 85-90):

```typescript
export async function getAgentByUuid(companyUuid: string, uuid: string, ownerUuid?: string) {
  return prisma.agent.findFirst({
    where: { uuid, companyUuid, ...(ownerUuid ? { ownerUuid } : {}) },
    select: { uuid: true, name: true, roles: true, type: true, ownerUuid: true },
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/services/agent.service.ts
git commit -m "feat: add type field to agent service CRUD methods"
```

---

### Task 4: Agent API Routes — Expose `type`

**Files:**
- Modify: `src/app/api/agents/route.ts`
- Modify: `src/app/api/agents/[uuid]/route.ts`

- [ ] **Step 1: Update GET /api/agents to support type/transport query params and return type**

In `src/app/api/agents/route.ts`, update the GET handler:

```typescript
import { VALID_AGENT_TYPES } from "@/lib/agent-transport";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can view agents");

  const { page, pageSize, skip, take } = parsePagination(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || undefined;
  const transport = url.searchParams.get("transport") || undefined;

  const { agents, total } = await listAgents({
    companyUuid: auth.companyUuid,
    skip,
    take,
    ownerUuid: auth.actorUuid,
    type,
    transport,
  });

  const data = agents.map((a) => ({
    uuid: a.uuid,
    name: a.name,
    roles: a.roles,
    type: a.type,
    persona: a.persona,
    ownerUuid: a.ownerUuid,
    lastActiveAt: a.lastActiveAt?.toISOString() || null,
    apiKeyCount: a._count.apiKeys,
    createdAt: a.createdAt.toISOString(),
  }));

  return paginated(data, page, pageSize, total);
});
```

- [ ] **Step 2: Update POST /api/agents to accept and return type**

In the POST handler, add `type` to the body parsing and validation:

```typescript
  const body = await parseBody<{
    name: string;
    roles?: string[];
    type?: string;
    persona?: string | null;
    systemPrompt?: string | null;
  }>(request);

  // ... existing name/roles validation ...

  // Validate type
  const type = body.type || "openclaw";
  if (!VALID_AGENT_TYPES.includes(type)) {
    return errors.validationError({
      type: `Type must be one of: ${VALID_AGENT_TYPES.join(", ")}`,
    });
  }

  const agent = await createAgent({
    companyUuid: auth.companyUuid,
    name: body.name.trim(),
    roles,
    type,
    persona: body.persona?.trim() || null,
    systemPrompt: body.systemPrompt?.trim() || null,
    ownerUuid: auth.actorUuid,
  });

  return success({
    uuid: agent.uuid,
    name: agent.name,
    roles: agent.roles,
    type: agent.type,
    // ... rest unchanged
  });
```

- [ ] **Step 3: Update PATCH /api/agents/[uuid] to accept and return type**

In `src/app/api/agents/[uuid]/route.ts`, add type to the PATCH handler body and updateData:

```typescript
  const body = await parseBody<{
    name?: string;
    roles?: string[];
    type?: string;
    persona?: string | null;
    systemPrompt?: string | null;
  }>(request);

  const updateData: {
    name?: string;
    roles?: string[];
    type?: string;
    persona?: string | null;
    systemPrompt?: string | null;
  } = {};

  // ... existing name/roles validation ...

  if (body.type !== undefined) {
    if (!VALID_AGENT_TYPES.includes(body.type)) {
      return errors.validationError({
        type: `Type must be one of: ${VALID_AGENT_TYPES.join(", ")}`,
      });
    }
    updateData.type = body.type;
  }
```

Add `type: updated.type` to the PATCH success response.

Also add `type: agent.type` to the GET detail response.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agents/route.ts src/app/api/agents/[uuid]/route.ts
git commit -m "feat: expose agent type in API routes with transport query filter"
```

---

### Task 5: Task Dispatch Route Validation

**Files:**
- Modify: `src/app/api/research-projects/[uuid]/related-works/auto-search/route.ts`
- Modify: `src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts`

- [ ] **Step 1: Add transport validation to auto-search route**

In `src/app/api/research-projects/[uuid]/related-works/auto-search/route.ts`, after the zod parse (line 28) and before creating the notification (line 30), add:

```typescript
import { isRealtimeAgent } from "@/lib/agent-transport";
import { getAgentByUuid } from "@/services/agent.service";

    // ... after parsed.success check ...

    // Validate agent supports realtime dispatch
    const agent = await prisma.agent.findFirst({
      where: { uuid: parsed.data.agentUuid, companyUuid: auth.companyUuid },
      select: { type: true },
    });
    if (!agent) return errors.notFound("Agent");
    if (!isRealtimeAgent(agent.type)) {
      return errors.validationError({
        agentUuid: "This agent does not support real-time task dispatch. Select an OpenClaw agent.",
      });
    }
```

- [ ] **Step 2: Add same validation to deep-research route**

Apply the identical validation to `src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts`, after the zod parse and before notification creation.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/research-projects/[uuid]/related-works/auto-search/route.ts src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts
git commit -m "feat: validate agent transport before creating dispatch notifications"
```

---

### Task 6: i18n Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add agent type i18n keys to en.json**

Add under the `agents` section:

```json
"agents": {
  "fields": {
    "type": "Type",
    "typePlaceholder": "Select agent type..."
  },
  "type": {
    "openclaw": "OpenClaw",
    "claude_code": "Claude Code"
  },
  "typeDesc": {
    "openclaw": "Receives tasks in real-time via SSE notifications",
    "claude_code": "Discovers tasks at session start"
  }
}
```

Add error message key:

```json
"errors": {
  "agentNotRealtime": "This agent does not support real-time dispatch. Select an OpenClaw agent."
}
```

- [ ] **Step 2: Add matching zh.json keys**

```json
"agents": {
  "fields": {
    "type": "类型",
    "typePlaceholder": "选择智能体类型..."
  },
  "type": {
    "openclaw": "OpenClaw",
    "claude_code": "Claude Code"
  },
  "typeDesc": {
    "openclaw": "通过 SSE 通知实时接收任务",
    "claude_code": "在会话启动时发现任务"
  }
}
```

```json
"errors": {
  "agentNotRealtime": "此智能体不支持实时派发，请选择 OpenClaw 类型的智能体。"
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "feat: add i18n keys for agent type"
```

---

### Task 7: Agents Management UI — Type Selector

**Files:**
- Modify: `src/app/(dashboard)/agents/agents-page-client.tsx`
- Modify: `src/app/(dashboard)/settings/actions.ts`

- [ ] **Step 1: Add type constants**

In `agents-page-client.tsx`, add after the ROLE constants (around line 93):

```typescript
const AGENT_TYPES = ["openclaw", "claude_code"] as const;
type AgentType = (typeof AGENT_TYPES)[number];

const TYPE_BADGE_CLASSES: Record<string, string> = {
  openclaw: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  claude_code: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
};
```

- [ ] **Step 2: Add type to AgentSummary interface and state**

Update the `AgentSummary` interface (line 54):

```typescript
interface AgentSummary {
  uuid: string;
  name: string;
  roles: string[];
  type: string;
  persona: string | null;
  ownerUuid: string | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  _count: { apiKeys: number };
}
```

Add create state (after line 135):

```typescript
const [createType, setCreateType] = useState<string>("openclaw");
```

Add edit state (after line 144):

```typescript
const [editType, setEditType] = useState<string>("openclaw");
```

Update `selectedAgent` effect (around line 170) to set `editType`:

```typescript
setEditType(selectedAgent.type || "openclaw");
```

- [ ] **Step 3: Add type selector to create form**

In the create form, after the Name field (after line 509) and before Permissions, add:

```tsx
{/* Type */}
<div className="space-y-2">
  <Label className="text-[13px]">
    {t("agents.fields.type")}
  </Label>
  <select
    value={createType}
    onChange={(e) => setCreateType(e.target.value)}
    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
  >
    {AGENT_TYPES.map((type) => (
      <option key={type} value={type}>
        {t(`agents.type.${type}`)}
      </option>
    ))}
  </select>
  <p className="text-xs text-muted-foreground">
    {t(`agents.typeDesc.${createType}`)}
  </p>
</div>
```

- [ ] **Step 4: Pass type to create action**

Update `handleCreate` (line 210) to pass type:

```typescript
const result = await createAgentAndKeyAction({
  name: createName.trim(),
  roles: createRoles,
  type: createType,
  persona: createPersona.trim() || null,
});
```

Update `resetCreate` to include: `setCreateType("openclaw");`

- [ ] **Step 5: Add type badge to agent card**

In the agent card (after role badges, around line 434), add a type badge:

```tsx
{/* Type badge */}
<div className="mt-2">
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[agent.type] || "bg-secondary text-muted-foreground"}`}>
    {t(`agents.type.${agent.type || "openclaw"}`)}
  </span>
</div>
```

- [ ] **Step 6: Add type selector to edit panel**

In the detail sheet, after the editable name (around line 599) and before permissions, add:

```tsx
{/* Type */}
<div className="space-y-2">
  <Label className="text-[13px]">
    {t("agents.fields.type")}
  </Label>
  <select
    value={editType}
    onChange={(e) => setEditType(e.target.value)}
    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
  >
    {AGENT_TYPES.map((type) => (
      <option key={type} value={type}>
        {t(`agents.type.${type}`)}
      </option>
    ))}
  </select>
</div>
```

Update `handleUpdate` (line 279) to pass type:

```typescript
const result = await updateAgentAction({
  agentUuid: selectedAgent.uuid,
  name: editName.trim(),
  roles: editRoles,
  type: editType,
  persona: editPersona.trim() || null,
});
```

Update the optimistic state updates in `handleUpdate` to include `type: editType`.

- [ ] **Step 7: Update server actions to pass type through**

In `src/app/(dashboard)/settings/actions.ts`:

Update `CreateAgentKeyInput` (line 67):

```typescript
interface CreateAgentKeyInput {
  name: string;
  roles: string[];
  type?: string;
  persona: string | null;
}
```

Update `createAgentAndKeyAction` (line 95) to pass type:

```typescript
const agent = await createAgent({
  companyUuid: auth.companyUuid,
  name,
  roles,
  type: input.type || "openclaw",
  ownerUuid: auth.actorUuid,
  persona: input.persona?.trim() || null,
});
```

Update `UpdateAgentInput` (line 220):

```typescript
interface UpdateAgentInput {
  agentUuid: string;
  name: string;
  roles: string[];
  type?: string;
  persona: string | null;
}
```

Update `updateAgentAction` (line 251) to pass type:

```typescript
await updateAgent(input.agentUuid, {
  name,
  roles,
  type: input.type,
  persona: input.persona?.trim() || null,
}, auth.companyUuid);
```

- [ ] **Step 8: Update agent list fetch to include type**

In `handleCreate`'s refresh logic (line 224), ensure `type` is mapped:

```typescript
json.data.map((a: Record<string, unknown>) => ({
  ...a,
  type: (a.type as string) || "openclaw",
  lastActiveAt: a.lastActiveAt ? new Date(a.lastActiveAt as string) : null,
  createdAt: new Date(a.createdAt as string),
  _count: { apiKeys: a.apiKeyCount as number },
})),
```

- [ ] **Step 9: Commit**

```bash
git add src/app/(dashboard)/agents/agents-page-client.tsx src/app/(dashboard)/settings/actions.ts
git commit -m "feat: add agent type selector to management UI"
```

---

### Task 8: Related Works & Experiments UI — Filter Agent Dropdowns

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/related-works/page.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/page.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`

- [ ] **Step 1: Add `listRealtimeAgentSummaries` to agent service**

In `src/services/agent.service.ts`, add after `listAgentSummaries`:

```typescript
export async function listRealtimeAgentSummaries(companyUuid: string) {
  const { getTypesByTransport } = await import("@/lib/agent-transport");
  return prisma.agent.findMany({
    where: {
      companyUuid,
      type: { in: getTypesByTransport("realtime") },
    },
    select: {
      uuid: true,
      name: true,
      roles: true,
      type: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 2: Update Related Works page to pass only realtime agents**

In `src/app/(dashboard)/research-projects/[uuid]/related-works/page.tsx`, change the agents fetch:

```typescript
import { listRealtimeAgentSummaries } from "@/services/agent.service";

  const [works, agents] = await Promise.all([
    listRelatedWorks(auth.companyUuid, projectUuid),
    listRealtimeAgentSummaries(auth.companyUuid),
  ]);
```

- [ ] **Step 3: Update Experiments page to pass both all agents and realtime agents**

In `src/app/(dashboard)/research-projects/[uuid]/experiments/page.tsx`, fetch both sets:

```typescript
import { listAgentSummaries, listRealtimeAgentSummaries } from "@/services/agent.service";

  const [{ experiments }, allAgents, realtimeAgents, project, { researchQuestions }] = await Promise.all([
    listExperiments({ ... }),
    listAgentSummaries(auth.companyUuid),
    listRealtimeAgentSummaries(auth.companyUuid),
    prisma.researchProject.findFirst({ ... }),
    listResearchQuestions({ ... }),
  ]);
```

Pass both to the board:

```tsx
<ExperimentsBoard
  // ... existing props ...
  agents={allAgents.map((agent) => ({ uuid: agent.uuid, name: agent.name }))}
  realtimeAgents={realtimeAgents.map((agent) => ({ uuid: agent.uuid, name: agent.name }))}
/>
```

- [ ] **Step 4: Update ExperimentsBoard to use realtimeAgents for autonomous loop**

In `experiments-board.tsx`, add `realtimeAgents` prop and use it for the autonomous loop selector:

```typescript
interface ExperimentsBoardProps {
  // ... existing props ...
  realtimeAgents: Array<{ uuid: string; name: string }>;
}
```

Replace `agents` with `realtimeAgents` in the autonomous loop dropdown (around line 429):

```tsx
{realtimeAgents.map((a) => (
  <option key={a.uuid} value={a.uuid}>
    {a.name}
  </option>
))}
```

Keep `agents` for the experiment assignment dropdown (line 316) — all agent types can be assigned experiments.

- [ ] **Step 5: Commit**

```bash
git add src/services/agent.service.ts \
  src/app/(dashboard)/research-projects/[uuid]/related-works/page.tsx \
  src/app/(dashboard)/research-projects/[uuid]/experiments/page.tsx \
  src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx
git commit -m "feat: filter agent dropdowns by transport — realtime only for dispatch"
```

---

### Task 9: MCP Checkin — Add `type` and `experiments` to Response

**Files:**
- Modify: `src/mcp/tools/public.ts:232-316`

- [ ] **Step 1: Add type to checkin response**

In `src/mcp/tools/public.ts`, update the agent select (line 243) to include `type`:

```typescript
const agent = await prisma.agent.update({
  where: { uuid: auth.actorUuid },
  data: { lastActiveAt: new Date() },
  select: {
    uuid: true,
    name: true,
    roles: true,
    type: true,
    persona: true,
    systemPrompt: true,
    ownerUuid: true,
    owner: { select: { uuid: true, name: true, email: true } },
  },
});
```

Add `type` to the result agent object (line 292):

```typescript
agent: {
  uuid: agent.uuid,
  name: agent.name,
  roles: agent.roles,
  type: agent.type,
  persona: effectivePersona,
  systemPrompt: agent.systemPrompt,
  owner: agent.owner ? { uuid: agent.owner.uuid, name: agent.owner.name, email: agent.owner.email } : null,
},
```

- [ ] **Step 2: Add experiments to assignments**

After the existing `getMyAssignments` call (line 255), add a query for assigned experiments:

```typescript
// Get assigned experiments (new primary entity)
const assignedExperiments = await prisma.experiment.findMany({
  where: {
    companyUuid: auth.companyUuid,
    assigneeUuid: auth.actorUuid,
    status: { in: ["pending_start", "in_progress"] },
    ...(auth.researchProjectUuids && auth.researchProjectUuids.length > 0
      ? { researchProjectUuid: { in: auth.researchProjectUuids } }
      : {}),
  },
  select: {
    uuid: true,
    title: true,
    status: true,
    researchProject: { select: { uuid: true, name: true } },
  },
  orderBy: { createdAt: "asc" },
});
```

Add to the result object (after line 301):

```typescript
assignments: {
  experiments: assignedExperiments.map((e) => ({
    uuid: e.uuid,
    title: e.title,
    status: e.status,
    projectUuid: e.researchProject.uuid,
    projectName: e.researchProject.name,
  })),
  researchQuestions: researchQuestions.filter((i: { status: string }) => ["assigned", "in_progress"].includes(i.status)),
  experimentRuns: experimentRuns.filter((t: { status: string }) => ["assigned", "in_progress"].includes(t.status)),
},
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/public.ts
git commit -m "feat: include agent type and experiments in checkin response"
```

---

### Task 10: Claude Code Plugin — SessionStart Assignment Prompt

**Files:**
- Modify: `public/synapse-plugin/bin/on-session-start.sh`

- [ ] **Step 1: Add assignment formatting after state extraction**

In `on-session-start.sh`, after the state extraction block (after line 62, before line 64), add assignment parsing:

```bash
# Parse pending assignments for Claude context
ASSIGNMENTS_BLOCK=""
if command -v jq >/dev/null 2>&1; then
  # Count experiments
  EXP_COUNT=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.experiments | length // 0' 2>/dev/null) || EXP_COUNT=0
  # Count experiment runs (legacy)
  RUN_COUNT=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.experimentRuns | length // 0' 2>/dev/null) || RUN_COUNT=0

  TOTAL_ASSIGNMENTS=$((EXP_COUNT + RUN_COUNT))

  if [ "$TOTAL_ASSIGNMENTS" -gt 0 ]; then
    ASSIGNMENTS_BLOCK="
## Pending Assignments

You have ${TOTAL_ASSIGNMENTS} pending task(s) from Synapse. **Ask the user before starting any of them.**
"
    # List experiments
    if [ "$EXP_COUNT" -gt 0 ]; then
      EXP_LIST=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.experiments[] | "- [Experiment] \"\(.title)\" (uuid: `\(.uuid)`) — status: \(.status), project: \"\(.projectName)\""' 2>/dev/null) || true
      if [ -n "$EXP_LIST" ]; then
        ASSIGNMENTS_BLOCK="${ASSIGNMENTS_BLOCK}
${EXP_LIST}"
      fi
    fi

    # List experiment runs (legacy)
    if [ "$RUN_COUNT" -gt 0 ]; then
      RUN_LIST=$(echo "$CHECKIN_RESULT" | jq -r '.assignments.experimentRuns[] | "- [ExperimentRun] \"\(.title)\" (uuid: `\(.uuid)`) — status: \(.status), project: \"\(.project.name // "unknown")\"" ' 2>/dev/null) || true
      if [ -n "$RUN_LIST" ]; then
        ASSIGNMENTS_BLOCK="${ASSIGNMENTS_BLOCK}
${RUN_LIST}"
      fi
    fi
  fi
fi
```

- [ ] **Step 2: Inject assignments block into context**

Update the CONTEXT string (around line 65). Insert `${ASSIGNMENTS_BLOCK}` after the checkin result section and before Session Management:

Change:

```bash
CONTEXT="# Synapse Plugin — Active

Synapse is connected at ${SYNAPSE_URL}.
Session lifecycle hooks are enabled: SubagentStart, SubagentStop, TeammateIdle, TaskCompleted.

## Checkin Result

${CHECKIN_RESULT}

## Session Management — IMPORTANT
```

To:

```bash
CONTEXT="# Synapse Plugin — Active

Synapse is connected at ${SYNAPSE_URL}.
Session lifecycle hooks are enabled: SubagentStart, SubagentStop, TeammateIdle, TaskCompleted.

## Checkin Result

${CHECKIN_RESULT}
${ASSIGNMENTS_BLOCK}
## Session Management — IMPORTANT
```

- [ ] **Step 3: Commit**

```bash
git add public/synapse-plugin/bin/on-session-start.sh
git commit -m "feat: surface pending assignments in Claude Code SessionStart hook"
```

---

### Task 11: Bump Plugin Version

**Files:**
- Modify: `public/synapse-plugin/.claude-plugin/plugin.json`

- [ ] **Step 1: Bump version**

Update version from `"0.5.1"` to `"0.6.0"` in `public/synapse-plugin/.claude-plugin/plugin.json`.

- [ ] **Step 2: Commit**

```bash
git add public/synapse-plugin/.claude-plugin/plugin.json
git commit -m "chore: bump synapse plugin version to 0.6.0"
```

---

### Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add agent type documentation**

In the "Agent and MCP Rules" section, after the "Agent permission model" subsection, add:

```markdown
### Agent types

Agents have a `type` field that determines their notification transport capability:

- `openclaw` (default) — receives tasks in real-time via SSE notification stream
- `claude_code` — discovers tasks at session start via checkin assignments

Web UI task dispatch features (auto-search, deep research, autonomous loop) only list `realtime` transport agents (currently `openclaw`). Experiment assignment dropdowns show all agent types.

When adding new agent types, add an entry to `src/lib/agent-transport.ts` mapping the type to its transport capability.
```

- [ ] **Step 2: Add pitfall entry**

In the "Common Pitfalls" section, add:

```markdown
22. Dispatching tasks to poll-transport agents
    Auto-search, deep research, and autonomous loop require realtime transport. Only agents with `type = "openclaw"` (or future realtime types) can receive these. The API validates this — UI dropdowns should also filter by `?transport=realtime`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document agent type and transport mapping"
```

# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four Synapse UI enhancements: theme-aware notification card background, pending-review revert dialog with feedback and optional reassignment, persistent agent color picker (12 colors), and sidebar agent-activity indicator.

**Architecture:** Features 1 and 3 are local UI/schema changes. Feature 2 extends the existing `POST /api/experiments/[uuid]/review` endpoint and `reviewExperiment()` service with a new notification action `experiment_revision_requested` routed by the OpenClaw plugin event router. Feature 4 adds a project-scoped `agent-activity` read model driven by existing SSE events (no new tracking) and a `<SidebarSectionFrame>` component wired into the dashboard layout.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Prisma 7, Tailwind CSS 4, Radix/shadcn UI, Vitest, ioredis pub-sub, `next-intl`, MCP SDK 1.26.

All commits happen on `synapse:/home/ubuntu/Synapse` via SSH, on branch `session/2026-04-17-ui-enhancements`. The spec lives at `docs/superpowers/specs/2026-04-17-ui-enhancements-design.md`. Every user-facing string gets a key in both `messages/en.json` and `messages/zh.json`.

---

## Feature 1 — Theme-aware notification card background

### Task 1.1: Make notification popup use `bg-card` token

**Files:**
- Modify: `src/components/notification-popup.tsx:308`

- [ ] **Step 1: Change the root div to use `bg-card`**

Open `src/components/notification-popup.tsx` and locate line 308:

```tsx
    <div className="w-[calc(100vw-2rem)] max-w-[360px]">
```

Replace with:

```tsx
    <div className="w-[calc(100vw-2rem)] max-w-[360px] bg-card text-card-foreground">
```

- [ ] **Step 2: Visually verify both themes**

Run the dev server (if not already running):
```bash
ssh synapse-test 'cd /home/ubuntu/Synapse && pnpm dev -H 0.0.0.0 -p 3000' &
```

Open the bell in both light and dark theme. Card should be pure white on light and near-black on dark.

- [ ] **Step 3: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/components/notification-popup.tsx && git commit -m "Use theme card token for notification popup background

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

---

## Feature 3 — Agent color picker (12 colors)

Build before Feature 4 because Feature 4 reads `agent.color`.

### Task 3.1: Create agent-colors palette module

**Files:**
- Create: `src/lib/agent-colors.ts`
- Test: `src/lib/__tests__/agent-colors.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/agent-colors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  AGENT_COLOR_KEYS,
  AGENT_COLORS,
  DEFAULT_AGENT_COLOR_KEY,
  getAgentColor,
  isValidAgentColorKey,
} from "@/lib/agent-colors";

describe("agent-colors", () => {
  it("exposes exactly 12 palette keys", () => {
    expect(AGENT_COLOR_KEYS.length).toBe(12);
    expect(new Set(AGENT_COLOR_KEYS).size).toBe(12);
  });

  it("default key is terracotta and resolves to #C67A52", () => {
    expect(DEFAULT_AGENT_COLOR_KEY).toBe("terracotta");
    expect(AGENT_COLORS.terracotta.primary.toUpperCase()).toBe("#C67A52");
  });

  it("isValidAgentColorKey accepts known keys and rejects others", () => {
    expect(isValidAgentColorKey("terracotta")).toBe(true);
    expect(isValidAgentColorKey("violet")).toBe(true);
    expect(isValidAgentColorKey("not-a-color")).toBe(false);
    expect(isValidAgentColorKey(null)).toBe(false);
    expect(isValidAgentColorKey(undefined)).toBe(false);
  });

  it("getAgentColor returns explicit palette entry when provided", () => {
    const entry = getAgentColor("any-uuid", "violet");
    expect(entry.key).toBe("violet");
    expect(entry.primary).toBe(AGENT_COLORS.violet.primary);
  });

  it("getAgentColor ignores invalid explicit keys and falls back to hash", () => {
    const entry = getAgentColor("agent-uuid-abc", "not-a-color");
    expect(AGENT_COLOR_KEYS).toContain(entry.key);
  });

  it("getAgentColor is deterministic for same uuid without explicit key", () => {
    const a = getAgentColor("same-uuid", null);
    const b = getAgentColor("same-uuid", undefined);
    expect(a.key).toBe(b.key);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/lib/__tests__/agent-colors.test.ts'
```
Expected: FAIL — module `@/lib/agent-colors` does not exist.

- [ ] **Step 3: Implement the palette module**

Create `src/lib/agent-colors.ts`:

```ts
// Palette of 12 agent colors used for presence indicators, sidebar activity
// frames, and anywhere else an agent needs a consistent visual identity.

export interface AgentColorEntry {
  key: string;
  primary: string; // used for text / borders / badge accents
  light: string;   // used for backgrounds / soft fills
}

export const AGENT_COLORS = {
  terracotta: { key: "terracotta", primary: "#C67A52", light: "#F3E0D4" },
  violet:     { key: "violet",     primary: "#8B5CF6", light: "#EDE4FB" },
  pink:       { key: "pink",       primary: "#EC4899", light: "#FBDDEB" },
  blue:       { key: "blue",       primary: "#3B82F6", light: "#DBEAFD" },
  emerald:    { key: "emerald",    primary: "#10B981", light: "#CFF1E4" },
  amber:      { key: "amber",      primary: "#F59E0B", light: "#FDE7C2" },
  rose:       { key: "rose",       primary: "#F43F5E", light: "#FDD9DF" },
  cyan:       { key: "cyan",       primary: "#06B6D4", light: "#C7EEF6" },
  indigo:     { key: "indigo",     primary: "#6366F1", light: "#DDDEFA" },
  teal:       { key: "teal",       primary: "#14B8A6", light: "#C7EEE8" },
  lime:       { key: "lime",       primary: "#65A30D", light: "#DAEDC1" },
  slate:      { key: "slate",      primary: "#475569", light: "#D9DEE6" },
} satisfies Record<string, AgentColorEntry>;

export const AGENT_COLOR_KEYS = Object.keys(AGENT_COLORS) as Array<keyof typeof AGENT_COLORS>;

export const DEFAULT_AGENT_COLOR_KEY = "terracotta" as const;

export function isValidAgentColorKey(key: unknown): key is keyof typeof AGENT_COLORS {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(AGENT_COLORS, key);
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getAgentColor(agentUuid: string, explicitKey?: string | null): AgentColorEntry {
  if (isValidAgentColorKey(explicitKey)) {
    return AGENT_COLORS[explicitKey];
  }
  const idx = hashString(agentUuid) % AGENT_COLOR_KEYS.length;
  return AGENT_COLORS[AGENT_COLOR_KEYS[idx]];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/lib/__tests__/agent-colors.test.ts'
```
Expected: PASS all assertions.

- [ ] **Step 5: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/lib/agent-colors.ts src/lib/__tests__/agent-colors.test.ts && git commit -m "Add agent color palette with 12 keys

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 3.2: Add `color` column to Agent schema

**Files:**
- Modify: `prisma/schema.prisma` (Agent model)
- Create: `prisma/migrations/<timestamp>_add_agent_color/migration.sql`

- [ ] **Step 1: Edit the Agent model**

Open `prisma/schema.prisma` and locate the Agent model (starts at line 66). Add a `color` field just after `type`:

```prisma
model Agent {
  id           Int       @id @default(autoincrement())
  uuid         String    @unique @default(uuid())
  companyUuid  String
  company      Company   @relation(fields: [companyUuid], references: [uuid])
  name         String
  roles        String[]  @default(["researcher"])
  type         String    @default("openclaw")
  color        String?   // palette key from src/lib/agent-colors.ts. Null = hash fallback.
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

- [ ] **Step 2: Create the migration**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm db:migrate:dev --name add_agent_color'
```

Expected: migration directory created under `prisma/migrations/` and schema applied. Prisma client regenerates.

- [ ] **Step 3: Verify client type includes `color`**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && grep -n "color" src/generated/prisma/index.d.ts | head -5'
```
Expected: at least one match showing the `color` field on Agent.

- [ ] **Step 4: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add prisma/schema.prisma prisma/migrations/ src/generated/prisma/ && git commit -m "Add color column to Agent model

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 3.3: Accept and persist `color` through agent service and server actions

**Files:**
- Modify: `src/services/agent.service.ts` (create/update + select statements)
- Modify: `src/app/(dashboard)/settings/actions.ts` (createAgentAndKeyAction, updateAgentAction)
- Modify: `src/app/api/agents/route.ts` (POST handler validation)
- Modify: `src/app/api/agents/[uuid]/route.ts` (PATCH handler validation)
- Test: `src/services/__tests__/agent.service.color.test.ts`

- [ ] **Step 1: Write failing test for create + update carrying color**

Create `src/services/__tests__/agent.service.color.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAgent, updateAgent } from "@/services/agent.service";

const TEST_COMPANY = "test-company-color";

describe("agent.service color persistence", () => {
  beforeAll(async () => {
    await prisma.company.upsert({
      where: { uuid: TEST_COMPANY },
      update: {},
      create: { uuid: TEST_COMPANY, name: "Color Test Co" },
    });
  });

  afterAll(async () => {
    await prisma.agent.deleteMany({ where: { companyUuid: TEST_COMPANY } });
    await prisma.company.deleteMany({ where: { uuid: TEST_COMPANY } });
  });

  it("createAgent stores the color key and returns it", async () => {
    const agent = await createAgent({
      companyUuid: TEST_COMPANY,
      name: "Painter",
      roles: ["research"],
      ownerUuid: "owner-1",
      color: "violet",
    });
    expect(agent.color).toBe("violet");
  });

  it("updateAgent can change color to a new key or clear to null", async () => {
    const agent = await createAgent({
      companyUuid: TEST_COMPANY,
      name: "Chameleon",
      roles: ["research"],
      ownerUuid: "owner-2",
      color: "teal",
    });
    const toBlue = await updateAgent(agent.uuid, { color: "blue" });
    expect(toBlue.color).toBe("blue");
    const cleared = await updateAgent(agent.uuid, { color: null });
    expect(cleared.color).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/services/__tests__/agent.service.color.test.ts'
```
Expected: FAIL — `color` is not a recognized parameter of `createAgent` / `updateAgent`.

- [ ] **Step 3: Extend the service**

In `src/services/agent.service.ts`:

1. Extend `AgentCreateParams` and `AgentUpdateParams`:

```ts
export interface AgentCreateParams {
  companyUuid: string;
  name: string;
  roles: string[];
  type?: string;
  ownerUuid: string;
  persona?: string | null;
  systemPrompt?: string | null;
  color?: string | null;
}

export interface AgentUpdateParams {
  name?: string;
  roles?: string[];
  type?: string;
  persona?: string | null;
  systemPrompt?: string | null;
  color?: string | null;
}
```

2. Add `color` to every `select` that exposes agent shape. Replace the existing `createAgent` body and `updateAgent` body:

```ts
export async function createAgent({
  companyUuid,
  name,
  roles,
  type,
  ownerUuid,
  persona,
  systemPrompt,
  color,
}: AgentCreateParams) {
  return prisma.agent.create({
    data: {
      companyUuid,
      name,
      roles,
      type: type || "openclaw",
      ownerUuid,
      persona,
      systemPrompt,
      color: color ?? null,
    },
    select: {
      uuid: true,
      name: true,
      roles: true,
      type: true,
      persona: true,
      systemPrompt: true,
      ownerUuid: true,
      color: true,
      createdAt: true,
    },
  });
}

export async function updateAgent(uuid: string, data: AgentUpdateParams, companyUuid?: string) {
  if (companyUuid) {
    const agent = await prisma.agent.findFirst({
      where: { uuid, companyUuid },
      select: { uuid: true },
    });
    if (!agent) {
      throw new Error("Agent not found");
    }
  }

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
      color: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
}
```

3. Add `color: true` to the `select` in `listAgents` and `getAgent` and `listAgentSummaries` and `listRealtimeAgentSummaries` so the UI can read it in one fetch.

- [ ] **Step 4: Run test to verify create/update pass**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/services/__tests__/agent.service.color.test.ts'
```
Expected: PASS.

- [ ] **Step 5: Extend server actions for create and update**

In `src/app/(dashboard)/settings/actions.ts`:

1. Add import near the top (alongside existing imports):

```ts
import { isValidAgentColorKey, DEFAULT_AGENT_COLOR_KEY } from "@/lib/agent-colors";
```

2. Extend `CreateAgentKeyInput`:

```ts
interface CreateAgentKeyInput {
  name: string;
  roles: string[];
  type?: string;
  persona: string | null;
  color?: string | null;
}
```

3. In `createAgentAndKeyAction`, validate and pass color. After the existing `if (input.type && !VALID_AGENT_TYPES.includes(input.type))` check, insert:

```ts
  const resolvedColor = input.color && isValidAgentColorKey(input.color)
    ? input.color
    : DEFAULT_AGENT_COLOR_KEY;
```

Then pass `color: resolvedColor` to the `createAgent` call.

4. Extend `UpdateAgentInput`:

```ts
interface UpdateAgentInput {
  agentUuid: string;
  name: string;
  roles: string[];
  type?: string;
  persona: string | null;
  color?: string | null;
}
```

5. In `updateAgentAction`, validate and pass color. After the existing type check, insert:

```ts
  let nextColor: string | null | undefined = undefined;
  if (input.color !== undefined) {
    if (input.color === null) {
      nextColor = null;
    } else if (isValidAgentColorKey(input.color)) {
      nextColor = input.color;
    } else {
      return { success: false, error: "Invalid agent color" };
    }
  }
```

Then pass `color: nextColor` in the `updateAgent(...)` call only when `nextColor !== undefined`:

```ts
    await updateAgent(input.agentUuid, {
      name,
      roles,
      type: input.type,
      persona: input.persona?.trim() || null,
      ...(nextColor !== undefined ? { color: nextColor } : {}),
    }, auth.companyUuid);
```

- [ ] **Step 6: Extend the public REST routes to accept color**

In `src/app/api/agents/route.ts` (POST), add after the existing type validation:

```ts
  const { isValidAgentColorKey, DEFAULT_AGENT_COLOR_KEY } = await import("@/lib/agent-colors");
  let color: string | null = DEFAULT_AGENT_COLOR_KEY;
  if (body.color !== undefined && body.color !== null) {
    if (!isValidAgentColorKey(body.color)) {
      return errors.validationError({ color: "Invalid agent color" });
    }
    color = body.color;
  } else if (body.color === null) {
    color = null;
  }
```

Extend the body destructure type and pass `color` into `createAgent({ ... color })`. Also add `color: agent.color` to the success response.

In `src/app/api/agents/[uuid]/route.ts` (PATCH), inside the `body` type add `color?: string | null;`. After the type validation block, insert:

```ts
    if (body.color !== undefined) {
      if (body.color === null) {
        updateData.color = null;
      } else {
        const { isValidAgentColorKey } = await import("@/lib/agent-colors");
        if (!isValidAgentColorKey(body.color)) {
          return errors.validationError({ color: "Invalid agent color" });
        }
        updateData.color = body.color;
      }
    }
```

Also extend the `updateData` type on line 86 to include `color?: string | null;`, and add `color: updated.color` to the PATCH response and `color: agent.color` to the GET response.

- [ ] **Step 7: Run lint + type check**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm lint && pnpm vitest run src/services/__tests__/agent.service.color.test.ts'
```
Expected: lint clean, tests pass.

- [ ] **Step 8: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/services/agent.service.ts src/services/__tests__/agent.service.color.test.ts src/app/\(dashboard\)/settings/actions.ts src/app/api/agents/route.ts src/app/api/agents/\[uuid\]/route.ts && git commit -m "Persist agent color through service, actions, and REST endpoints

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 3.4: Build `AgentColorPicker` component

**Files:**
- Create: `src/components/agent-color-picker.tsx`

- [ ] **Step 1: Implement the picker**

Create `src/components/agent-color-picker.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import {
  AGENT_COLOR_KEYS,
  AGENT_COLORS,
  type AgentColorEntry,
} from "@/lib/agent-colors";
import { cn } from "@/lib/utils";

interface AgentColorPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function AgentColorPicker({ value, onChange, className, disabled }: AgentColorPickerProps) {
  const t = useTranslations();

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-label={t("agents.form.colorLabel")}>
      {AGENT_COLOR_KEYS.map((key) => {
        const entry: AgentColorEntry = AGENT_COLORS[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`agents.colors.${key}` as Parameters<typeof t>[0])}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "h-7 w-7 rounded-full border border-border transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected && "ring-2 ring-primary ring-offset-2",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            style={{ backgroundColor: entry.primary }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/components/agent-color-picker.tsx && git commit -m "Add AgentColorPicker component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 3.5: Wire the color picker into the agent create + edit UI

**Files:**
- Modify: `src/app/(dashboard)/agents/agents-page-client.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add i18n keys to `messages/en.json`**

Inside the `"agents"` object, add a `"form"` section if missing and a `"colors"` section. The exact keys used in the component:

```json
"agents": {
  "form": {
    "colorLabel": "Color"
  },
  "colors": {
    "terracotta": "Terracotta",
    "violet": "Violet",
    "pink": "Pink",
    "blue": "Blue",
    "emerald": "Emerald",
    "amber": "Amber",
    "rose": "Rose",
    "cyan": "Cyan",
    "indigo": "Indigo",
    "teal": "Teal",
    "lime": "Lime",
    "slate": "Slate"
  }
}
```

Merge under the existing `agents` object — do not replace existing keys.

- [ ] **Step 2: Add matching keys to `messages/zh.json`**

```json
"agents": {
  "form": {
    "colorLabel": "颜色"
  },
  "colors": {
    "terracotta": "陶土色",
    "violet": "紫罗兰",
    "pink": "粉红",
    "blue": "蓝色",
    "emerald": "翠绿",
    "amber": "琥珀",
    "rose": "玫瑰红",
    "cyan": "青色",
    "indigo": "靛蓝",
    "teal": "青绿",
    "lime": "柠檬绿",
    "slate": "石板灰"
  }
}
```

- [ ] **Step 3: Extend `AgentSummary` and local state in the page client**

Open `src/app/(dashboard)/agents/agents-page-client.tsx`. Update the `AgentSummary` interface to include `color: string | null;`.

Near the existing `useState` hooks that manage the create form (search for `useState<string>("")` blocks for name/persona), add:

```ts
  const [formColor, setFormColor] = useState<string | null>("terracotta");
```

Near the edit form state (search for `setEditName`, `setEditPersona`), add:

```ts
  const [editColor, setEditColor] = useState<string | null>(null);
```

When opening the edit sheet, seed `editColor` from the agent. In the edit-sheet open handler (search for `setEditName(agent.name)`), add:

```ts
    setEditColor(agent.color ?? null);
```

- [ ] **Step 4: Render the picker inside the create form**

Find the create form block (look for the input labeled `agents.form.nameLabel` or similar and the `persona` field). Just above the submit button, insert:

```tsx
  <div className="space-y-2">
    <Label>{t("agents.form.colorLabel")}</Label>
    <AgentColorPicker value={formColor} onChange={(v) => setFormColor(v)} />
  </div>
```

Import the component at the top of the file:

```tsx
import { AgentColorPicker } from "@/components/agent-color-picker";
```

- [ ] **Step 5: Pass color in the create submit handler**

Locate the handler that calls `createAgentAndKeyAction`. Extend the call with `color: formColor`:

```tsx
  const result = await createAgentAndKeyAction({
    name: formName.trim(),
    roles: selectedRoles,
    type: formType,
    persona: formPersona.trim() || null,
    color: formColor,
  });
```

- [ ] **Step 6: Render the picker inside the edit sheet**

Locate the edit sheet body (look for `updateAgentAction` or `editName`/`editPersona`). Add, just above the save button:

```tsx
  <div className="space-y-2">
    <Label>{t("agents.form.colorLabel")}</Label>
    <AgentColorPicker value={editColor} onChange={(v) => setEditColor(v)} />
  </div>
```

- [ ] **Step 7: Pass color in the edit submit handler**

Extend the call to `updateAgentAction`:

```tsx
  const result = await updateAgentAction({
    agentUuid: editingAgent.uuid,
    name: editName.trim(),
    roles: editSelectedRoles,
    type: editType,
    persona: editPersona.trim() || null,
    color: editColor,
  });
```

- [ ] **Step 8: Render a color swatch on each agent row**

Find the main agent card / row renderer (the component that shows the agent name and roles). Just before the name, add a swatch:

```tsx
  {/* Color swatch */}
  {(() => {
    const { primary } = getAgentColor(agent.uuid, agent.color);
    return (
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: primary }}
      />
    );
  })()}
```

Add the import at the top:

```tsx
import { getAgentColor } from "@/lib/agent-colors";
```

- [ ] **Step 9: Lint + build**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm lint && pnpm build'
```
Expected: lint clean, build succeeds.

- [ ] **Step 10: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/app/\(dashboard\)/agents/agents-page-client.tsx messages/en.json messages/zh.json && git commit -m "Wire agent color picker into create and edit forms

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 3.6: Have presence-indicator use `agent.color` when available

**Files:**
- Modify: `src/components/ui/presence-indicator.tsx`
- Test: `src/components/ui/__tests__/presence-indicator.test.tsx` (if an existing test exists, extend it; otherwise skip test-writing and verify by screenshot)

- [ ] **Step 1: Audit the existing usage**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && grep -rn "presence-indicator\|PresenceIndicator" src/'
```
Note the callers — each needs to be updated to pass `agent.color` when it already has the agent object.

- [ ] **Step 2: Extend the PresenceIndicator prop type**

Open `src/components/ui/presence-indicator.tsx`. Wherever agents are expressed as `{ uuid, name }`, extend to `{ uuid, name, color?: string | null }`. Change the internal `getAgentColor(agent.uuid)` call to `getAgentColor(agent.uuid, agent.color ?? null)`.

- [ ] **Step 3: Update callers that already have `agent.color`**

Run the grep from step 1. For each caller, if its source agent object already has `color` (e.g. from `listAgents` responses that were updated in Task 3.3), pass `color: a.color` through. Callers that only have `uuid` can continue to pass `undefined`; the fallback still works.

- [ ] **Step 4: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/components/ui/presence-indicator.tsx && git commit -m "Use stored agent color in presence indicator when available

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

---

## Feature 2 — Pending-review revert dialog with feedback

### Task 2.1: Extend the review API schema and `reviewExperiment` service

**Files:**
- Modify: `src/app/api/experiments/[uuid]/review/route.ts`
- Modify: `src/services/experiment.service.ts` (`reviewExperiment` function)
- Test: `src/services/__tests__/experiment.service.review.test.ts`

- [ ] **Step 1: Write failing test for the revert behavior**

Create `src/services/__tests__/experiment.service.review.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { reviewExperiment } from "@/services/experiment.service";

vi.mock("@/services/notification.service", () => ({
  notificationService: {
    create: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/activity.service", () => ({
  activityService: {
    createActivity: vi.fn(async () => ({})),
  },
}));

const COMPANY = "test-company-review";

async function seedExperimentAndAgent(opts: { createdByAgentUuid: string; assigneeUuid?: string | null }) {
  await prisma.company.upsert({
    where: { uuid: COMPANY },
    update: {},
    create: { uuid: COMPANY, name: "Review Test Co" },
  });
  const agent = await prisma.agent.upsert({
    where: { uuid: opts.createdByAgentUuid },
    update: {},
    create: {
      uuid: opts.createdByAgentUuid,
      companyUuid: COMPANY,
      name: "Agent",
      type: "openclaw",
      roles: ["experiment"],
    },
  });
  const project = await prisma.researchProject.create({
    data: { companyUuid: COMPANY, name: "P1", createdByUuid: "user-1" },
  });
  const experiment = await prisma.experiment.create({
    data: {
      companyUuid: COMPANY,
      researchProjectUuid: project.uuid,
      title: "E1",
      status: "pending_review",
      createdByType: "agent",
      createdByUuid: agent.uuid,
      assigneeType: opts.assigneeUuid ? "agent" : null,
      assigneeUuid: opts.assigneeUuid ?? null,
      priority: "medium",
    },
  });
  return { agent, project, experiment };
}

describe("reviewExperiment revert paths", () => {
  beforeEach(async () => {
    await prisma.experiment.deleteMany({ where: { companyUuid: COMPANY } });
    await prisma.researchProject.deleteMany({ where: { companyUuid: COMPANY } });
    await prisma.agent.deleteMany({ where: { companyUuid: COMPANY } });
  });

  it("reverting without agent flips status to draft and does not create comment or notification", async () => {
    const { experiment } = await seedExperimentAndAgent({ createdByAgentUuid: "a-1", assigneeUuid: "a-1" });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: experiment.uuid,
      approved: false,
      reviewNote: "ignored because agent cleared",
      assignedAgentUuid: null,
      actorUuid: "user-1",
    });

    const after = await prisma.experiment.findUnique({ where: { uuid: experiment.uuid } });
    expect(after?.status).toBe("draft");
    expect(after?.assigneeUuid).toBeNull();

    const comments = await prisma.comment.findMany({ where: { targetUuid: experiment.uuid } });
    expect(comments.length).toBe(0);
  });

  it("reverting with agent + note creates a comment and notification", async () => {
    const { experiment, agent } = await seedExperimentAndAgent({ createdByAgentUuid: "a-2", assigneeUuid: "a-2" });
    const { notificationService } = await import("@/services/notification.service");

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: experiment.uuid,
      approved: false,
      reviewNote: "Please fix the metric",
      assignedAgentUuid: agent.uuid,
      actorUuid: "user-1",
    });

    const after = await prisma.experiment.findUnique({ where: { uuid: experiment.uuid } });
    expect(after?.status).toBe("draft");
    expect(after?.assigneeUuid).toBe(agent.uuid);

    const comments = await prisma.comment.findMany({ where: { targetUuid: experiment.uuid, targetType: "experiment" } });
    expect(comments.length).toBe(1);
    expect(comments[0].content).toBe("Please fix the metric");

    expect(notificationService.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "experiment_revision_requested",
      recipientUuid: agent.uuid,
    }));
  });

  it("reassigns to a different agent when provided", async () => {
    const { experiment } = await seedExperimentAndAgent({ createdByAgentUuid: "a-3", assigneeUuid: "a-3" });
    const otherAgent = await prisma.agent.create({
      data: { uuid: "a-3-other", companyUuid: COMPANY, name: "Other", type: "openclaw", roles: ["experiment"] },
    });

    await reviewExperiment({
      companyUuid: COMPANY,
      experimentUuid: experiment.uuid,
      approved: false,
      reviewNote: "switch owners",
      assignedAgentUuid: otherAgent.uuid,
      actorUuid: "user-1",
    });

    const after = await prisma.experiment.findUnique({ where: { uuid: experiment.uuid } });
    expect(after?.assigneeUuid).toBe(otherAgent.uuid);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/services/__tests__/experiment.service.review.test.ts'
```
Expected: FAIL — `assignedAgentUuid` is not recognized by `reviewExperiment`, `experiment_revision_requested` is not emitted, and comment creation does not happen.

- [ ] **Step 3: Extend `reviewExperiment` signature and behavior**

In `src/services/experiment.service.ts`, replace the `reviewExperiment` function (starting at the `export async function reviewExperiment(input: {` line ~636) with:

```ts
export async function reviewExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  approved: boolean;
  reviewNote?: string | null;
  assignedAgentUuid?: string | null; // present (even if null) = caller wants to set assignment
  actorUuid: string;
}) {
  const existing = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid, companyUuid: input.companyUuid },
    include: { researchProject: { select: { name: true } } },
  });

  if (!existing) {
    throw new Error("Experiment not found");
  }

  assertTransition(existing.status as ExperimentStatus, input.approved ? "pending_start" : "draft");

  // Approval auto-assigns back to the creator (existing behavior). We preserve this.
  const shouldAutoAssign =
    input.approved &&
    existing.createdByType === "agent" &&
    existing.createdByUuid &&
    !existing.assigneeUuid;

  // For rejects: if caller sent `assignedAgentUuid` key (!== undefined), honor it.
  const callerSetAssignment = Object.prototype.hasOwnProperty.call(input, "assignedAgentUuid");
  const nextAssigneeUuid = callerSetAssignment
    ? (input.assignedAgentUuid ?? null)
    : existing.assigneeUuid;
  const nextAssigneeType = nextAssigneeUuid ? "agent" : null;

  const updated = await prisma.experiment.update({
    where: { uuid: input.experimentUuid },
    data: {
      status: input.approved ? "pending_start" : "draft",
      reviewedByUuid: input.actorUuid,
      reviewNote: input.reviewNote ?? null,
      reviewedAt: new Date(),
      ...(shouldAutoAssign
        ? {
            assigneeType: "agent",
            assigneeUuid: existing.createdByUuid,
            assignedAt: new Date(),
            assignedByUuid: input.actorUuid,
          }
        : {}),
      ...(!input.approved && callerSetAssignment
        ? {
            assigneeType: nextAssigneeType,
            assigneeUuid: nextAssigneeUuid,
            assignedAt: nextAssigneeUuid ? new Date() : null,
            assignedByUuid: nextAssigneeUuid ? input.actorUuid : null,
            liveStatus: null,
            liveMessage: null,
          }
        : {}),
    },
    include: {
      researchQuestion: {
        select: { uuid: true, title: true, parentQuestionUuid: true },
      },
    },
  });

  await activityService.createActivity({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    targetType: "experiment",
    targetUuid: updated.uuid,
    actorType: "user",
    actorUuid: input.actorUuid,
    action: input.approved ? "approved" : "rejected",
    value: input.reviewNote ? { reviewNote: input.reviewNote } : undefined,
  });

  eventBus.emitChange({
    companyUuid: input.companyUuid,
    researchProjectUuid: updated.researchProjectUuid,
    entityType: "experiment",
    entityUuid: updated.uuid,
    action: "updated",
    actorUuid: input.actorUuid,
  });

  if (shouldAutoAssign) {
    try {
      const actorName = await getActorName("user", input.actorUuid);
      await notificationService.create({
        companyUuid: input.companyUuid,
        researchProjectUuid: updated.researchProjectUuid,
        recipientType: "agent",
        recipientUuid: existing.createdByUuid,
        entityType: "experiment",
        entityUuid: updated.uuid,
        entityTitle: updated.title,
        projectName: existing.researchProject.name,
        action: "task_assigned",
        message: `${updated.title} has been approved and assigned to you.`,
        actorType: "user",
        actorUuid: input.actorUuid,
        actorName: actorName || "Unknown",
      });
      await updateExperimentLiveStatus(input.experimentUuid, "sent");
    } catch (err) {
      console.error("Failed to send task_assigned notification after review approval:", err);
    }
  }

  // Revision request: when rejected and a target agent is chosen, notify them
  // with the feedback so they can revise the draft. Realtime plugin will wake
  // the agent; poll agents pick it up on check-in.
  const trimmedNote = (input.reviewNote ?? "").trim();
  if (!input.approved && nextAssigneeUuid) {
    try {
      const actorName = await getActorName("user", input.actorUuid);
      if (trimmedNote) {
        await prisma.comment.create({
          data: {
            companyUuid: input.companyUuid,
            targetType: "experiment",
            targetUuid: updated.uuid,
            content: trimmedNote,
            authorType: "user",
            authorUuid: input.actorUuid,
          },
        });
      }

      await notificationService.create({
        companyUuid: input.companyUuid,
        researchProjectUuid: updated.researchProjectUuid,
        recipientType: "agent",
        recipientUuid: nextAssigneeUuid,
        entityType: "experiment",
        entityUuid: updated.uuid,
        entityTitle: updated.title,
        projectName: existing.researchProject.name,
        action: "experiment_revision_requested",
        message: trimmedNote
          ? `Revision requested: ${trimmedNote.slice(0, 160)}`
          : "Revision requested — see the experiment draft.",
        actorType: "user",
        actorUuid: input.actorUuid,
        actorName: actorName || "Unknown",
      });
    } catch (err) {
      console.error("Failed to emit revision request for reverted experiment:", err);
    }
  }

  if (!input.approved) {
    await checkAutonomousLoopTrigger(updated.researchProjectUuid, input.companyUuid).catch(
      (err) => console.error("Autonomous loop trigger check failed:", err)
    );
  }

  return formatExperiment(input.companyUuid, updated);
}
```

Note: the `Comment` model uses `authorType`/`authorUuid` (not `actorType`/`actorUuid`) and does not have a `researchProjectUuid` column — confirmed against `prisma/schema.prisma`.

- [ ] **Step 4: Extend the route schema**

In `src/app/api/experiments/[uuid]/review/route.ts`, update the zod schema and the service call:

```ts
const reviewSchema = z.object({
  approved: z.boolean(),
  reviewNote: z.string().optional(),
  assignedAgentUuid: z.string().uuid().nullable().optional(),
});
```

Extend the `reviewExperiment` call:

```ts
  const experiment = await reviewExperiment({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    approved: parsed.data.approved,
    reviewNote: parsed.data.reviewNote,
    ...(parsed.data.assignedAgentUuid !== undefined ? { assignedAgentUuid: parsed.data.assignedAgentUuid } : {}),
    actorUuid: auth.actorUuid,
  });
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/services/__tests__/experiment.service.review.test.ts'
```
Expected: PASS all three specs.

- [ ] **Step 6: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/services/experiment.service.ts src/services/__tests__/experiment.service.review.test.ts src/app/api/experiments/\[uuid\]/review/route.ts && git commit -m "Support feedback and reassignment on experiment revert

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 2.2: Build the revert dialog UI

**Files:**
- Create: `src/app/(dashboard)/research-projects/[uuid]/experiments/revert-dialog.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add i18n keys (both languages)**

In `messages/en.json`, inside `"experiments"`:

```json
"reviewRevert": {
  "title": "Send back to draft",
  "description": "Give the agent feedback on what to revise. Leave feedback empty to return the draft without changes.",
  "noteLabel": "Feedback for agent (optional)",
  "notePlaceholder": "What should the agent revise?",
  "agentLabel": "Assign to",
  "agentNone": "No agent",
  "submit": "Send back to draft",
  "cancel": "Cancel"
}
```

In `messages/zh.json`:

```json
"reviewRevert": {
  "title": "退回草稿",
  "description": "留言告诉 Agent 需要修改什么。如果不需要修改，可留空反馈。",
  "noteLabel": "反馈（可选）",
  "notePlaceholder": "希望 Agent 修改什么？",
  "agentLabel": "指派给",
  "agentNone": "不指派",
  "submit": "退回草稿",
  "cancel": "取消"
}
```

Under `"notifications.actions"` in both files, add:

- en: `"experimentRevisionRequested": "requested revisions on"`
- zh: `"experimentRevisionRequested": "请求修改"`

- [ ] **Step 2: Create the dialog component**

Create `src/app/(dashboard)/research-projects/[uuid]/experiments/revert-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AgentOption {
  uuid: string;
  name: string;
}

interface RevertDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  currentAssigneeUuid: string | null;
  agents: AgentOption[];
  onSubmit: (payload: { reviewNote: string; assignedAgentUuid: string | null }) => Promise<void>;
}

export function RevertDialog({ open, onOpenChange, currentAssigneeUuid, agents, onSubmit }: RevertDialogProps) {
  const t = useTranslations();
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<string>(currentAssigneeUuid ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit({
        reviewNote: note.trim(),
        assignedAgentUuid: assignee === "" ? null : assignee,
      });
      setNote("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("experiments.reviewRevert.title")}</DialogTitle>
          <DialogDescription>{t("experiments.reviewRevert.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="revert-note">{t("experiments.reviewRevert.noteLabel")}</Label>
            <Textarea
              id="revert-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("experiments.reviewRevert.notePlaceholder")}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="revert-agent">{t("experiments.reviewRevert.agentLabel")}</Label>
            <select
              id="revert-agent"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t("experiments.reviewRevert.agentNone")}</option>
              {agents.map((a) => (
                <option key={a.uuid} value={a.uuid}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t("experiments.reviewRevert.cancel")}
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {t("experiments.reviewRevert.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire the dialog into the experiments board**

Open `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`.

Add imports at the top:

```tsx
import { RevertDialog } from "./revert-dialog";
```

In the `ExperimentsBoard` component state (after other `useState` declarations), add:

```tsx
  const [revertTargetUuid, setRevertTargetUuid] = useState<string | null>(null);
```

Replace the existing "Return to Draft" button block (lines ~390–403) with:

```tsx
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={(event) => {
              event.stopPropagation();
              setRevertTargetUuid(experiment.uuid);
            }}
          >
            <CornerUpLeft className="mr-2 h-4 w-4" />
            {t("experiments.actions.returnToDraft")}
          </Button>
```

At the very end of the `return (...)` JSX (just before the closing fragment `</>`), render the dialog:

```tsx
      {revertTargetUuid && (() => {
        const target = experiments.find((e) => e.uuid === revertTargetUuid);
        if (!target) return null;
        const currentAssigneeUuid = target.assignee?.type === "agent" ? target.assignee.uuid : null;
        return (
          <RevertDialog
            open={revertTargetUuid !== null}
            onOpenChange={(next) => { if (!next) setRevertTargetUuid(null); }}
            currentAssigneeUuid={currentAssigneeUuid}
            agents={agents}
            onSubmit={async ({ reviewNote, assignedAgentUuid }) => {
              await postAction(target.uuid, "review", {
                approved: false,
                ...(reviewNote ? { reviewNote } : {}),
                assignedAgentUuid,
              });
              setRevertTargetUuid(null);
            }}
          />
        );
      })()}
```

- [ ] **Step 4: Lint and build**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm lint && pnpm build'
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add "src/app/(dashboard)/research-projects/[uuid]/experiments/" messages/en.json messages/zh.json && git commit -m "Add revert dialog with feedback and reassignment

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 2.3: Route `experiment_revision_requested` in the OpenClaw plugin

**Files:**
- Modify: `packages/openclaw-plugin/src/event-router.ts`
- Modify: `packages/openclaw-plugin/package.json` (bump version)
- Modify: `packages/openclaw-plugin/README.md` (short note)

- [ ] **Step 1: Add the new notification action handler**

In `packages/openclaw-plugin/src/event-router.ts`, extend the `switch (notification.action)` block in `fetchAndRoute` (around line 134). Add a new case after `experiment_plan_requested`:

```ts
        case "experiment_revision_requested":
          this.handleExperimentRevisionRequested(notification);
          break;
```

Then add the handler method alongside the other `handle*` methods:

```ts
  private handleExperimentRevisionRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "experiment");

    this.triggerAgent(
      `[Synapse] A reviewer sent experiment "${n.entityTitle}" back to draft for revision (experimentUuid: ${n.entityUuid}, projectUuid: ${projectUuid}).

Reviewer feedback: ${n.message}

Your task:
1. Use synapse_get_experiment with experimentUuid "${n.entityUuid}" to re-read the experiment.
2. Use synapse_get_comments with targetType "experiment" and targetUuid "${n.entityUuid}" to read the full feedback thread.
3. Revise the experiment's title/description to address the feedback.
4. Use synapse_update_experiment_plan (or the appropriate update tool) with experimentUuid "${n.entityUuid}" to save the revised plan.
5. When the revision is ready, set the experiment status to "pending_review" so the reviewer can approve it.
` + mentionGuidance,
      { notificationUuid: n.uuid, action: "experiment_revision_requested", entityUuid: n.entityUuid, projectUuid }
    );
  }
```

- [ ] **Step 2: Bump the plugin version**

Edit `packages/openclaw-plugin/package.json` and bump the patch version (e.g. `0.10.2` → `0.10.3`).

- [ ] **Step 3: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add packages/openclaw-plugin && git commit -m "Route experiment_revision_requested in OpenClaw plugin

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

- [ ] **Step 4: Publish and deploy the plugin**

```bash
ssh synapse 'cd /home/ubuntu/Synapse/packages/openclaw-plugin && npm publish --access public'
ssh openclaw 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && rm -rf /home/ubuntu/.openclaw/extensions/synapse-openclaw-plugin && openclaw plugins install @vincentwei1021/synapse-openclaw-plugin'
ssh openclaw 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && openclaw gateway restart'
```

Verify installed version:

```bash
ssh openclaw 'cat /home/ubuntu/.openclaw/extensions/synapse-openclaw-plugin/package.json | grep version'
```
Expected: the bumped version printed.

---

## Feature 4 — Sidebar agent-activity indicator

### Task 4.1: Create the agent-activity service

**Files:**
- Create: `src/services/agent-activity.service.ts`
- Test: `src/services/__tests__/agent-activity.service.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/services/__tests__/agent-activity.service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getProjectAgentActivity } from "@/services/agent-activity.service";

const COMPANY = "test-company-agent-activity";

beforeEach(async () => {
  await prisma.experiment.deleteMany({ where: { companyUuid: COMPANY } });
  await prisma.relatedWork.deleteMany({ where: { companyUuid: COMPANY } });
  await prisma.researchProject.deleteMany({ where: { companyUuid: COMPANY } });
  await prisma.agent.deleteMany({ where: { companyUuid: COMPANY } });
  await prisma.company.upsert({ where: { uuid: COMPANY }, update: {}, create: { uuid: COMPANY, name: "Activity Test" } });
});

describe("getProjectAgentActivity", () => {
  it("returns empty sections when nothing is active", async () => {
    const p = await prisma.researchProject.create({
      data: { companyUuid: COMPANY, name: "P", createdByUuid: "u" },
    });
    const result = await getProjectAgentActivity({ companyUuid: COMPANY, projectUuid: p.uuid });
    expect(result.experiments).toEqual([]);
    expect(result.relatedWorks).toEqual([]);
  });

  it("returns assigned agents for experiments in live states", async () => {
    const p = await prisma.researchProject.create({
      data: { companyUuid: COMPANY, name: "P", createdByUuid: "u" },
    });
    const agent = await prisma.agent.create({
      data: { uuid: "a-live", companyUuid: COMPANY, name: "Live Agent", type: "openclaw", roles: ["experiment"], color: "violet" },
    });
    await prisma.experiment.create({
      data: {
        companyUuid: COMPANY, researchProjectUuid: p.uuid,
        title: "E-live", status: "in_progress", liveStatus: "running",
        assigneeType: "agent", assigneeUuid: agent.uuid, priority: "medium",
      },
    });
    const result = await getProjectAgentActivity({ companyUuid: COMPANY, projectUuid: p.uuid });
    expect(result.experiments.map((a) => a.uuid)).toEqual([agent.uuid]);
    expect(result.experiments[0].color).toBe("violet");
  });

  it("includes auto-search agent when recent related-work insert exists", async () => {
    const agent = await prisma.agent.create({
      data: { uuid: "a-search", companyUuid: COMPANY, name: "Searcher", type: "openclaw", roles: ["pre_research"], color: "blue" },
    });
    const p = await prisma.researchProject.create({
      data: {
        companyUuid: COMPANY, name: "P2", createdByUuid: "u",
        autoSearchEnabled: true, autoSearchAgentUuid: agent.uuid,
      },
    });
    await prisma.relatedWork.create({
      data: {
        companyUuid: COMPANY, researchProjectUuid: p.uuid,
        title: "Fresh paper", url: "https://example.com/paper",
        source: "manual", addedBy: "agent",
        addedByAgentUuid: agent.uuid,
      },
    });
    const result = await getProjectAgentActivity({ companyUuid: COMPANY, projectUuid: p.uuid });
    expect(result.relatedWorks.map((a) => a.uuid)).toEqual([agent.uuid]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/services/__tests__/agent-activity.service.test.ts'
```
Expected: FAIL — module `@/services/agent-activity.service` does not exist.

- [ ] **Step 3: Implement the service**

Create `src/services/agent-activity.service.ts`:

```ts
import { prisma } from "@/lib/prisma";

const LIVE_EXPERIMENT_STATES = ["sent", "ack", "checking_resources", "queuing", "running"] as const;
const RELATED_WORK_ACTIVITY_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export interface AgentSummary {
  uuid: string;
  name: string;
  color: string | null;
}

export interface AgentActivitySummary {
  relatedWorks: AgentSummary[];
  experiments: AgentSummary[];
  researchQuestions: AgentSummary[];
  insights: AgentSummary[];
  documents: AgentSummary[];
}

const EMPTY_ACTIVITY: AgentActivitySummary = {
  relatedWorks: [],
  experiments: [],
  researchQuestions: [],
  insights: [],
  documents: [],
};

function dedupeAgents(list: AgentSummary[]): AgentSummary[] {
  const seen = new Set<string>();
  const out: AgentSummary[] = [];
  for (const agent of list) {
    if (seen.has(agent.uuid)) continue;
    seen.add(agent.uuid);
    out.push(agent);
  }
  return out;
}

export async function getProjectAgentActivity({
  companyUuid,
  projectUuid,
}: {
  companyUuid: string;
  projectUuid: string;
}): Promise<AgentActivitySummary> {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid },
    select: {
      uuid: true,
      autoSearchEnabled: true,
      autoSearchAgentUuid: true,
    },
  });
  if (!project) return EMPTY_ACTIVITY;

  // Experiments: any live-state experiment → assigned agent
  const liveExperiments = await prisma.experiment.findMany({
    where: {
      companyUuid,
      researchProjectUuid: projectUuid,
      liveStatus: { in: LIVE_EXPERIMENT_STATES as unknown as string[] },
      assigneeType: "agent",
      assigneeUuid: { not: null },
    },
    select: { assigneeUuid: true },
  });
  const experimentAgentUuids = liveExperiments
    .map((e) => e.assigneeUuid)
    .filter((u): u is string => Boolean(u));

  // Related works: auto-search enabled + recent insert by that agent
  const relatedWorksAgentUuids: string[] = [];
  if (project.autoSearchEnabled && project.autoSearchAgentUuid) {
    const since = new Date(Date.now() - RELATED_WORK_ACTIVITY_WINDOW_MS);
    const recent = await prisma.relatedWork.findFirst({
      where: {
        companyUuid,
        researchProjectUuid: projectUuid,
        addedByAgentUuid: project.autoSearchAgentUuid,
        createdAt: { gte: since },
      },
      select: { uuid: true },
    });
    if (recent) {
      relatedWorksAgentUuids.push(project.autoSearchAgentUuid);
    }
  }

  const allAgentUuids = Array.from(new Set([...experimentAgentUuids, ...relatedWorksAgentUuids]));
  if (allAgentUuids.length === 0) return EMPTY_ACTIVITY;

  const agents = await prisma.agent.findMany({
    where: { companyUuid, uuid: { in: allAgentUuids } },
    select: { uuid: true, name: true, color: true },
  });
  const byUuid = new Map(agents.map((a) => [a.uuid, a]));

  const pick = (uuids: string[]): AgentSummary[] =>
    dedupeAgents(
      uuids
        .map((u) => byUuid.get(u))
        .filter((a): a is { uuid: string; name: string; color: string | null } => Boolean(a))
        .map((a) => ({ uuid: a.uuid, name: a.name, color: a.color }))
    );

  return {
    ...EMPTY_ACTIVITY,
    experiments: pick(experimentAgentUuids),
    relatedWorks: pick(relatedWorksAgentUuids),
  };
}
```

Note: `RelatedWork` tracks agent authorship via `addedByAgentUuid` (confirmed against `prisma/schema.prisma`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm vitest run src/services/__tests__/agent-activity.service.test.ts'
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/services/agent-activity.service.ts src/services/__tests__/agent-activity.service.test.ts && git commit -m "Add project agent-activity read model

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 4.2: Expose the read model via API

**Files:**
- Create: `src/app/api/research-projects/[uuid]/agent-activity/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/research-projects/[uuid]/agent-activity/route.ts`:

```ts
import { NextRequest } from "next/server";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getProjectAgentActivity } from "@/services/agent-activity.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can read agent activity");

  const { uuid } = await context.params;
  const activity = await getProjectAgentActivity({
    companyUuid: auth.companyUuid,
    projectUuid: uuid,
  });
  return success(activity);
}
```

- [ ] **Step 2: Smoke-test the route**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm build'
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add "src/app/api/research-projects/[uuid]/agent-activity/" && git commit -m "Add GET /api/research-projects/[uuid]/agent-activity

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 4.3: Add `useAgentActivity` client hook

**Files:**
- Create: `src/hooks/use-agent-activity.ts`

- [ ] **Step 1: Implement the hook**

Create `src/hooks/use-agent-activity.ts`:

```ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRealtimeEvent } from "@/contexts/realtime-context";
import type { AgentActivitySummary, AgentSummary } from "@/services/agent-activity.service";

const EMPTY: AgentActivitySummary = {
  relatedWorks: [],
  experiments: [],
  researchQuestions: [],
  insights: [],
  documents: [],
};

export function useAgentActivity(projectUuid: string | null | undefined): AgentActivitySummary {
  const [state, setState] = useState<AgentActivitySummary>(EMPTY);

  const refetch = useCallback(async () => {
    if (!projectUuid) {
      setState(EMPTY);
      return;
    }
    try {
      const res = await fetch(`/api/research-projects/${projectUuid}/agent-activity`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && json.data) {
        setState(json.data as AgentActivitySummary);
      }
    } catch {
      // network hiccup — keep last state
    }
  }, [projectUuid]);

  // Subscribe to project SSE — fires on mount and on every event
  useRealtimeEvent(() => {
    void refetch();
  });

  // Polling fallback every 15s (SSE usually covers us, but keeps UI fresh if the
  // stream falls behind)
  useEffect(() => {
    if (!projectUuid) return;
    const id = setInterval(() => { void refetch(); }, 15000);
    return () => clearInterval(id);
  }, [projectUuid, refetch]);

  return state;
}

export type { AgentActivitySummary, AgentSummary };
```

- [ ] **Step 2: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/hooks/use-agent-activity.ts && git commit -m "Add useAgentActivity hook

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 4.4: Build `SidebarSectionFrame` component

**Files:**
- Create: `src/components/sidebar-section-frame.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/sidebar-section-frame.tsx`:

```tsx
"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getAgentColor } from "@/lib/agent-colors";
import type { AgentSummary } from "@/services/agent-activity.service";

interface SidebarSectionFrameProps {
  agents: AgentSummary[];
  children: ReactNode;
  className?: string;
}

const MAX_VISIBLE_CHIPS = 2;

export function SidebarSectionFrame({ agents, children, className }: SidebarSectionFrameProps) {
  if (agents.length === 0) {
    return <>{children}</>;
  }

  const visible = agents.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = agents.length - visible.length;
  const tooltip = agents.map((a) => a.name).join(", ");

  return (
    <div className={cn("relative rounded-lg border border-primary/80 px-1.5 py-0.5", className)}>
      <div
        title={tooltip}
        className="absolute -top-2 right-1 flex items-center gap-1"
      >
        {visible.map((agent) => {
          const { primary, light } = getAgentColor(agent.uuid, agent.color);
          return (
            <span
              key={agent.uuid}
              className="truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none max-w-[80px]"
              style={{ backgroundColor: light, color: primary }}
            >
              {agent.name}
            </span>
          );
        })}
        {overflow > 0 && (
          <span
            className="rounded-full px-1 py-0.5 text-[10px] font-medium leading-none"
            style={{ backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
          >
            +{overflow}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/components/sidebar-section-frame.tsx && git commit -m "Add SidebarSectionFrame component

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

### Task 4.5: Wire the frame into the dashboard sidebar

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add imports and data hook**

At the top of `src/app/(dashboard)/layout.tsx`, add:

```tsx
import { SidebarSectionFrame } from "@/components/sidebar-section-frame";
import { useAgentActivity } from "@/hooks/use-agent-activity";
```

Near the other hooks inside the component (e.g. next to `useState(false)` for `projectMenuOpen`), add:

```tsx
  const agentActivity = useAgentActivity(currentProjectUuid);
```

- [ ] **Step 2: Map nav href to activity section**

Below the `projectNavItems` memo, add:

```tsx
  const getActivityAgentsFor = (href: string): AgentSummary[] => {
    if (href.endsWith("/related-works")) return agentActivity.relatedWorks;
    if (href.endsWith("/experiments")) return agentActivity.experiments;
    if (href.endsWith("/research-questions")) return agentActivity.researchQuestions;
    if (href.endsWith("/insights")) return agentActivity.insights;
    if (href.endsWith("/documents")) return agentActivity.documents;
    return [];
  };
```

Add the type import near the other imports:

```tsx
import type { AgentSummary } from "@/services/agent-activity.service";
```

Note: `useAgentActivity` internally calls `useRealtimeEvent`, so it must be rendered **inside** the `RealtimeProvider` tree. The sidebar content is rendered inside `RealtimeProvider` already (line 476), so placing the hook in the layout component is fine only if the layout itself is inside the provider. If the layout wraps `RealtimeProvider` (not inside), move the `useAgentActivity` call into `SidebarContent` instead — `SidebarContent` is rendered inside `RealtimeProvider`. Prefer moving it into `SidebarContent` to keep the provider tree correct.

- [ ] **Step 3: Wrap each project nav item with the frame**

Find the block that renders `projectNavItems.map((item) => ...)` (line ~359). Update the mapper body:

```tsx
                {projectNavItems.map((item) => {
                  const isActive = isNavActive(item.href);
                  const Icon = item.icon;
                  const activityAgents = getActivityAgentsFor(item.href);
                  return (
                    <SidebarSectionFrame key={item.href} agents={activityAgents}>
                      <Link href={item.href} prefetch>
                        <Button
                          variant={isActive ? "secondary" : "ghost"}
                          size="sm"
                          className={`w-full justify-start gap-2.5 ${navTextSize} ${navItemPy} ${
                            isActive
                              ? "font-medium text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon
                            className={`${navIconSize} ${isActive ? "text-primary" : ""}`}
                          />
                          {item.label}
                        </Button>
                      </Link>
                    </SidebarSectionFrame>
                  );
                })}
```

The inner `key` is passed to `SidebarSectionFrame`; remove `key` from `<Link>` to avoid the React duplicate-key warning.

- [ ] **Step 4: Build and lint**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm lint && pnpm build'
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add src/app/\(dashboard\)/layout.tsx && git commit -m "Frame sidebar nav items with active agents

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"'
```

---

## Final — Sync and verify

### Task F.1: Run the full test suite

- [ ] **Step 1: Run all tests**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm test'
```
Expected: all tests pass.

### Task F.2: Sync and verify environments

- [ ] **Step 1: Push the branch**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git push -u origin session/2026-04-17-ui-enhancements'
```

- [ ] **Step 2: Pull on synapse-test**

```bash
ssh synapse-test 'cd /home/ubuntu/Synapse && git fetch && git checkout session/2026-04-17-ui-enhancements && git pull && pnpm install && pnpm db:generate'
```

Expected: branch checked out, deps installed, Prisma client regenerated.

- [ ] **Step 3: Restart dev server on synapse-test**

```bash
ssh synapse-test 'cd /home/ubuntu/Synapse && pkill -f "next dev" || true'
ssh synapse-test 'cd /home/ubuntu/Synapse && nohup pnpm dev -H 0.0.0.0 -p 3000 > /tmp/synapse-dev.log 2>&1 &'
```

Wait 10 seconds, then verify the app responds:

```bash
ssh synapse-test 'curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health'
```
Expected: `200`.

- [ ] **Step 4: Sync to local**

```bash
git fetch && git checkout session/2026-04-17-ui-enhancements && git reset --hard origin/session/2026-04-17-ui-enhancements
```

- [ ] **Step 5: Manual smoke walkthrough**

Open `http://<synapse-test>:3000` in a browser. Verify:

1. Notification bell → card background is white on light theme, near-black on dark theme.
2. Experiments board → "Return to draft" on a pending-review experiment opens the new dialog. Submitting with an agent selected and feedback text creates a comment + notification. Submitting with "No agent" only flips to draft.
3. Agents page → create a new agent. Color picker is present. Selecting a color persists and appears on the agent row. Edit agent → color is preselected and can be changed.
4. Sidebar → when an experiment enters `running`, the "Experiments" nav item gets the terracotta frame with the assigned agent chip in the top-right.

---

## Self-Review

### Spec coverage

- Feature 1 (theme-aware notification card): Task 1.1 ✓
- Feature 2 (revert dialog w/ feedback + reassignment): Tasks 2.1 (service+API), 2.2 (UI), 2.3 (plugin) ✓
- Feature 3 (agent color picker):
  - Palette module: 3.1 ✓
  - Schema + migration: 3.2 ✓
  - Service + actions + REST: 3.3 ✓
  - Picker component: 3.4 ✓
  - Wiring into forms: 3.5 ✓
  - Presence indicator uses color: 3.6 ✓
- Feature 4 (sidebar agent activity):
  - Read model service: 4.1 ✓
  - API route: 4.2 ✓
  - Client hook + SSE: 4.3 ✓
  - Frame component: 4.4 ✓
  - Sidebar wiring: 4.5 ✓
- Environment sync + tests: F.1, F.2 ✓

### Placeholder scan

None — all tasks include the exact code to write, file paths, and commands.

### Type consistency

- `AgentSummary` is exported from `src/services/agent-activity.service.ts` and imported wherever needed (Tasks 4.1, 4.3, 4.4, 4.5).
- `AgentActivitySummary` is consistent across service + hook + UI.
- `AgentColorEntry` and `AGENT_COLOR_KEYS` exports in 3.1 match the imports in 3.4, 3.5, 3.6, 4.4.
- `reviewExperiment` signature extended identically in 2.1 service, 2.1 route schema, 2.2 dialog `onSubmit`.
- `isValidAgentColorKey` usage consistent across 3.3 (actions + REST).

### Schema facts (verified against `prisma/schema.prisma`)

- `Comment` uses `authorType` and `authorUuid` (not `actorType`/`actorUuid`) and has no `researchProjectUuid` column.
- `RelatedWork` tracks agent authorship via `addedByAgentUuid` (plus the required string fields `url`, `source`, `addedBy`).
- `Agent.color` is a new column added by this plan's migration in Task 3.2.

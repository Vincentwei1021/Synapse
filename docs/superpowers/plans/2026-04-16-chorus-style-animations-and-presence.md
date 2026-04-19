# Chorus-Style Animations & Presence System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add framer-motion card transition animations, an automatic presence system, typing GIF overlay, and agent name badges to the Synapse experiment board — matching Chorus's UX.

**Architecture:** Four layers: (1) shared animation constants (`src/lib/animation.ts`), (2) backend presence emission via MCP tool interception + SSE broadcast, (3) frontend presence store + indicator component, (4) experiment board integration with framer-motion `LayoutGroup`/`layoutId` for card column transitions.

**Tech Stack:** framer-motion, CSS @keyframes, useSyncExternalStore, SSE EventSource, existing EventBus

---

### Task 1: Install framer-motion and create `src/lib/animation.ts`

**Files:**
- Create: `src/lib/animation.ts`
- Modify: `package.json` (via pnpm add)

- [ ] **Step 1: Install framer-motion**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm add framer-motion
```

- [ ] **Step 2: Create `src/lib/animation.ts`**

```ts
import type { Variants, Transition } from "framer-motion";

// Shared animation constants for Synapse UI
// Style: fast & snappy (150-200ms), suitable for productivity tools

export const ANIM = {
  // Durations (seconds)
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,

  // Easing curves
  easeOut: [0, 0, 0.2, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,

  // Stagger delay between list items (seconds)
  stagger: 0.04,

  // Common transition presets
  spring: { type: "spring", stiffness: 500, damping: 30 } satisfies Transition,
  tween: { type: "tween", duration: 0.2, ease: [0, 0, 0.2, 1] } satisfies Transition,
} as const;

// --- Reusable Variants ---

export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: ANIM.normal, ease: ANIM.easeOut } },
  exit: { opacity: 0, y: -4, transition: { duration: ANIM.fast, ease: ANIM.easeOut } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: ANIM.normal, ease: ANIM.easeOut } },
  exit: { opacity: 0, transition: { duration: ANIM.fast, ease: ANIM.easeOut } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: ANIM.normal, ease: ANIM.easeOut } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: ANIM.fast, ease: ANIM.easeOut } },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: ANIM.stagger,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: ANIM.normal, ease: ANIM.easeOut } },
};

export const dropdownVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: ANIM.fast, ease: ANIM.easeOut } },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: ANIM.fast, ease: ANIM.easeOut } },
};
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/lib/animation.ts 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/animation.ts package.json pnpm-lock.yaml
git commit -m "feat: add framer-motion + shared animation constants"
```

---

### Task 2: Backend presence — extend EventBus + SSE for presence events

**Files:**
- Modify: `src/lib/event-bus.ts` (add `emitPresence` + `PresenceEvent` type)
- Modify: `src/app/api/events/route.ts` (broadcast presence events via SSE)
- Modify: `src/contexts/realtime-context.tsx` (add presence subscription hook)

- [ ] **Step 1: Add `PresenceEvent` type and `emitPresence` to event-bus**

In `src/lib/event-bus.ts`, add after the `RealtimeEvent` interface (line 15):

```ts
export interface PresenceEvent {
  type: "presence";
  companyUuid: string;
  researchProjectUuid: string;
  entityType: "experiment" | "research_question" | "document" | "related_work";
  entityUuid: string;
  agentUuid: string;
  agentName: string;
  action: "view" | "mutate";
  timestamp: number;
}
```

In the `SynapseEventBus` class, add after `emitChange` (line 96):

```ts
  emitPresence(event: PresenceEvent) {
    this.emit("presence", event);
  }
```

- [ ] **Step 2: Broadcast presence events in SSE endpoint**

In `src/app/api/events/route.ts`, add a second listener after the `change` handler (after line 44):

```ts
      // Subscribe to presence events
      const presenceHandler = (event: PresenceEvent) => {
        if (event.companyUuid !== auth.companyUuid) return;
        if (researchProjectUuid && event.researchProjectUuid !== researchProjectUuid) return;
        send(`event: presence\ndata: ${JSON.stringify(event)}\n\n`);
      };

      eventBus.on("presence", presenceHandler);
```

Update the import to include `PresenceEvent`:

```ts
import { ensureEventBusConnected, eventBus, type RealtimeEvent, type PresenceEvent } from "@/lib/event-bus";
```

Update the abort cleanup (around line 54) to also remove the presence handler:

```ts
      request.signal.addEventListener("abort", () => {
        eventBus.off("change", handler);
        eventBus.off("presence", presenceHandler);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
```

- [ ] **Step 3: Add presence subscription to RealtimeContext**

In `src/contexts/realtime-context.tsx`, add a `PresenceEvent` type and subscription mechanism.

Add after the existing `RealtimeEvent` interface (after line 23):

```ts
export interface PresenceEvent {
  type: "presence";
  companyUuid: string;
  researchProjectUuid: string;
  entityType: string;
  entityUuid: string;
  agentUuid: string;
  agentName: string;
  action: "view" | "mutate";
  timestamp: number;
}

type PresenceSubscriber = (event: PresenceEvent) => void;
```

Add `presenceSubscribersRef` in `RealtimeProvider` (after line 41):

```ts
  const presenceSubscribersRef = useRef<Set<PresenceSubscriber>>(new Set());
```

Add `notifyPresence` callback (after line 48):

```ts
  const notifyPresence = useCallback((event: PresenceEvent) => {
    presenceSubscribersRef.current.forEach((cb) => cb(event));
  }, []);
```

In the `es.onmessage` handler, add detection for the `presence` SSE event type. Replace `es.onmessage` with a dedicated handler for `presence`:

After `connect()` creates the EventSource (after line 62), add:

```ts
      es.addEventListener("presence", (msg) => {
        try {
          const event: PresenceEvent = JSON.parse(msg.data);
          notifyPresence(event);
        } catch {
          // ignore
        }
      });
```

Add `subscribePresence` callback (after `subscribeEntity`):

```ts
  const subscribePresence = useCallback((callback: PresenceSubscriber) => {
    presenceSubscribersRef.current.add(callback);
    return () => {
      presenceSubscribersRef.current.delete(callback);
    };
  }, []);
```

Update the context value and type:

```ts
// In RealtimeContextType interface:
  subscribePresence: (callback: PresenceSubscriber) => () => void;

// In contextValue:
  const contextValue = useMemo(
    () => ({ subscribe, subscribeEntity, subscribePresence }),
    [subscribe, subscribeEntity, subscribePresence]
  );
```

Add export hook at the end of the file:

```ts
/**
 * Subscribe to presence events from the SSE stream.
 * Fires immediately when a presence event arrives (no throttle/debounce).
 */
export function usePresenceSubscription(callback: (event: PresenceEvent) => void) {
  const context = useContext(RealtimeContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!context) return;
    const handler = (event: PresenceEvent) => callbackRef.current(event);
    return context.subscribePresence(handler);
  }, [context]);
}
```

- [ ] **Step 4: Verify types compile**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/lib/event-bus.ts src/app/api/events/route.ts src/contexts/realtime-context.tsx 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/event-bus.ts src/app/api/events/route.ts src/contexts/realtime-context.tsx
git commit -m "feat: add presence event to EventBus + SSE + RealtimeContext"
```

---

### Task 3: MCP presence interception — auto-detect from tool calls

**Files:**
- Create: `src/mcp/tools/presence.ts`
- Modify: `src/mcp/server.ts` (call `enablePresence` before tool registration)

- [ ] **Step 1: Create `src/mcp/tools/presence.ts`**

```ts
// src/mcp/tools/presence.ts
// MCP tool handler wrapper for automatic presence event emission.
// Wraps registerTool to detect target resources and emit presence events.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eventBus, type PresenceEvent } from "@/lib/event-bus";
import type { AgentAuthContext } from "@/types/auth";
import { prisma } from "@/lib/prisma";

// Entity types that presence events support
const ENTITY_UUID_FIELDS: Record<string, PresenceEvent["entityType"]> = {
  experimentUuid: "experiment",
  researchQuestionUuid: "research_question",
  documentUuid: "document",
};

// Polymorphic targetType values
const TARGET_TYPE_MAP: Record<string, PresenceEvent["entityType"]> = {
  experiment: "experiment",
  research_question: "research_question",
  document: "document",
};

// Tool name prefixes that indicate "view" action
const VIEW_PREFIXES = ["synapse_get_", "synapse_list_", "synapse_search"];

function classifyAction(toolName: string): "view" | "mutate" {
  return VIEW_PREFIXES.some((p) => toolName.startsWith(p)) ? "view" : "mutate";
}

interface DetectedResource {
  entityType: PresenceEvent["entityType"];
  entityUuid: string;
  researchProjectUuid?: string;
}

function detectResource(params: Record<string, unknown>): DetectedResource | null {
  // Check entity-specific UUID fields
  for (const [field, entityType] of Object.entries(ENTITY_UUID_FIELDS)) {
    if (typeof params[field] === "string") {
      return {
        entityType,
        entityUuid: params[field] as string,
        researchProjectUuid: typeof params.researchProjectUuid === "string" ? params.researchProjectUuid : undefined,
      };
    }
  }

  // Check polymorphic targetUuid + targetType pattern
  if (typeof params.targetUuid === "string" && typeof params.targetType === "string") {
    const entityType = TARGET_TYPE_MAP[params.targetType];
    if (entityType) {
      return {
        entityType,
        entityUuid: params.targetUuid as string,
        researchProjectUuid: typeof params.researchProjectUuid === "string" ? params.researchProjectUuid : undefined,
      };
    }
  }

  return null;
}

// Resolve researchProjectUuid from an entity UUID via DB lookup
async function resolveProjectUuid(
  entityType: PresenceEvent["entityType"],
  entityUuid: string,
  cache: Map<string, string>
): Promise<string | null> {
  const cacheKey = `${entityType}:${entityUuid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    let projectUuid: string | null = null;

    switch (entityType) {
      case "experiment": {
        const exp = await prisma.experiment.findFirst({
          where: { uuid: entityUuid },
          select: { researchProject: { select: { uuid: true } } },
        });
        projectUuid = exp?.researchProject?.uuid ?? null;
        break;
      }
      case "research_question": {
        const rq = await prisma.researchQuestion.findFirst({
          where: { uuid: entityUuid },
          select: { researchProject: { select: { uuid: true } } },
        });
        projectUuid = rq?.researchProject?.uuid ?? null;
        break;
      }
      case "document": {
        const doc = await prisma.document.findFirst({
          where: { uuid: entityUuid },
          select: { researchProject: { select: { uuid: true } } },
        });
        projectUuid = doc?.researchProject?.uuid ?? null;
        break;
      }
    }

    if (projectUuid) {
      cache.set(cacheKey, projectUuid);
    }
    return projectUuid;
  } catch (err) {
    console.warn("[Presence] Failed to resolve projectUuid:", err);
    return null;
  }
}

/** Fire-and-forget presence emission — never blocks the tool handler */
async function emitPresenceAsync(
  resource: DetectedResource,
  toolName: string,
  auth: AgentAuthContext,
  cache: Map<string, string>
): Promise<void> {
  try {
    let researchProjectUuid = resource.researchProjectUuid;
    if (!researchProjectUuid) {
      researchProjectUuid = (await resolveProjectUuid(
        resource.entityType,
        resource.entityUuid,
        cache
      )) ?? undefined;
    }

    if (researchProjectUuid) {
      const presenceEvent: PresenceEvent = {
        type: "presence",
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        entityType: resource.entityType,
        entityUuid: resource.entityUuid,
        agentUuid: auth.actorUuid,
        agentName: auth.agentName,
        action: classifyAction(toolName),
        timestamp: Date.now(),
      };
      eventBus.emitPresence(presenceEvent);
    }
  } catch (err) {
    console.warn("[Presence] Failed to emit presence event:", err);
  }
}

/**
 * Wraps a McpServer to automatically emit presence events for all registered tools.
 * Call this once after creating the server, before registering tools.
 */
export function enablePresence(server: McpServer, auth: AgentAuthContext): void {
  const projectUuidCache = new Map<string, string>();

  const originalRegisterTool = server.registerTool.bind(server);

  server.registerTool = function (name: string, config: unknown, handler: unknown) {
    const originalHandler = handler as (params: Record<string, unknown>, extra: unknown) => Promise<unknown>;

    const wrappedHandler = async (params: Record<string, unknown>, extra: unknown) => {
      const resource = detectResource(params);
      if (resource) {
        emitPresenceAsync(resource, name, auth, projectUuidCache);
      }
      return originalHandler(params, extra);
    };

    return originalRegisterTool(
      name,
      config as Parameters<typeof originalRegisterTool>[1],
      wrappedHandler as Parameters<typeof originalRegisterTool>[2]
    );
  } as typeof server.registerTool;
}

// Exported for testing
export { detectResource, classifyAction, resolveProjectUuid };
```

- [ ] **Step 2: Wire `enablePresence` into MCP server creation**

In `src/mcp/server.ts`, add import and call `enablePresence` before tool registration:

Add import after line 11:
```ts
import { enablePresence } from "./tools/presence";
```

Add call after `const hasRole` (after line 20), before tool registration:
```ts
  // Wrap registerTool to auto-emit presence events for all tools
  enablePresence(server, auth);
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/mcp/tools/presence.ts src/mcp/server.ts 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/presence.ts src/mcp/server.ts
git commit -m "feat: auto-emit presence events from MCP tool calls"
```

---

### Task 4: Frontend presence hook — `usePresence` with 3s TTL store

**Files:**
- Create: `src/hooks/use-presence.ts`

- [ ] **Step 1: Create `src/hooks/use-presence.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";
import { usePresenceSubscription, type PresenceEvent } from "@/contexts/realtime-context";

export interface PresenceEntry {
  agentUuid: string;
  agentName: string;
  action: "view" | "mutate";
  timestamp: number;
}

const PRESENCE_DURATION_MS = 3000;

// Module-level presence store — shared across all hook instances
const presenceMap = new Map<string, PresenceEntry[]>();
const dedupMap = new Map<string, number>();
const timers = new Map<string, NodeJS.Timeout>();
let storeListeners = new Set<() => void>();
let version = 0;

function presenceKey(entityType: string, entityUuid: string): string {
  return `${entityType}:${entityUuid}`;
}

function dedupKeyFor(entityType: string, entityUuid: string, agentUuid: string): string {
  return `${entityType}:${entityUuid}:${agentUuid}`;
}

function notifyListeners() {
  version++;
  storeListeners.forEach((l) => l());
}

function addPresence(event: PresenceEvent) {
  const pKey = presenceKey(event.entityType, event.entityUuid);
  const dKey = dedupKeyFor(event.entityType, event.entityUuid, event.agentUuid);

  // Frontend dedup: same agent+entity within 3s
  const lastTime = dedupMap.get(dKey);
  if (lastTime && Date.now() - lastTime < PRESENCE_DURATION_MS) {
    return;
  }
  dedupMap.set(dKey, Date.now());

  const entry: PresenceEntry = {
    agentUuid: event.agentUuid,
    agentName: event.agentName,
    action: event.action,
    timestamp: Date.now(),
  };

  // Add/replace entry for this agent on this entity
  const entries = presenceMap.get(pKey) ?? [];
  const filtered = entries.filter((e) => e.agentUuid !== event.agentUuid);
  filtered.push(entry);
  presenceMap.set(pKey, filtered);

  // Clear previous timer for this agent+entity
  const existingTimer = timers.get(dKey);
  if (existingTimer) clearTimeout(existingTimer);

  // Auto-clear after 3 seconds
  const timer = setTimeout(() => {
    const current = presenceMap.get(pKey);
    if (current) {
      const remaining = current.filter((e) => e.agentUuid !== event.agentUuid);
      if (remaining.length === 0) {
        presenceMap.delete(pKey);
      } else {
        presenceMap.set(pKey, remaining);
      }
    }
    dedupMap.delete(dKey);
    timers.delete(dKey);
    notifyListeners();
  }, PRESENCE_DURATION_MS);
  timers.set(dKey, timer);

  notifyListeners();
}

function getSnapshot(): number {
  return version;
}

function subscribeStore(callback: () => void): () => void {
  storeListeners.add(callback);
  return () => {
    storeListeners.delete(callback);
  };
}

/**
 * Hook to subscribe to agent presence events.
 * Returns getPresence to query active presences for a resource.
 */
export function usePresence() {
  useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
  usePresenceSubscription(addPresence);

  const getPresence = (entityType: string, entityUuid: string): PresenceEntry[] => {
    return presenceMap.get(presenceKey(entityType, entityUuid)) ?? [];
  };

  return { getPresence };
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/hooks/use-presence.ts 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-presence.ts
git commit -m "feat: add usePresence hook with 3s TTL presence store"
```

---

### Task 5: PresenceIndicator component — badges + outline

**Files:**
- Create: `src/components/ui/presence-indicator.tsx`

- [ ] **Step 1: Create `src/components/ui/presence-indicator.tsx`**

```tsx
"use client";

import { usePresence, type PresenceEntry } from "@/hooks/use-presence";
import { getAgentColor } from "@/lib/agent-colors";
import { Bot } from "lucide-react";

interface PresenceIndicatorProps {
  entityType: string;
  entityUuid: string;
  children: React.ReactNode;
}

export function PresenceIndicator({ entityType, entityUuid, children }: PresenceIndicatorProps) {
  const { getPresence } = usePresence();
  const entries = getPresence(entityType, entityUuid);

  const hasPresence = entries.length > 0;
  const hasMutate = hasPresence && entries.some((e) => e.action === "mutate");
  const borderStyle = hasMutate ? "solid" : "dashed";

  const primary = hasPresence
    ? (hasMutate ? entries.find((e) => e.action === "mutate")! : entries[entries.length - 1])
    : null;
  const borderColor = primary ? getAgentColor(primary.agentUuid).primary : "transparent";

  return (
    <div
      className="relative"
      style={hasPresence ? {
        outline: `2px ${borderStyle} ${borderColor}`,
        outlineOffset: "-2px",
        borderRadius: "var(--radius)",
      } : undefined}
    >
      {/* Agent badges */}
      {hasPresence && (
        <div className="absolute -top-2.5 right-2 z-10 flex max-w-[80%] justify-end gap-1">
          {entries.slice(0, 3).map((entry) => (
            <AgentBadge key={entry.agentUuid} entry={entry} />
          ))}
          {entries.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-gray-500 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap">
              +{entries.length - 3}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function AgentBadge({ entry }: { entry: PresenceEntry }) {
  const color = getAgentColor(entry.agentUuid);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap animate-in fade-in duration-300 ease-out sm:text-[11px] sm:px-2"
      style={{ backgroundColor: color.primary }}
    >
      <Bot className="h-2.5 w-2.5" />
      {entry.agentName}
    </span>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/components/ui/presence-indicator.tsx 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/presence-indicator.tsx
git commit -m "feat: add PresenceIndicator component with agent badges"
```

---

### Task 6: Integrate everything into experiments board

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`

This is the big integration task. We add:
1. framer-motion `LayoutGroup` + `motion.div` with `layoutId` for card column transitions
2. `PresenceIndicator` wrapping each card
3. Typing GIF overlay when `liveStatus` is active

- [ ] **Step 1: Update imports at top of experiments-board.tsx**

Replace the existing imports (lines 1-19) with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGroup, motion } from "framer-motion";
import { CheckCircle2, ChevronRight, CornerUpLeft, FileText, GitBranch, Loader2, PenLine, Save, Send, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PresenceIndicator } from "@/components/ui/presence-indicator";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import { MarkdownContent } from "@/components/markdown-content";
import { GlowBorder } from "@/components/glow-border";
import { getAgentColor } from "@/lib/agent-colors";
import { ANIM } from "@/lib/animation";
import type { ExperimentResponse } from "@/services/experiment.service";
```

- [ ] **Step 2: Wrap the board grid in LayoutGroup and cards in motion.div**

Replace the board rendering section (lines 610-689) — from `<div className="pb-4">` through its closing `</div>`:

```tsx
      <div className="pb-4">
        <LayoutGroup>
        <div className="grid gap-3 xl:grid-cols-5">
          {columns.map((column) => (
            <section
              key={column.id}
              className="flex min-h-[calc(100vh-250px)] min-w-0 flex-col rounded-[28px] border border-border bg-secondary/50 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-foreground">{t(`experiments.columns.${column.labelKey}`)}</h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {grouped[column.id].length}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3">
                {grouped[column.id].length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("experiments.empty")}
                  </div>
                ) : (
                  grouped[column.id].map((experiment) => (
                    <motion.div
                      key={experiment.uuid}
                      layoutId={`experiment-card-${experiment.uuid}`}
                      transition={ANIM.spring}
                    >
                    <PresenceIndicator entityType="experiment" entityUuid={experiment.uuid}>
                    <GlowBorder
                      active={!!experiment.liveStatus}
                      primaryColor={getAgentColor(experiment.assignee?.uuid ?? "").primary}
                      lightColor={getAgentColor(experiment.assignee?.uuid ?? "").light}
                    >
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); };
                        }
                      }}
                      className="relative space-y-3 rounded-2xl border-border bg-card p-3.5 text-left shadow-none transition-colors hover:border-primary/30"
                    >
                      {/* Typing animation GIF — shown when agent is actively working */}
                      {experiment.liveStatus && (
                        <div className="absolute -top-3 -right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 border-green-400 bg-white shadow-sm dark:bg-gray-900">
                          <img src="/typing-animation.gif" alt="" className="h-8 w-8" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{experiment.title}</h3>
                          <Badge variant="outline" className={priorityBadgeClasses(experiment.priority)}>
                            {formatPriorityLabel(t, experiment.priority)}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>
                          {t("experiments.card.assignee")}:{" "}
                          {experiment.assignee?.name || t("experiments.card.unassigned")}
                        </p>
                        {experiment.outcome ? (
                          <p className="line-clamp-2">
                            {t("experiments.card.outcome")}: {experiment.outcome}
                          </p>
                        ) : null}
                      </div>

                      {experiment.liveStatus ? (
                        <div className="flex items-center gap-2">
                          {liveStatusBadge(t, experiment.liveStatus)}
                          {experiment.liveMessage ? (
                            <span className="truncate text-[11px] text-muted-foreground">{experiment.liveMessage}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {renderActionBlock(experiment)}
                    </Card>
                    </GlowBorder>
                    </PresenceIndicator>
                    </motion.div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
        </LayoutGroup>
      </div>
```

Key changes vs the original:
- `<LayoutGroup>` wraps the entire grid
- Each card gets `<motion.div layoutId={...} transition={ANIM.spring}>` for animated column transitions
- `<PresenceIndicator>` wraps each card (outside GlowBorder, so badge appears above glow)
- Card gets `className="relative ..."` for typing GIF positioning
- Typing GIF `<div>` is conditionally rendered when `experiment.liveStatus` is truthy

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/app/\(dashboard\)/research-projects/\[uuid\]/experiments/experiments-board.tsx 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Visual verification**

Start the dev server and verify:
1. Cards animate smoothly between columns when status changes (spring physics)
2. When an agent calls MCP tools on an experiment, presence badges appear above the card and auto-fade after 3s
3. Typing GIF appears on cards with an active `liveStatus`
4. GlowBorder still works as before on active cards
5. No layout shifts or flickering

```bash
cd /Users/weiyihao/personal/Synapse && pnpm dev
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/research-projects/\[uuid\]/experiments/experiments-board.tsx
git commit -m "feat: integrate framer-motion layout animations, presence indicators, and typing GIF into experiment board"
```

---

### Task 7: Add i18n keys for presence (if needed in future)

No i18n keys are needed for this implementation — the agent name badge displays `agentName` directly from the presence event, and the typing GIF has no text. The `liveStatus` keys already exist. Skip this task.

---

## File Summary

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/lib/animation.ts` | Shared animation constants (spring, tween, variants) |
| Create | `src/mcp/tools/presence.ts` | MCP tool wrapper — auto-emit presence events |
| Create | `src/hooks/use-presence.ts` | Frontend presence store with 3s TTL |
| Create | `src/components/ui/presence-indicator.tsx` | Agent badge + outline component |
| Modify | `package.json` | Add framer-motion dependency |
| Modify | `src/lib/event-bus.ts` | Add `PresenceEvent` type + `emitPresence()` |
| Modify | `src/app/api/events/route.ts` | Broadcast presence on SSE `presence` event |
| Modify | `src/contexts/realtime-context.tsx` | Add presence subscription hook |
| Modify | `src/mcp/server.ts` | Call `enablePresence()` before tool registration |
| Modify | `experiments-board.tsx` | LayoutGroup, motion.div, PresenceIndicator, typing GIF |

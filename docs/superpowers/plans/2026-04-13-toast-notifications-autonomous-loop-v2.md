# Toast Notifications & Autonomous Loop v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add toast popup notifications for key research events, fix the deep research placeholder, fix autonomous loop triggering, and add a fully autonomous Mode 2 (Karpathy-style).

**Architecture:** Custom toast system (no library) with Spring Pop CSS animation, integrated via the existing SSE notification stream. Autonomous loop gets a new `autonomousLoopMode` schema field, mode-aware trigger conditions, and a dropdown action menu UI replacing the toggle switch.

**Tech Stack:** React 19, Tailwind CSS 4, Prisma 7, Next.js 15 App Router, next-intl

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/contexts/toast-context.tsx` | ToastProvider, useToast hook, toast queue/state management |
| Create | `src/components/toast-container.tsx` | Renders toast cards with Spring Pop CSS animation |
| Modify | `src/app/(dashboard)/layout.tsx` | Wrap dashboard layout with ToastProvider |
| Modify | `src/contexts/notification-context.tsx` | Trigger toasts when SSE notification events arrive |
| Modify | `messages/en.json` | Split promptPlaceholder into search/deepResearch variants, add toast i18n keys |
| Modify | `messages/zh.json` | Same split for Chinese locale |
| Modify | `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx` | Conditional placeholder based on dialog mode |
| Modify | `prisma/schema.prisma` | Add `autonomousLoopMode` to ResearchProject |
| Modify | `src/services/experiment.service.ts` | Extract `checkAutonomousLoopTrigger()`, add trigger points, mode-aware conditions |
| Modify | `src/app/api/research-projects/[uuid]/route.ts` | Accept `autonomousLoopMode`, trigger on enable |
| Modify | `src/mcp/tools/compute.ts` | Update `synapse_propose_experiment` for Mode 2 status/assignment |
| Modify | `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx` | Replace toggle with dropdown action menu |
| Modify | `src/services/notification.service.ts` | Add new notification preference fields |
| Modify | `src/services/notification-listener.ts` | Map new notification actions to types |
| Modify | `src/components/notification-preferences-form.tsx` | Add new preference toggles |

---

### Task 1: Deep Research Placeholder Fix

**Files:**
- Modify: `messages/en.json:171`
- Modify: `messages/zh.json:171`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx:589`

- [ ] **Step 1: Split the placeholder key in en.json**

In `messages/en.json`, find the `RelatedWorks` section. Replace the single `promptPlaceholder` with two keys:

```json
"searchPromptPlaceholder": "e.g. Focus on papers from 2023-2024 about transformer architectures...",
"deepResearchPromptPlaceholder": "e.g. Analyze recent advances in RLHF, compare PPO vs DPO approaches, and identify open problems...",
```

Remove the old `"promptPlaceholder"` line.

- [ ] **Step 2: Split the placeholder key in zh.json**

In `messages/zh.json`, same section. Replace:

```json
"searchPromptPlaceholder": "例如：重点搜索 2023-2024 年关于 transformer 架构的论文...",
"deepResearchPromptPlaceholder": "例如：分析 RLHF 的最新进展，比较 PPO 与 DPO 方法，并识别开放性问题...",
```

Remove the old `"promptPlaceholder"` line.

- [ ] **Step 3: Update the placeholder reference in related-works-client.tsx**

At line 589, change:
```tsx
placeholder={t("promptPlaceholder")}
```
to:
```tsx
placeholder={promptDialogOpen === "deepResearch" ? t("deepResearchPromptPlaceholder") : t("searchPromptPlaceholder")}
```

- [ ] **Step 4: Verify no other references to the old key**

Run: `grep -r "promptPlaceholder" src/ messages/`

Expected: Only the two new keys in message files. No remaining references to the old single key.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/zh.json src/app/\(dashboard\)/research-projects/\[uuid\]/related-works/related-works-client.tsx
git commit -m "fix: split placeholder text for search vs deep research dialogs"
```

---

### Task 2: Toast Context and Container

**Files:**
- Create: `src/contexts/toast-context.tsx`
- Create: `src/components/toast-container.tsx`

- [ ] **Step 1: Create toast-context.tsx**

Create `src/contexts/toast-context.tsx`:

```tsx
"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

export interface Toast {
  id: string;
  category: string;
  color: string;
  message: string;
  createdAt: number;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_VISIBLE = 3;
const DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const queueRef = useRef<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setExiting((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Wait for exit animation to finish before removing from DOM
    setTimeout(() => {
      setToasts((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        // Promote from queue if there's room
        if (queueRef.current.length > 0 && remaining.length < MAX_VISIBLE) {
          const next = queueRef.current.shift()!;
          return [...remaining, next];
        }
        return remaining;
      });
      setExiting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300); // exit animation duration
  }, []);

  const addToast = useCallback(
    (input: Omit<Toast, "id" | "createdAt">) => {
      const toast: Toast = {
        ...input,
        id: `toast-${++counterRef.current}`,
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        if (prev.length >= MAX_VISIBLE) {
          queueRef.current.push(toast);
          return prev;
        }
        return [...prev, toast];
      });

      // Auto-dismiss
      setTimeout(() => removeToast(toast.id), DISMISS_MS);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} exiting={exiting} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// Inline ToastContainer to keep it in the same file as context for tight coupling
function ToastContainer({
  toasts,
  exiting,
  onDismiss,
}: {
  toasts: Toast[];
  exiting: Set<string>;
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
          className={`pointer-events-auto cursor-pointer rounded-xl border border-border/40 bg-card/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-black/20 max-w-xs min-w-[280px] transition-transform ${
            exiting.has(toast.id) ? "animate-toast-exit" : "animate-toast-enter"
          }`}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: toast.color }}
            />
            <span
              className="text-[11px] font-semibold"
              style={{ color: toast.color }}
            >
              {toast.category}
            </span>
          </div>
          <p className="text-[13px] text-foreground/80 leading-snug">
            {toast.message}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add Spring Pop keyframes to Tailwind config**

In `src/app/globals.css` (or the appropriate Tailwind CSS file), add inside the `@layer utilities` or `@theme` block:

```css
@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes toast-exit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(10px) scale(0.95);
  }
}
```

Also add the animation utility classes. If using Tailwind v4 with `@theme`, add:

```css
@utility animate-toast-enter {
  animation: toast-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@utility animate-toast-exit {
  animation: toast-exit 0.3s cubic-bezier(0.55, 0, 1, 0.45) forwards;
}
```

If Tailwind v4 uses a different approach for custom animations in this codebase, check the existing globals.css for patterns and follow them.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/toast-context.tsx src/app/globals.css
git commit -m "feat: add toast notification context with Spring Pop animation"
```

---

### Task 3: Integrate Toast with SSE Notifications

**Files:**
- Modify: `src/contexts/notification-context.tsx:54-107`
- Modify: `src/app/(dashboard)/layout.tsx:443-481`

- [ ] **Step 1: Add toast mapping to notification-context.tsx**

At the top of `src/contexts/notification-context.tsx`, add imports and a mapping constant:

```tsx
import { useToast } from "@/contexts/toast-context";
```

Add the action-to-toast category/color mapping after the interface definition:

```tsx
const TOAST_MAP: Record<string, { category: string; color: string }> = {
  // Paper search
  auto_search_started: { category: "Search", color: "#3b82f6" },
  auto_search_completed: { category: "Search", color: "#3b82f6" },
  auto_search_failed: { category: "Search", color: "#ef4444" },
  // Deep research
  deep_research_requested: { category: "Research", color: "#a855f7" },
  deep_research_completed: { category: "Research", color: "#a855f7" },
  deep_research_failed: { category: "Research", color: "#ef4444" },
  // Experiment
  experiment_status_changed: { category: "Experiment", color: "#818cf8" },
  experiment_progress: { category: "Experiment", color: "#818cf8" },
  experiment_completed: { category: "Experiment", color: "#818cf8" },
  // Autonomous loop
  autonomous_loop_triggered: { category: "Loop", color: "#f59e0b" },
  experiment_auto_proposed: { category: "Loop", color: "#22c55e" },
  synthesis_updated: { category: "Loop", color: "#06b6d4" },
};
```

- [ ] **Step 2: Fire toasts from SSE event handler**

Inside the `NotificationProvider` component, use the toast hook:

```tsx
const { addToast } = useToast();
```

In the SSE `onmessage` handler (around line 72 where `data` is parsed), after the existing unread count update, add:

```tsx
if (data.type === "new_notification" && data.action && data.message) {
  const toastConfig = TOAST_MAP[data.action];
  if (toastConfig) {
    addToast({
      category: toastConfig.category,
      color: toastConfig.color,
      message: data.message,
    });
  }
}
```

- [ ] **Step 3: Ensure SSE events include action and message**

Check `src/app/api/events/notifications/route.ts`. The SSE event emitted by `notification.service.ts` at line 172 should include `action` and `message` in the payload. If the current SSE payload only includes `type` and `unreadCount`, update `notification.service.ts` line 172-176 to also include:

```typescript
eventBus.emit(`notification:${notification.recipientType}:${notification.recipientUuid}`, {
  type: "new_notification",
  notificationUuid: notification.uuid,
  action: notification.action,
  message: notification.message,
  unreadCount: count,
});
```

And update the SSE route to pass `action` and `message` through in the `data` field.

- [ ] **Step 4: Wrap layout with ToastProvider**

In `src/app/(dashboard)/layout.tsx`, add import:

```tsx
import { ToastProvider } from "@/contexts/toast-context";
```

Wrap the return (around line 443). `ToastProvider` must be outside `NotificationProvider` so `NotificationProvider` can use `useToast()`:

```tsx
return (
  <ToastProvider>
    <NotificationProvider>
      {/* ...existing layout content... */}
    </NotificationProvider>
  </ToastProvider>
);
```

- [ ] **Step 5: Commit**

```bash
git add src/contexts/notification-context.tsx src/contexts/toast-context.tsx src/app/\(dashboard\)/layout.tsx src/app/api/events/notifications/route.ts src/services/notification.service.ts
git commit -m "feat: integrate toast notifications with SSE event stream"
```

---

### Task 4: Schema Migration — autonomousLoopMode

**Files:**
- Modify: `prisma/schema.prisma:138-139`

- [ ] **Step 1: Add autonomousLoopMode field**

In `prisma/schema.prisma`, in the `ResearchProject` model, after the `autonomousLoopAgentUuid` field (line 139), add:

```prisma
autonomousLoopMode          String?   @default("human_review")
```

- [ ] **Step 2: Generate Prisma client**

Run: `pnpm db:generate`

Expected: Prisma client regenerated successfully.

- [ ] **Step 3: Create and apply migration**

Run: `pnpm db:migrate:dev -- --name add-autonomous-loop-mode`

Expected: Migration created and applied. The new column has a default value so existing rows are unaffected.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add autonomousLoopMode field to ResearchProject schema"
```

---

### Task 5: Fix Autonomous Loop Trigger

**Files:**
- Modify: `src/services/experiment.service.ts:921-955`
- Modify: `src/app/api/research-projects/[uuid]/route.ts:134-140`

- [ ] **Step 1: Extract checkAutonomousLoopTrigger helper**

In `src/services/experiment.service.ts`, add a new exported function before the existing `completeExperiment()`:

```typescript
export async function checkAutonomousLoopTrigger(
  projectUuid: string,
  companyUuid: string
) {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid },
    select: {
      autonomousLoopEnabled: true,
      autonomousLoopAgentUuid: true,
      autonomousLoopMode: true,
      name: true,
      uuid: true,
    },
  });

  if (
    !project ||
    !project.autonomousLoopEnabled ||
    !project.autonomousLoopAgentUuid
  ) {
    return;
  }

  const mode = project.autonomousLoopMode ?? "human_review";

  // Count experiments by status
  const statusCounts = await prisma.experiment.groupBy({
    by: ["status"],
    where: { researchProjectUuid: projectUuid, companyUuid },
    _count: true,
  });

  const countByStatus = (s: string) =>
    statusCounts.find((sc) => sc.status === s)?._count ?? 0;

  let shouldTrigger = false;

  if (mode === "human_review") {
    // Mode 1: trigger when no experiments in draft, pending_review, or pending_start
    shouldTrigger =
      countByStatus("draft") === 0 &&
      countByStatus("pending_review") === 0 &&
      countByStatus("pending_start") === 0;
  } else if (mode === "full_auto") {
    // Mode 2: trigger when no experiments are currently running
    shouldTrigger = countByStatus("in_progress") === 0;
  }

  if (shouldTrigger) {
    const { create } = await import("@/services/notification.service");
    await create({
      companyUuid,
      researchProjectUuid: project.uuid,
      recipientType: "agent",
      recipientUuid: project.autonomousLoopAgentUuid,
      entityType: "research_project",
      entityUuid: project.uuid,
      entityTitle: project.name,
      projectName: project.name,
      action: "autonomous_loop_triggered",
      message:
        mode === "full_auto"
          ? "No experiments running. Analyze results and propose next experiment for immediate execution."
          : "Experiment queue is empty. Analyze the project and propose next experiments.",
      actorType: "system",
      actorUuid: "system",
      actorName: "Synapse",
    });
  }
}
```

- [ ] **Step 2: Replace inline trigger in completeExperiment()**

In `completeExperiment()` (lines 921-955), replace the entire autonomous loop block with:

```typescript
// Trigger autonomous loop check
await checkAutonomousLoopTrigger(experiment.researchProjectUuid, input.companyUuid);
```

- [ ] **Step 3: Add trigger to reviewExperiment()**

In `reviewExperiment()` (around line 687, after the activity log), add:

```typescript
// Check autonomous loop when experiment is rejected (queue may become empty)
if (!input.approved) {
  await checkAutonomousLoopTrigger(experiment.researchProjectUuid, input.companyUuid);
}
```

- [ ] **Step 4: Trigger on loop enable**

In `src/app/api/research-projects/[uuid]/route.ts`, after the project update (around line 162), add:

```typescript
import { checkAutonomousLoopTrigger } from "@/services/experiment.service";
```

After the update call, check if the loop was just enabled:

```typescript
if (body.autonomousLoopEnabled === true && body.autonomousLoopAgentUuid) {
  // Fire-and-forget — trigger immediately if conditions met
  checkAutonomousLoopTrigger(existing.uuid, auth.companyUuid).catch(() => {});
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/experiment.service.ts src/app/api/research-projects/\[uuid\]/route.ts
git commit -m "fix: extract autonomous loop trigger helper, add missing trigger points"
```

---

### Task 6: Update synapse_propose_experiment for Mode 2

**Files:**
- Modify: `src/mcp/tools/compute.ts:610-651`
- Modify: `src/services/experiment.service.ts` (createExperiment)

- [ ] **Step 1: Fetch project mode in propose tool**

In `src/mcp/tools/compute.ts`, in the `synapse_propose_experiment` handler (around line 622), update the project query to also select `autonomousLoopMode`:

```typescript
const project = await prisma.researchProject.findFirst({
  where: {
    uuid: args.researchProjectUuid,
    companyUuid: auth.companyUuid,
    autonomousLoopEnabled: true,
    autonomousLoopAgentUuid: auth.actorUuid,
  },
  select: {
    uuid: true,
    name: true,
    autonomousLoopMode: true,
  },
});
```

- [ ] **Step 2: Set status and assignment based on mode**

In the experiment creation call (around line 636), change the call to include mode-dependent fields:

```typescript
const isFullAuto = project.autonomousLoopMode === "full_auto";

const experiment = await experimentService.createExperiment({
  companyUuid: auth.companyUuid,
  researchProjectUuid: args.researchProjectUuid,
  title: args.title,
  description: args.description,
  researchQuestionUuid: args.researchQuestionUuid,
  priority: args.priority,
  createdByType: "agent",
  createdByUuid: auth.actorUuid,
  // Mode 2: skip review, go straight to pending_start with agent assigned
  status: isFullAuto ? "pending_start" : "pending_review",
  assignedAgentUuid: isFullAuto ? auth.actorUuid : undefined,
});
```

- [ ] **Step 3: Update createExperiment to accept optional status and assignedAgentUuid**

In `src/services/experiment.service.ts`, find the `createExperiment()` function. Update its input type to accept optional `status` and `assignedAgentUuid`:

```typescript
status?: string;
assignedAgentUuid?: string;
```

In the Prisma create call, use `input.status ?? "pending_review"` for the status field and include `assignedAgentUuid` if provided.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/compute.ts src/services/experiment.service.ts
git commit -m "feat: synapse_propose_experiment creates pending_start in full_auto mode"
```

---

### Task 7: Mode 2 Synthesis on Completion

**Files:**
- Modify: `src/services/experiment.service.ts` (completeExperiment)

- [ ] **Step 1: Add synthesis trigger in completeExperiment**

In `completeExperiment()`, after the experiment update and before the autonomous loop trigger, add synthesis logic for Mode 2:

```typescript
// In Mode 2, refresh project synthesis after every experiment
const loopProject = await prisma.researchProject.findFirst({
  where: { uuid: experiment.researchProjectUuid, companyUuid: input.companyUuid },
  select: { autonomousLoopEnabled: true, autonomousLoopMode: true },
});

if (loopProject?.autonomousLoopEnabled && loopProject.autonomousLoopMode === "full_auto") {
  // Trigger synthesis document refresh
  try {
    const { refreshProjectSynthesis } = await import("@/services/document.service");
    await refreshProjectSynthesis(experiment.researchProjectUuid, input.companyUuid);
  } catch (err) {
    console.error("Failed to refresh synthesis after Mode 2 experiment:", err);
  }
}
```

Note: Verify the exact function name for synthesis refresh by checking `src/services/document.service.ts`. If it doesn't exist, the synthesis is triggered by the agent itself after reading the completion notification — in that case, the autonomous loop trigger message should instruct the agent to synthesize before proposing.

- [ ] **Step 2: Update trigger message for Mode 2**

This is already handled in Task 5 Step 1 — the message for `full_auto` mode says "Analyze results and propose next experiment for immediate execution."

If synthesis is agent-driven (not a service call), update the message to:

```typescript
message: "No experiments running. Update the project synthesis with latest results, then propose next experiment for immediate execution."
```

- [ ] **Step 3: Commit**

```bash
git add src/services/experiment.service.ts
git commit -m "feat: trigger project synthesis after every Mode 2 experiment completion"
```

---

### Task 8: Autonomous Loop UI — Dropdown Action Menu

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx:117-137, 378-439`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add i18n keys for the new UI**

In `messages/en.json`, in the Experiments section, add:

```json
"startAutonomousLoop": "Start Autonomous Loop",
"humanReviewMode": "Human Review",
"humanReviewModeDesc": "Agent proposes drafts, you review before execution",
"fullAutoMode": "Full Auto",
"fullAutoModeDesc": "Agent proposes and executes autonomously",
"selectAgent": "Select agent",
"activate": "Activate",
"stop": "Stop",
"via": "via",
"autonomousActive": "Active"
```

In `messages/zh.json`, same section:

```json
"startAutonomousLoop": "启动自主闭环",
"humanReviewMode": "人工审核",
"humanReviewModeDesc": "Agent 提出草案，您审核后再执行",
"fullAutoMode": "全自动",
"fullAutoModeDesc": "Agent 自主提出并执行实验",
"selectAgent": "选择 Agent",
"activate": "激活",
"stop": "停止",
"via": "通过",
"autonomousActive": "运行中"
```

- [ ] **Step 2: Update state management**

In `experiments-board.tsx`, update the state variables (around lines 117-122):

```tsx
const [loopEnabled, setLoopEnabled] = useState(autonomousLoopEnabled);
const [loopAgentUuid, setLoopAgentUuid] = useState(autonomousLoopAgentUuid ?? "");
const [loopMode, setLoopMode] = useState<string>(autonomousLoopMode ?? "human_review");
const [loopDropdownOpen, setLoopDropdownOpen] = useState(false);
const [loopSelectedMode, setLoopSelectedMode] = useState<string | null>(null);
```

Add the `autonomousLoopMode` to the component props (read from the project data).

- [ ] **Step 3: Update the updateAutonomousLoop function**

Replace the existing handler (lines 128-137):

```tsx
async function updateAutonomousLoop(
  enabled: boolean,
  agentUuid: string,
  mode: string
) {
  const res = await fetch(`/api/research-projects/${projectUuid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      autonomousLoopEnabled: enabled && agentUuid !== "",
      autonomousLoopAgentUuid: agentUuid || null,
      autonomousLoopMode: mode,
    }),
  });
  if (res.ok) {
    setLoopEnabled(enabled && agentUuid !== "");
    setLoopAgentUuid(agentUuid);
    setLoopMode(mode);
  }
}
```

- [ ] **Step 4: Replace the toggle UI with dropdown action menu**

Replace the autonomous loop section (lines 378-439) with:

```tsx
{/* Autonomous Loop Control */}
<div className="relative">
  {loopEnabled ? (
    /* ACTIVE state: compact status bar */
    <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
      <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" />
      <span className="text-xs font-medium text-emerald-400">
        {loopMode === "full_auto" ? t("fullAutoMode") : t("humanReviewMode")}
      </span>
      <span className="text-xs text-muted-foreground">
        {t("via")} {realtimeAgents.find((a) => a.uuid === loopAgentUuid)?.name ?? "Agent"}
      </span>
      <button
        onClick={async () => {
          await updateAutonomousLoop(false, "", loopMode);
          setLoopDropdownOpen(false);
          setLoopSelectedMode(null);
        }}
        className="ml-1 rounded-md border border-red-500/30 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
      >
        {t("stop")}
      </button>
    </div>
  ) : (
    /* OFF state: dropdown button */
    <>
      <button
        onClick={() => setLoopDropdownOpen(!loopDropdownOpen)}
        className="flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-gradient-to-r from-indigo-950 to-indigo-900 px-3 py-1.5 text-xs text-indigo-200 hover:border-indigo-500/60 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
        </svg>
        {t("startAutonomousLoop")}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-indigo-400 transition-transform ${loopDropdownOpen ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {loopDropdownOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-border/40 bg-card shadow-xl shadow-black/30">
          {!loopSelectedMode ? (
            /* Step 1: Mode selection */
            <div className="p-1.5">
              <button
                onClick={() => setLoopSelectedMode("human_review")}
                className="w-full rounded-md p-2.5 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="text-sm font-medium text-foreground">{t("humanReviewMode")}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t("humanReviewModeDesc")}</div>
              </button>
              <button
                onClick={() => setLoopSelectedMode("full_auto")}
                className="w-full rounded-md p-2.5 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="text-sm font-medium text-foreground">{t("fullAutoMode")}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t("fullAutoModeDesc")}</div>
              </button>
            </div>
          ) : (
            /* Step 2: Agent selection + activate */
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-500"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                <span className="text-sm font-medium text-foreground">
                  {loopSelectedMode === "full_auto" ? t("fullAutoMode") : t("humanReviewMode")}
                </span>
                <button
                  onClick={() => setLoopSelectedMode(null)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  ←
                </button>
              </div>
              <select
                value={loopAgentUuid}
                onChange={(e) => setLoopAgentUuid(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="">{t("selectAgent")}</option>
                {realtimeAgents.map((agent) => (
                  <option key={agent.uuid} value={agent.uuid}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!loopAgentUuid}
                onClick={async () => {
                  await updateAutonomousLoop(true, loopAgentUuid, loopSelectedMode);
                  setLoopDropdownOpen(false);
                  setLoopSelectedMode(null);
                }}
                className="w-full rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {t("activate")}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 5: Close dropdown on outside click**

Add a click-outside handler using a ref:

```tsx
const loopDropdownRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function handleClickOutside(e: MouseEvent) {
    if (loopDropdownRef.current && !loopDropdownRef.current.contains(e.target as Node)) {
      setLoopDropdownOpen(false);
      setLoopSelectedMode(null);
    }
  }
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);
```

Wrap the `<div className="relative">` with `ref={loopDropdownRef}`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/research-projects/\[uuid\]/experiments/experiments-board.tsx messages/en.json messages/zh.json
git commit -m "feat: replace autonomous loop toggle with dropdown action menu supporting Mode 1 and Mode 2"
```

---

### Task 9: Accept autonomousLoopMode in API

**Files:**
- Modify: `src/app/api/research-projects/[uuid]/route.ts:76-89, 134-140`

- [ ] **Step 1: Parse autonomousLoopMode from request body**

In the PATCH handler body parsing (around line 76), add:

```typescript
const autonomousLoopMode = body.autonomousLoopMode as string | undefined;
```

Add validation:

```typescript
if (autonomousLoopMode !== undefined && !["human_review", "full_auto"].includes(autonomousLoopMode)) {
  return NextResponse.json({ error: "Invalid autonomousLoopMode" }, { status: 400 });
}
```

- [ ] **Step 2: Include in update data**

In the update data construction (around line 134), add:

```typescript
if (autonomousLoopMode !== undefined) {
  updateData.autonomousLoopMode = autonomousLoopMode;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/research-projects/\[uuid\]/route.ts
git commit -m "feat: accept autonomousLoopMode in project PATCH endpoint"
```

---

### Task 10: New Notification Types and Preferences

**Files:**
- Modify: `prisma/schema.prisma` (NotificationPreference model)
- Modify: `src/services/notification-listener.ts:13-55`
- Modify: `src/services/notification.service.ts` (NotificationPreferenceFields)
- Modify: `src/components/notification-preferences-form.tsx`

- [ ] **Step 1: Add preference fields to schema**

In `prisma/schema.prisma`, in the `NotificationPreference` model, add after `experimentCompleted`:

```prisma
experimentAutoProposed          Boolean  @default(true)
experimentStatusChanged         Boolean  @default(true)
experimentProgress              Boolean  @default(true)
synthesisUpdated                Boolean  @default(true)
autoSearchCompleted             Boolean  @default(true)
deepResearchCompleted           Boolean  @default(true)
autonomousLoopTriggered         Boolean  @default(true)
```

- [ ] **Step 2: Run migration**

Run: `pnpm db:generate && pnpm db:migrate:dev -- --name add-notification-preference-fields`

- [ ] **Step 3: Update notification-listener.ts mappings**

In `src/services/notification-listener.ts`, add new entries to `resolveNotificationType()` (around line 13):

```typescript
"experiment:status_changed": "experiment_status_changed",
"experiment:completed": "experiment_completed",
"experiment:progress": "experiment_progress",
"research_project:autonomous_loop_triggered": "autonomous_loop_triggered",
"research_project:experiment_auto_proposed": "experiment_auto_proposed",
"research_project:synthesis_updated": "synthesis_updated",
"research_project:auto_search_completed": "auto_search_completed",
"research_project:deep_research_completed": "deep_research_completed",
```

Add to `PREF_FIELD_MAP` (around line 41):

```typescript
experiment_status_changed: "experimentStatusChanged",
experiment_progress: "experimentProgress",
experiment_auto_proposed: "experimentAutoProposed",
synthesis_updated: "synthesisUpdated",
auto_search_completed: "autoSearchCompleted",
deep_research_completed: "deepResearchCompleted",
autonomous_loop_triggered: "autonomousLoopTriggered",
```

- [ ] **Step 4: Update preference form**

In `src/components/notification-preferences-form.tsx`, add the new toggles in the appropriate grouped sections (Experiment group, Loop group). Add i18n keys for labels.

Add to `messages/en.json`:

```json
"prefExperimentAutoProposed": "Experiment auto-proposed",
"prefExperimentStatusChanged": "Experiment status changed",
"prefExperimentProgress": "Experiment progress updates",
"prefSynthesisUpdated": "Synthesis updated",
"prefAutoSearchCompleted": "Auto-search completed",
"prefDeepResearchCompleted": "Deep research completed",
"prefAutonomousLoopTriggered": "Autonomous loop triggered"
```

Add equivalent keys to `messages/zh.json`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/services/notification-listener.ts src/services/notification.service.ts src/components/notification-preferences-form.tsx messages/en.json messages/zh.json
git commit -m "feat: add notification types for experiment status, progress, auto-search, deep research, and loop events"
```

---

### Task 11: Wire Up Missing Notification Emissions

**Files:**
- Modify: `src/services/experiment.service.ts` (status change notifications)
- Modify: `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx` (or relevant backend service for search/research events)

- [ ] **Step 1: Emit experiment status change notifications**

In `experiment.service.ts`, in functions that change experiment status (`startExperiment`, `completeExperiment`, `reviewExperiment`), ensure an activity event is emitted that the notification listener can pick up. Check if existing activity emissions use the right `targetType:action` pairs that match the new mappings from Task 10.

For each status transition, ensure the activity includes:
- `targetType: "experiment"`
- `action: "status_changed"` (generic) or the specific action like `"completed"`

- [ ] **Step 2: Emit search/research notifications**

Find where auto-search and deep research complete in the backend. These are likely in the event-router or the MCP tools. When these operations complete, emit an activity event:

```typescript
eventBus.emit("activity", {
  companyUuid,
  researchProjectUuid: projectUuid,
  targetType: "research_project",
  action: "auto_search_completed",
  targetUuid: projectUuid,
  actorType: "agent",
  actorUuid: agentUuid,
  metadata: { paperCount },
});
```

Do the same for `deep_research_completed`.

- [ ] **Step 3: Emit experiment progress as notification**

When `synapse_report_experiment_progress` is called (in the MCP tool handler), emit a notification for the experiment owner/project members. Check the MCP tool in `src/mcp/tools/compute.ts` for the progress tool handler and add a notification emission.

- [ ] **Step 4: Commit**

```bash
git add src/services/experiment.service.ts src/mcp/tools/compute.ts
git commit -m "feat: emit notifications for experiment status changes, progress, search, and research events"
```

---

### Task 12: End-to-End Verification

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Verify toast notifications**

1. Navigate to a research project
2. Trigger a paper search → verify toast appears bottom-right with Spring Pop animation, auto-dismisses after 3s
3. Trigger a deep research → verify toast
4. Change experiment status → verify toast
5. Stack 3+ toasts rapidly → verify max 3 visible, queued ones appear as slots open

- [ ] **Step 3: Verify deep research placeholder**

1. Go to Related Works page
2. Click edit prompt for auto-search → verify "Focus on papers..." placeholder
3. Click edit prompt for deep research → verify "Analyze recent advances..." placeholder

- [ ] **Step 4: Verify autonomous loop Mode 1**

1. Go to Experiments page
2. Click "Start Autonomous Loop ▾"
3. Select "Human Review" → select agent → Activate
4. Verify active status bar appears with green dot
5. Click Stop → verify returns to button state

- [ ] **Step 5: Verify autonomous loop Mode 2**

1. Click "Start Autonomous Loop ▾"
2. Select "Full Auto" → select agent → Activate
3. Verify active status bar shows "Full Auto"
4. Complete an experiment → verify synthesis triggers → verify loop triggers agent → verify proposed experiment lands in `pending_start` column

- [ ] **Step 6: Verify trigger on enable**

1. With all experiment queues empty, enable autonomous loop
2. Verify the agent is triggered immediately (check notifications)

- [ ] **Step 7: Commit any fixes**

```bash
git commit -m "fix: adjustments from end-to-end testing"
```

# Toast Notifications & Autonomous Loop v2 Design

**Date**: 2026-04-13
**Branch**: `session/2026-04-11-agent-type-transport`

## Overview

Four changes to Synapse:

1. **Toast notification system** — bottom-right popup cards with Spring Pop animation for all key events
2. **Deep research placeholder fix** — i18n text correction
3. **Fix autonomous loop trigger** — add missing trigger points and mode-aware conditions
4. **Autonomous loop Mode 2 (Full Auto)** — Karpathy-style fully autonomous research loop

## 1. Toast Notification System

### Architecture

A new `ToastContext` + `ToastContainer` component pair, rendered at the app root. No external library — custom CSS animations matching Synapse's dark theme.

### Toast Behavior

- **Position**: fixed bottom-right corner, 24px from edges
- **Max visible**: 3 toasts stacked vertically (newest at bottom)
- **Overflow**: queued FIFO, shown as slots open
- **Auto-dismiss**: 3 seconds
- **Click**: dismisses immediately
- **Animation**: Spring Pop — `cubic-bezier(0.34, 1.56, 0.64, 1)` on enter (translateY + scale), quick fade-down on exit (`cubic-bezier(0.55, 0, 1, 0.45)`)
- **Stacking**: when a toast is dismissed/expires, remaining toasts slide down smoothly

### Toast Card Design

Each toast card contains:
- Left: category color dot (8px circle)
- Category label (small, colored text)
- Message text (13px, light gray)
- Right edge: subtle close button on hover

### Events That Trigger Toasts

| Event | Category | Color | Example |
|-------|----------|-------|---------|
| Paper search started | Search | Blue (#3b82f6) | "Searching for 'transformer architectures'..." |
| Paper search completed | Search | Blue | "Found 12 papers" |
| Paper search failed | Search | Red (#ef4444) | "Search failed: timeout" |
| Deep research started | Research | Purple (#a855f7) | "Generating deep research report..." |
| Deep research completed | Research | Purple | "Deep research report ready" |
| Deep research failed | Research | Red | "Report generation failed" |
| Experiment status changed | Experiment | Indigo (#818cf8) | "'Ablation Study' → in_progress" |
| Experiment progress update | Experiment | Indigo | "Training epoch 3/10, loss=0.42" |
| Autonomous loop triggered | Loop | Amber (#f59e0b) | "Loop triggered, analyzing project..." |
| Experiment proposed (auto) | Loop | Green (#22c55e) | "Proposed: 'LR sweep 0.001-0.1'" |
| Synthesis updated | Loop | Cyan (#06b6d4) | "Project synthesis updated" |

### Integration Point

Hook into the existing SSE notification stream in `NotificationContext`. When a `new_notification` event arrives:
1. Fetch notification details (already available in the event payload or via a lightweight fetch)
2. Map notification `action` to a toast category/color
3. Call `addToast({ category, color, message })` from the `ToastContext`

### Files to Create/Modify

- **New**: `src/contexts/toast-context.tsx` — ToastProvider, useToast hook, toast state management
- **New**: `src/components/toast-container.tsx` — renders toast cards with animations
- **Modify**: `src/app/(dashboard)/layout.tsx` — wrap with `<ToastProvider>`
- **Modify**: `src/contexts/notification-context.tsx` — call `addToast()` when SSE events arrive

## 2. Deep Research Placeholder Fix

### Problem

The deep research additional instructions dialog uses the same placeholder as paper search: "Focus on papers from 2023-2024 about transformer architectures..."

### Fix

Split `promptPlaceholder` into two context-specific keys:

**`messages/en.json`**:
```json
"searchPromptPlaceholder": "e.g. Focus on papers from 2023-2024 about transformer architectures...",
"deepResearchPromptPlaceholder": "e.g. Analyze recent advances in RLHF, compare PPO vs DPO approaches, and identify open problems..."
```

**`messages/zh.json`**:
```json
"searchPromptPlaceholder": "例如：重点搜索 2023-2024 年关于 transformer 架构的论文...",
"deepResearchPromptPlaceholder": "例如：分析 RLHF 的最新进展，比较 PPO 与 DPO 方法，并识别开放性问题..."
```

**`related-works-client.tsx`**: Conditionally use placeholder based on `promptDialogOpen` state:
- `"search"` → `t("searchPromptPlaceholder")`
- `"deepResearch"` → `t("deepResearchPromptPlaceholder")`

## 3. Fix Autonomous Loop Trigger

### Root Cause

The autonomous loop trigger only fires inside `completeExperiment()` when `queueCount === 0`. No other status transitions check the loop condition.

### Fix

#### 3a. Extract shared trigger helper

Create `checkAutonomousLoopTrigger(projectUuid)` in `experiment.service.ts`:
- Loads the project's `autonomousLoopEnabled`, `autonomousLoopMode`, `autonomousLoopAgentUuid`
- Counts experiments by status
- Mode 1 condition: `draft === 0 && pending_review === 0 && pending_start === 0`
- Mode 2 condition: `in_progress === 0`
- If condition met, creates `autonomous_loop_triggered` notification for the loop agent

#### 3b. Add trigger calls to

1. **`completeExperiment()`** — existing, refactor to use shared helper
2. **`reviewExperiment()`** — when a human rejects/discards an experiment
3. **`updateExperiment()`** — when experiments are deleted
4. **When loop is first enabled** — if condition already met at toggle-on time, trigger immediately (in the PATCH `/api/research-projects/[uuid]` handler)

## 4. Autonomous Loop Mode 2 — Full Auto

### Schema Changes

Add to `ResearchProject` in `prisma/schema.prisma`:
```prisma
autonomousLoopMode          String?   @default("human_review")
```

Values: `"human_review"` (Mode 1) | `"full_auto"` (Mode 2)

No `autonomousLoopSynthesisCount` field needed — synthesis happens after every experiment completion in Mode 2 (hardcoded).

### Mode 2 Experiment Flow

```
Loop trigger fires (in_progress === 0)
  → Notification sent to loop agent
  → Agent receives full project context
  → Agent calls synapse_propose_experiment
  → Experiment created as pending_start (not draft)
    with assignedAgentUuid = loop agent
  → Agent starts the experiment
  → Experiment runs (in_progress)
  → Experiment completes
  → Project synthesis document refreshed
  → Loop trigger fires again
  → Repeat forever until human clicks Stop
```

### Changes to `synapse_propose_experiment`

Current behavior: creates experiment as `pending_review`.

New behavior based on `autonomousLoopMode`:
- **Mode 1 (`human_review`)**: create as `pending_review` (current behavior — human reviews before execution)
- **Mode 2 (`full_auto`)**: create as `pending_start` with `assignedAgentUuid` set to the loop agent

### Synthesis Trigger

In `completeExperiment()`, when Mode 2 is active:
1. Update experiment status to `completed`
2. Refresh the project synthesis document (existing logic)
3. Then check autonomous loop trigger

This ensures the synthesis is always up-to-date before the agent proposes the next experiment.

### UI — Dropdown Action Menu

**OFF state**: Single button in the experiments board header:
```
[⚡ Start Autonomous Loop ▾]
```

**Dropdown open**: Two options with descriptions:
```
┌─────────────────────────────────────┐
│ Human Review                        │
│ Agent proposes drafts, you review   │
│ before execution                    │
│─────────────────────────────────────│
│ Full Auto                           │
│ Agent proposes and executes         │
│ autonomously                        │
└─────────────────────────────────────┘
```

**After selecting a mode**: Dropdown expands with agent picker + Activate button:
```
┌─────────────────────────────────────┐
│ ✓ Full Auto                         │
│                                     │
│ Agent: [ResearchBot-1 ▾]           │
│                                     │
│ [        Activate        ]          │
└─────────────────────────────────────┘
```

**ACTIVE state**: Compact status bar replaces the button:
```
● Full Auto  via ResearchBot-1  [Stop]
```
Green pulsing dot, mode name, agent name, red Stop button.

### API Changes

PATCH `/api/research-projects/[uuid]`:
- Accept `autonomousLoopMode` field alongside existing `autonomousLoopEnabled` and `autonomousLoopAgentUuid`
- On activation with Mode 2, check trigger condition immediately

### Notification Changes

Add new notification types:
- `autonomous_loop_triggered` — already exists
- `experiment_auto_proposed` — new, for when Mode 2 proposes an experiment
- `synthesis_updated` — new, for when project synthesis is refreshed

Add preference fields to `NotificationPreference`:
- `experimentAutoProposed` Boolean @default(true)
- `synthesisUpdated` Boolean @default(true)

## Out of Scope

- OpenClaw tool call hooks (no hooks exist in plugin API, existing progress reporting is sufficient)
- Configurable synthesis interval (hardcoded to every experiment)
- New board view for Mode 2 (uses existing 5-column board)

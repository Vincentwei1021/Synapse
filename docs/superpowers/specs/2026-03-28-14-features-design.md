# 14 Feature Improvements — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

14 improvements to Synapse spanning UI fixes, schema changes, and new real-time features. Organized in 3 implementation batches.

---

## Batch 1: Quick Fixes (No Schema Changes)

### #5 — Overview page layout reorder

**Current:** Research Pipeline (left), Research Questions (right).
**Change:** Swap — Research Questions (left), Research Pipeline (right).

**Files:** `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`
**Scope:** Swap the two grid columns in the bottom section.

### #6 — Dark mode document display fix

**Current:** Document cards and content may have hardcoded light-mode colors.
**Change:** Audit document pages for hardcoded colors (`#xxx`, `bg-[xxx]`), replace with theme-aware classes (`bg-card`, `text-foreground`, `border-border`, etc.).

**Files:**
- `src/app/(dashboard)/research-projects/[uuid]/documents/page.tsx`
- `src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx`

### #7 — New project button navigates to /research-projects/new

**Current:** "New Project" button opens an inline `CreateProjectDialog` modal.
**Change:** Replace with a `<Link href="/research-projects/new">` navigation. Remove the modal usage from the main projects page.

**Files:** `src/app/(dashboard)/research-projects/page.tsx` (ProjectsPageHeader, GroupSection, UngroupedSection components)

### #8 — Create project form text changes

**Changes to** `src/app/(dashboard)/research-projects/new/page.tsx`:
1. Remove the "研究目标 / Goal" field entirely
2. Description placeholder → "说明研究方向，研究目标，约束条件"
3. Datasets placeholder → "可以填写公开数据集名称，也可以填写你的 agent 能访问的 S3 路径或本地路径。每个可附上一句简短说明"
4. Evaluation Methods placeholder → "指标，基准或评估方法"

**i18n:** Update both `messages/en.json` and `messages/zh.json`.

### #9 — Collapsible sections 2 and 3

**Current:** Steps 2 (Initial Ideas) and 3 (Documents) have step badges, "Optional" labels, and expand/collapse buttons.
**Change:**
- Rename: Step 2 → "初始想法（可选）" / "Initial Ideas (Optional)"
- Rename: Step 3 → "参考文档（可选）" / "Reference Documents (Optional)"
- Make the entire section header clickable to toggle expand/collapse
- Remove the right-side "Optional" text and separate expand button
- Default: collapsed

**Files:** `src/app/(dashboard)/research-projects/new/page.tsx`, i18n files.

### #10 — Fix logout on long form stays

**Root cause:** Access token expires in 1 hour. No API calls during form filling means no refresh trigger. On submit, 401 redirects to login.

**Fix:** Add a proactive token refresh interval in the dashboard layout:
```
// In src/app/(dashboard)/layout.tsx (client wrapper)
useEffect(() => {
  const interval = setInterval(async () => {
    await fetch("/api/auth/refresh", { method: "POST" });
  }, 45 * 60 * 1000); // every 45 minutes
  return () => clearInterval(interval);
}, []);
```

Also add a 401 retry wrapper in form submissions: on 401, call refresh, then retry the original request once before redirecting.

**Files:** `src/app/(dashboard)/layout.tsx`

### #12 — Compute budget → time limit

**Changes:**
- Rename all UI labels: "算力预算" → "时间限制" / "Compute Budget" → "Time Limit"
- Placeholder: "默认无限制" / "Default: Unlimited"
- Help text: "实验的最大运行时间（小时）" / "Maximum runtime for this experiment (hours)"
- Field name in code stays `computeBudgetHours` (no schema change, just UI labels)

**Files:** i18n files, `create-experiment-form.tsx`, `experiments-board.tsx` detail panel.

---

## Batch 2: Medium Changes (Schema + Forms)

### #1 — Agent kanban page with 4 composable permissions

**New sidebar entry:** "智能体 / Agents" between Compute and Settings, icon: `Bot`.

**New page:** `/agents` — a card grid view of all agents owned by the current user.

**Permission model change:**
- Old roles: `researcher_agent`, `research_lead_agent`, `pi_agent`
- New roles: `pre_research`, `research`, `experiment`, `report`
- Composable: an agent can have any combination (stored in existing `roles String[]`)
- Migration: map old roles to new (researcher_agent → experiment, research_lead_agent → research+experiment, pi_agent → pre_research+research+experiment+report)

**Agent page layout:**
- Header: "智能体" title + "Create Agent" button
- Agent cards in a list/grid (not a 5-column board — agents don't have status columns)
- Each card shows: name, role badges, persona excerpt, last active, API key count
- Click card → detail panel (slide-out sheet) showing:
  - Agent info (editable)
  - API keys (create/revoke)
  - Sessions list
  - Permission checkboxes (预研/研究/实验/报告)

**Create flow:**
1. Click "Create Agent"
2. Fill: name, permissions (checkboxes), persona (optional)
3. Submit → creates Agent + API key
4. Show API key once (copy to clipboard)

**MCP tool registration:** Tools registered per permission:
- `pre_research`: research project read, literature search tools
- `research`: research question CRUD, hypothesis formulation tools
- `experiment`: experiment start/complete/submit, compute tools
- `report`: document CRUD, synthesis tools

**Files:**
- New: `src/app/(dashboard)/agents/page.tsx`, `agents/agent-card.tsx`, `agents/create-agent-dialog.tsx`
- Modify: `src/app/(dashboard)/layout.tsx` (sidebar), `src/services/agent.service.ts`, `src/mcp/tools/` (tool registration by permission), i18n files
- Settings page: remove agent management section (moved to /agents)

### #2 — Notification preferences update

**New terminology + regrouping by permission model:**

| Group | Preferences |
|-------|------------|
| 预研 (Pre-research) | projectCreated, literatureFound (placeholders — active once pre-research tools are built) |
| 研究 (Research) | researchQuestionClaimed, hypothesisFormulationRequested, hypothesisFormulationAnswered |
| 实验 (Experiment) | experimentAssigned, experimentStatusChanged, experimentCompleted, experimentDesignApproved, experimentDesignRejected |
| 报告 (Report) | documentCreated, synthesisUpdated |
| 通用 (General) | commentAdded, mentioned |

**Migration:** Map old preference field names to new ones. Add missing fields with default `true`.

**Files:** `src/components/notification-preferences-form.tsx`, `prisma/schema.prisma` (NotificationPreference model), i18n files, `src/services/notification.service.ts`

### #3 — Research project binds to compute pool (strong constraint)

**Schema change:**
```prisma
model ResearchProject {
  // ... existing fields
  computePoolUuid String? // nullable FK -> ComputePool.uuid
  // ...
  @@index([computePoolUuid])
}
```

**Create project form:** Add a required select dropdown for compute pool. Options: "无 / None" (value: empty) + all company pools. "None" means `computePoolUuid = null` (no constraint).

**Enforcement points:**
1. `reserveGpusForExperiment()` — before reserving, look up the experiment's project → check `computePoolUuid`. If set, verify all requested GPUs belong to nodes in that pool. Reject otherwise.
2. `reserveGpusForRun()` — same check via run's project.
3. MCP `synapse_list_compute_nodes` — when called with a `researchProjectUuid`, filter to show only nodes in the bound pool.
4. MCP `synapse_start_experiment` — validate GPU pool before reservation.

**Files:** `prisma/schema.prisma`, `src/services/compute.service.ts`, `src/mcp/tools/compute.ts`, create project form + page, i18n files

### #4 — Editable project groups + project details

**Project groups:** Already editable via ManageProjectGroupDialog. No change needed.

**Project details edit dialog:**
- Add a "编辑 / Edit" button (Pencil icon) to the project dashboard header
- Click opens a dialog with:
  - Project name (input)
  - Description (textarea)
  - Datasets (textarea, multiline)
  - Evaluation Methods (textarea, multiline)
  - Compute Pool (select dropdown, same as create form)
- Save → PATCH `/api/research-projects/[uuid]`
- Cancel dismisses dialog

**Files:** `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx` (add dialog), i18n files

### #11 — Experiment description from other experiments

**Change to create experiment form:**
- Add a select dropdown above the description textarea: "从已有实验复制描述 / Copy from existing experiment"
- Options: all experiments in the same project (title + status badge)
- Empty option: "自行填写 / Write your own"
- On select: populate description textarea with selected experiment's description
- User can edit after auto-fill

**Data source:** Use existing `listExperiments` with the current project UUID.

**Files:** `src/app/(dashboard)/research-projects/[uuid]/experiments/new/create-experiment-form.tsx`, `src/app/(dashboard)/research-projects/[uuid]/experiments/new/page.tsx` (pass experiments as prop), i18n files

---

## Batch 3: Real-time Status Features

### #13 — Experiment card real-time sub-status

**New fields on Experiment model:**
```prisma
model Experiment {
  // ... existing fields
  liveStatus   String?  // null | sent | ack | checking_resources | queuing | running
  liveMessage  String?  // latest progress message from agent (one line)
  liveUpdatedAt DateTime? // when liveStatus/liveMessage last changed
}
```

**Status flow:**
1. User assigns experiment to agent → `liveStatus = "sent"`
2. Agent calls `synapse_get_assigned_experiments` → auto-sets `liveStatus = "ack"`
3. Agent calls `synapse_start_experiment`:
   - Before GPU check: `liveStatus = "checking_resources"`
   - If no GPUs available: `liveStatus = "queuing"`
   - If GPUs reserved and started: `liveStatus = "running"`
4. Agent calls `synapse_submit_experiment_results` → `liveStatus = null` (completed)

**Card display:**
- Below assignee name on experiment card, show a colored badge:
  - sent: gray "已发送"
  - ack: blue "已接收"
  - checking_resources: yellow "检查资源中"
  - queuing: orange "排队中"
  - running: green "运行中"
- Only show when `liveStatus` is not null

**SSE updates:** `liveStatus` changes emit via existing eventBus → client auto-refreshes.

**Files:**
- `prisma/schema.prisma`
- `src/services/experiment.service.ts` (update liveStatus in assign/start/complete flows)
- `src/mcp/tools/compute.ts` (update liveStatus at each step)
- `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx` (render badge)
- i18n files

### #14 — Agent progress messages during experiments

**New model:**
```prisma
model ExperimentProgressLog {
  id             Int        @id @default(autoincrement())
  uuid           String     @unique @default(uuid())
  companyUuid    String
  experimentUuid String
  experiment     Experiment @relation(fields: [experimentUuid], references: [uuid], onDelete: Cascade)
  message        String     // progress message text
  phase          String?    // optional phase label (e.g., "data_download", "training", "evaluation")
  actorUuid      String     // agent UUID
  createdAt      DateTime   @default(now())

  @@index([experimentUuid, createdAt])
  @@index([companyUuid])
}

// Also add relation to Experiment model:
// progressLogs ExperimentProgressLog[]
```

**New MCP tool:** `synapse_report_experiment_progress`
```
Input: { experimentUuid: string, message: string, phase?: string }
```
- Creates ExperimentProgressLog entry
- Updates `Experiment.liveMessage` with the message
- Updates `Experiment.liveUpdatedAt`
- Emits SSE event for real-time card update

**Card display:** Below the sub-status badge, show `liveMessage` truncated to one line (gray, small text). Example: "训练中 epoch 3/10, loss=0.42..."

**Detail panel:** New "进度日志 / Progress Log" section showing full timeline:
- Each entry: timestamp + phase badge + message
- Sorted newest first
- Loaded on panel open via GET `/api/experiments/[uuid]/progress`

**New API route:** `GET /api/experiments/[uuid]/progress` — returns progress logs for the experiment.

**Files:**
- `prisma/schema.prisma` (new model)
- New: `src/services/experiment-progress.service.ts`
- New: `src/app/api/experiments/[uuid]/progress/route.ts`
- `src/mcp/tools/compute.ts` (new tool registration)
- `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx` (card + detail panel)
- i18n files

---

## Migration Notes

### Role migration (Batch 2, #1)
Old → New mapping:
- `researcher_agent` / `researcher` → `["experiment"]`
- `research_lead_agent` / `research_lead` → `["research", "experiment"]`
- `pi_agent` / `pi` → `["pre_research", "research", "experiment", "report"]`

This can be a data migration script or handled lazily (accept old roles, display as new).

### Notification preference migration (Batch 2, #2)
Add new columns with default `true`. Old columns can be kept for backward compat or dropped in a follow-up migration.

---

## Out of Scope

- Drag-and-drop on agent kanban (agents don't have status columns — use list/grid)
- Full RBAC permission enforcement on every API endpoint (permissions affect MCP tool availability, not API route access)
- Compute pool CRUD from project creation (pools managed separately under /compute)

# Phase 3: Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hypothesis Board visualization, Early Stopping mechanism, and Results Export to the Synapse research platform.

**Architecture:** Three independent features. Hypothesis Board is a new @xyflow/react DAG component on the dashboard. Early Stopping wires the existing criteria evaluation service to set a flag and send notifications. Results Export generates Markdown + CSV from existing service data via server actions.

**Tech Stack:** Next.js 15, React 19, @xyflow/react, dagre, Tailwind CSS 4, shadcn/ui, Vitest, next-intl

**Spec:** `docs/superpowers/specs/2026-03-22-phase3-advanced-features-design.md`

---

## File Structure

### New Files
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/hypothesis-board.tsx` — Multi-level DAG visualization
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/export-button.tsx` — Export button client component
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/export-actions.ts` — Server action for generating export files

### Modified Files
- `prisma/schema.prisma` — Add `earlyStopTriggered` field to ExperimentRun
- `src/services/criteria-evaluation.service.ts` — Set earlyStopTriggered flag + create notification
- `src/services/__tests__/criteria-evaluation.service.test.ts` — Tests for early stop behavior
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx` — Fetch data for hypothesis board + add export button
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/dashboard-tabs.tsx` — Add 3rd tab for Hypothesis Board
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx` — Early stop warning banner
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/kanban-board.tsx` — Early stop warning icon
- `messages/en.json` — i18n keys for all 3 features
- `messages/zh.json` — Chinese translations

---

## Task 1: Schema — Add earlyStopTriggered Field

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field to ExperimentRun model**

In the ExperimentRun model, add after the `outcome` field:

```prisma
earlyStopTriggered  Boolean  @default(false)
```

- [ ] **Step 2: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep "error" | wc -l
```
Expected: 0

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add earlyStopTriggered field to ExperimentRun"
```

---

## Task 2: Early Stopping Backend — Criteria Evaluation Wiring

**Files:**
- Modify: `src/services/criteria-evaluation.service.ts`
- Modify: `src/services/__tests__/criteria-evaluation.service.test.ts`

- [ ] **Step 1: Update tests for early stop behavior**

Add tests to `criteria-evaluation.service.test.ts`:

1. "should set earlyStopTriggered=true on the run when shouldStop is true"
   - Mock criteria with isEarlyStop=true that fails
   - Assert `prisma.experimentRun.update` was called with `earlyStopTriggered: true`

2. "should create notification when early stop triggers"
   - Mock criteria with isEarlyStop=true that fails
   - Assert `prisma.notification.create` was called with action "early_stop_triggered"

3. "should NOT set earlyStopTriggered when early stop criteria pass"
   - Mock criteria with isEarlyStop=true that passes
   - Assert `prisma.experimentRun.update` was NOT called with earlyStopTriggered

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/services/__tests__/criteria-evaluation.service.test.ts
```

- [ ] **Step 3: Implement early stop wiring**

In `evaluateCriteria` function, after evaluating all criteria, add:

```typescript
// If early stop triggered, set flag on the run and create notification
if (shouldStop) {
  await prisma.experimentRun.update({
    where: { uuid: runUuid },
    data: { earlyStopTriggered: true },
  });

  // Find the run to get project context for notification
  const run = await prisma.experimentRun.findUnique({
    where: { uuid: runUuid },
    select: { title: true, researchProjectUuid: true, assigneeUuid: true, assigneeType: true },
  });

  if (run && run.assigneeUuid) {
    const failedEarlyStop = results.find(r => r.isEarlyStop && r.passed === false);
    await prisma.notification.create({
      data: {
        companyUuid,
        projectUuid: run.researchProjectUuid,
        recipientType: run.assigneeType || "agent",
        recipientUuid: run.assigneeUuid,
        entityType: "experiment_run",
        entityUuid: runUuid,
        entityTitle: run.title,
        projectName: "",
        action: "early_stop_triggered",
        message: `Early stop triggered: ${failedEarlyStop?.metricName} ${failedEarlyStop?.operator} ${failedEarlyStop?.threshold} (actual: ${failedEarlyStop?.actualValue})`,
        actorType: "agent",
        actorUuid: companyUuid,
        actorName: "System",
      },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/services/__tests__/criteria-evaluation.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/criteria-evaluation.service.ts src/services/__tests__/criteria-evaluation.service.test.ts
git commit -m "feat: wire early stopping — set flag and notify on criteria failure"
```

---

## Task 3: Early Stopping UI — Warning Banner + Kanban Icon

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/kanban-board.tsx`

- [ ] **Step 1: Add earlyStopTriggered to Task interface in run-detail-panel.tsx**

```typescript
interface Task {
  // ... existing fields ...
  earlyStopTriggered?: boolean;
}
```

- [ ] **Step 2: Add warning banner to run-detail-panel.tsx**

At the top of the detail panel content (above the Experiment Configuration section), add:

```tsx
{task.earlyStopTriggered && (
  <Card className="border-amber-300 bg-amber-50 p-4 mb-4">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div>
        <p className="font-semibold text-amber-800 text-sm">
          {t("earlyStop.triggered")}
        </p>
        <p className="text-amber-700 text-xs mt-0.5">
          {t("earlyStop.description")}
        </p>
      </div>
    </div>
  </Card>
)}
```

- [ ] **Step 3: Add earlyStopTriggered to Kanban Task interface**

In `kanban-board.tsx`, add to the Task interface:
```typescript
earlyStopTriggered?: boolean;
```

- [ ] **Step 4: Add warning icon to Kanban cards**

Near the Go/No-Go badge rendering, add:
```tsx
{task.earlyStopTriggered && (
  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
)}
```

Import `AlertTriangle` from lucide-react if not already imported.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "run-detail-panel|kanban" | wc -l
git add src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx \
  src/app/(dashboard)/research-projects/[uuid]/experiment-runs/kanban-board.tsx
git commit -m "feat: add early stop warning banner and Kanban icon"
```

---

## Task 4: Hypothesis Board Component

**Files:**
- Create: `src/app/(dashboard)/research-projects/[uuid]/dashboard/hypothesis-board.tsx`

- [ ] **Step 1: Create the HypothesisBoard client component**

A `"use client"` component that renders a multi-level DAG using @xyflow/react and dagre.

Props:
```typescript
interface ResearchQuestionNode {
  uuid: string;
  title: string;
  status: string;
}

interface ExperimentDesignNode {
  uuid: string;
  title: string;
  status: string;
  inputUuids: string[]; // Research Question UUIDs this design is based on
}

interface ExperimentRunNode {
  uuid: string;
  title: string;
  status: string;
  outcome: string | null;
  experimentDesignUuid: string | null;
  goNoGoCriteria?: { metricName: string | null; threshold: number | null; operator: string | null; actualValue: number | null; required: boolean; isEarlyStop: boolean }[];
}

interface HypothesisBoardProps {
  questions: ResearchQuestionNode[];
  designs: ExperimentDesignNode[];
  runs: ExperimentRunNode[];
  projectUuid: string;
}
```

Implementation:
1. Create nodes for each level with different styling:
   - Questions: `type: "question"`, blue border, large
   - Designs: `type: "design"`, purple border, medium
   - Runs: `type: "run"`, border color by outcome (green/red/yellow/gray), small
2. Create edges: Question→Design (from design.inputUuids), Design→Run (from run.experimentDesignUuid)
3. Use dagre for layout with `rankdir: "TB"`, `nodesep: 60`, `ranksep: 80`
4. Custom node components for each type
5. Click handler: navigate to detail page using `useRouter`

Follow the existing `dag-view.tsx` patterns for @xyflow/react usage (imports, dagre setup, fitView).

Import `GoNoGoBadge` from `@/components/go-no-go-badge` for run nodes.

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "hypothesis-board"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/hypothesis-board.tsx
git commit -m "feat: add Hypothesis Board multi-level DAG visualization"
```

---

## Task 5: Integrate Hypothesis Board into Dashboard

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/dashboard/dashboard-tabs.tsx`

- [ ] **Step 1: Fetch hypothesis board data in page.tsx**

Add imports and data fetching alongside existing fetches:

```typescript
import { listResearchQuestions } from "@/services/research-question.service";
import { listExperimentDesigns } from "@/services/experiment-design.service";
```

Fetch:
```typescript
const [experimentRuns, activeBaseline, questions, designs] = await Promise.all([
  // ... existing fetches ...
  listResearchQuestions(auth.companyUuid, { researchProjectUuid: uuid }),
  listExperimentDesigns(auth.companyUuid, { researchProjectUuid: uuid }),
]);
```

Transform into the shapes needed by HypothesisBoard props.

- [ ] **Step 2: Add 3rd tab to dashboard-tabs.tsx**

Read `dashboard-tabs.tsx`. Add a third `TabsTrigger` and `TabsContent`:

```tsx
<TabsTrigger value="hypothesis">Hypothesis Board</TabsTrigger>
// ...
<TabsContent value="hypothesis">
  {hypothesisBoardContent}
</TabsContent>
```

Add `hypothesisBoardContent: React.ReactNode` to the component props.

- [ ] **Step 3: Pass hypothesis board from page.tsx**

In page.tsx, import HypothesisBoard and pass it to DashboardTabs:

```tsx
import { HypothesisBoard } from "./hypothesis-board";

<DashboardTabs
  overviewContent={...}
  metricsContent={...}
  hypothesisBoardContent={
    <HypothesisBoard
      questions={questionsData}
      designs={designsData}
      runs={runsData}
      projectUuid={uuid}
    />
  }
/>
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "dashboard"
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/
git commit -m "feat: integrate Hypothesis Board as dashboard tab"
```

---

## Task 6: Results Export — Server Action

**Files:**
- Create: `src/app/(dashboard)/research-projects/[uuid]/dashboard/export-actions.ts`

- [ ] **Step 1: Create the export server action**

```typescript
"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { getActiveBaseline } from "@/services/baseline.service";
import { listExperimentRuns } from "@/services/experiment-run.service";
import { listExperimentDesigns } from "@/services/experiment-design.service";
import { listResearchQuestions } from "@/services/research-question.service";
import { listDocuments } from "@/services/document.service";
import { getResearchProject } from "@/services/research-project.service";
import prisma from "@/lib/prisma";
```

Export function `exportResearchResults(projectUuid: string)` that:

1. Fetches: project info, all questions, designs, runs (with experimentResults), baseline, RDR documents
2. Generates Markdown string:
   - Title: `# [Project Name] — Research Results`
   - Summary section: counts of questions, designs, runs by outcome
   - Baseline section: name + metrics table
   - Per-design section: table with runs as rows, metrics as columns
   - RDR section: each RDR title + full content
3. Generates CSV string:
   - Header: `run_uuid,run_title,design_title,outcome,[metric columns]`
   - One row per run with results
   - Metric columns = union of all metric keys across all runs
4. Returns `{ markdown: string, csv: string, projectName: string }`

Note: For runs, fetch `experimentResults` directly from Prisma since the service list response may not include it:
```typescript
const runsWithResults = await prisma.experimentRun.findMany({
  where: { companyUuid: auth.companyUuid, researchProjectUuid: projectUuid },
  select: { uuid: true, title: true, experimentDesignUuid: true, experimentResults: true, outcome: true },
});
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "export-actions"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/export-actions.ts
git commit -m "feat: add results export server action (Markdown + CSV)"
```

---

## Task 7: Results Export — Button Component + Dashboard Integration

**Files:**
- Create: `src/app/(dashboard)/research-projects/[uuid]/dashboard/export-button.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`

- [ ] **Step 1: Create ExportButton client component**

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportResearchResults } from "./export-actions";
```

The component:
1. Takes `projectUuid: string` as prop
2. On click, calls `exportResearchResults(projectUuid)`
3. Shows loading spinner while fetching
4. Creates two Blob downloads:
   - `synapse-results-[name].md` (Markdown)
   - `synapse-metrics-[name].csv` (CSV)
5. Triggers download via `URL.createObjectURL` + click on temp anchor

```typescript
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add ExportButton to dashboard page.tsx**

Import and render in the header area (next to project settings or title):

```tsx
import { ExportButton } from "./export-button";

// In the header section:
<ExportButton projectUuid={uuid} />
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "export-button|dashboard/page"
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/export-button.tsx \
  src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx
git commit -m "feat: add export button to research project dashboard"
```

---

## Task 8: i18n Keys for Phase 3

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add English keys**

Merge into existing structure:

```json
"hypothesisBoard": {
  "title": "Hypothesis Board",
  "researchQuestion": "Research Question",
  "experimentDesign": "Experiment Design",
  "experimentRun": "Experiment Run",
  "noData": "No research data to display"
},
"earlyStop": {
  "triggered": "Early Stop Triggered",
  "description": "One or more early-stop criteria failed. Review the Go/No-Go criteria and decide whether to close this run.",
  "warningIcon": "Early stop"
},
"export": {
  "button": "Export Results",
  "loading": "Exporting...",
  "success": "Export complete",
  "noData": "No results to export"
}
```

Add to existing `dashboard` section:
```json
"hypothesisBoard": "Hypothesis Board"
```

- [ ] **Step 2: Add Chinese keys**

```json
"hypothesisBoard": {
  "title": "假设看板",
  "researchQuestion": "研究问题",
  "experimentDesign": "实验设计",
  "experimentRun": "实验运行",
  "noData": "没有研究数据可显示"
},
"earlyStop": {
  "triggered": "提前终止已触发",
  "description": "一个或多个提前终止标准未达标。请查看通过/不通过标准，决定是否关闭此运行。",
  "warningIcon": "提前终止"
},
"export": {
  "button": "导出结果",
  "loading": "导出中...",
  "success": "导出完成",
  "noData": "没有可导出的结果"
}
```

Add to existing `dashboard` section:
```json
"hypothesisBoard": "假设看板"
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: add Phase 3 translation keys"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Run tests**

```bash
pnpm test
```
Expected: All pass

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve Phase 3 type/lint issues"
```

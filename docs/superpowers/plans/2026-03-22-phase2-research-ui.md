# Phase 2: Research UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 research-specific UI components: Metrics Comparison Table, Go/No-Go Indicators, Experiment Configuration Panel, and RDR Viewer badge.

**Architecture:** All components extend existing pages — no new routes needed. The Metrics Comparison Table is a new client component on a new dashboard tab. Go/No-Go and Config panels extend the existing run-detail-panel. RDR viewer is a conditional badge on the document detail page. Data comes from existing services (experimentRunService, baselineService, experimentRegistryService).

**Tech Stack:** React 19, Next.js 15 (App Router), Tailwind CSS 4, shadcn/ui, next-intl, Vitest

**Spec:** `docs/superpowers/specs/2026-03-22-phase2-research-ui-design.md`

---

## File Structure

### New Files
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/metrics-comparison-table.tsx` — Client component for metrics comparison (tab content)
- `src/components/go-no-go-badge.tsx` — Shared badge component for Kanban/DAG
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/[runUuid]/registry-actions.ts` — Server action to fetch ExperimentRegistry data

### Modified Files
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx` — Add tabs (Overview + Metrics Comparison), fetch baseline data
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx` — Add Experiment Config section + Go/No-Go Criteria checklist, extend AcceptanceCriterionItem interface
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/kanban-board.tsx` — Import and render GoNoGoBadge
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/dag-view.tsx` — Import and render GoNoGoBadge
- `src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx` — Add RDR document type config
- `messages/en.json` — Add i18n keys for new components
- `messages/zh.json` — Add Chinese translations

---

## Task 1: Go/No-Go Badge Component

**Files:**
- Create: `src/components/go-no-go-badge.tsx`

- [ ] **Step 1: Create the GoNoGoBadge component**

Create `src/components/go-no-go-badge.tsx` — a client component that takes acceptance criteria data and renders a colored dot with tooltip.

```typescript
"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface GoNoGoCriterion {
  metricName: string | null;
  threshold: number | null;
  operator: string | null;
  actualValue: number | null;
  required: boolean;
  isEarlyStop: boolean;
}

interface GoNoGoBadgeProps {
  criteria: GoNoGoCriterion[];
}
```

Logic:
- If `criteria.length === 0` → gray dot, tooltip "No criteria defined"
- Count: passed (actualValue meets threshold), failed, pending (actualValue is null)
- All required passed → green dot
- Any required failed → red dot
- Otherwise → yellow dot
- Tooltip: "X/Y passed, Z pending"

Render as a small 8px circle with the appropriate color, wrapped in a Tooltip from shadcn/ui.

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep "go-no-go"`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/go-no-go-badge.tsx
git commit -m "feat: add Go/No-Go badge component"
```

---

## Task 2: Add GoNoGoBadge to Kanban Board

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/kanban-board.tsx`

- [ ] **Step 1: Extend the Task interface**

Add research-specific fields to the existing `AcceptanceCriterionItem`-like data in the `Task` interface (around line 29). The `acceptanceSummary` already exists. Add a new field for the raw criteria items needed by the badge:

```typescript
interface Task {
  // ... existing fields ...
  goNoGoCriteria?: {
    metricName: string | null;
    threshold: number | null;
    operator: string | null;
    actualValue: number | null;
    required: boolean;
    isEarlyStop: boolean;
  }[];
}
```

- [ ] **Step 2: Import and render the badge**

Import `GoNoGoBadge` from `@/components/go-no-go-badge`. Render it on each Kanban card next to the existing acceptance summary display (around line 450). Only show if `task.goNoGoCriteria` has items with `metricName` set (research-mode criteria).

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit 2>&1 | grep "kanban"`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/research-projects/[uuid]/experiment-runs/kanban-board.tsx
git commit -m "feat: add Go/No-Go badge to Kanban cards"
```

---

## Task 3: Add GoNoGoBadge to DAG View

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/dag-view.tsx`

- [ ] **Step 1: Read the DAG view component**

Read `dag-view.tsx` to understand the node rendering structure and the data types it uses.

- [ ] **Step 2: Add goNoGoCriteria to the DAG node data type**

Extend the node data interface (similar to what was done for Kanban) to include `goNoGoCriteria`.

- [ ] **Step 3: Import and render GoNoGoBadge in each DAG node**

Add the badge next to the task title or status in the custom node component.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "dag-view"
git add src/app/(dashboard)/research-projects/[uuid]/experiment-runs/dag-view.tsx
git commit -m "feat: add Go/No-Go badge to DAG view nodes"
```

---

## Task 4: Extend Run Detail Panel — AcceptanceCriterion Interface + Go/No-Go Checklist

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx`

- [ ] **Step 1: Extend AcceptanceCriterionItem interface**

At line 68, add research-specific fields to the existing interface:

```typescript
interface AcceptanceCriterionItem {
  uuid: string;
  description: string;
  required: boolean;
  devStatus: string;
  devEvidence: string | null;
  status: string;
  evidence: string | null;
  sortOrder: number;
  // Research-specific Go/No-Go fields
  metricName: string | null;
  operator: string | null;
  threshold: number | null;
  isEarlyStop: boolean;
  actualValue: number | null;
}
```

- [ ] **Step 2: Add Go/No-Go Criteria section**

Find the existing acceptance criteria rendering section (around line 993). Below it (or replacing it when research criteria are present), add a "Go/No-Go Criteria" section:

For each criterion that has `metricName` set:
- Show metric name, operator + threshold (e.g., "accuracy >= 0.85")
- Show actual value or "—" if null
- Show status icon: green checkmark if passed, red X if failed, yellow clock if pending
- Show early-stop warning icon if `isEarlyStop` is true

Add a summary bar at the top:
- Count passed/failed/pending among required criteria
- Show suggested outcome: "Accepted" (all pass) / "Rejected" (any fail) / "Inconclusive"
- Use the `evaluateOperator` logic client-side:
```typescript
function evaluateOperator(actual: number, op: string, threshold: number): boolean {
  switch (op) {
    case ">=": return actual >= threshold;
    case "<=": return actual <= threshold;
    case ">": return actual > threshold;
    case "<": return actual < threshold;
    case "==": return actual === threshold;
    default: return false;
  }
}
```

Use shadcn/ui components: `Card`, `Badge`, `Separator`. Use lucide icons: `CheckCircle`, `XCircle`, `Clock`, `AlertTriangle`.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "run-detail-panel"
git add src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx
git commit -m "feat: add Go/No-Go criteria checklist to run detail panel"
```

---

## Task 5: Extend Run Detail Panel — Experiment Configuration Section

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx`
- Create: `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/[runUuid]/registry-actions.ts`

- [ ] **Step 1: Create registry server action**

Create `registry-actions.ts`:

```typescript
"use server";

import { getByRun } from "@/services/experiment-registry.service";
import { getServerAuthContext } from "@/lib/auth-server";

export async function getExperimentRegistryAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return null;
  return getByRun(auth.companyUuid, runUuid);
}
```

- [ ] **Step 2: Extend Task interface in run-detail-panel.tsx**

Add research fields to the existing Task interface (around line 90):

```typescript
interface Task {
  // ... existing fields ...
  experimentConfig: Record<string, unknown> | null;
  experimentResults: Record<string, unknown> | null;
  baselineRunUuid: string | null;
  outcome: string | null;
}
```

- [ ] **Step 3: Add Experiment Configuration section**

Above the Go/No-Go criteria section, add a collapsible "Experiment Configuration" card. Only render when `task.experimentConfig` is not null.

Content:
- **Configuration** — render `experimentConfig` JSON as a key-value table
- **Results** — render `experimentResults` JSON as a key-value table (if available)
- **Outcome** — badge (accepted: green, rejected: red, inconclusive: yellow)
- **Registry info** — fetch via `getExperimentRegistryAction` on mount. If found, show:
  - Environment (key-value table)
  - Seed value
  - Reproducibility badge (green "Verified" or gray "Unverified")
  - Start/completion timestamps

JSON key-value rendering helper:
```typescript
function JsonTable({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {Object.entries(data).map(([key, value]) => (
        <Fragment key={key}>
          <span className="font-medium text-[#6B6B6B]">{key}</span>
          <span className="text-[#2C2C2C]">{String(value)}</span>
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "run-detail-panel|registry-actions"
git add src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx \
  src/app/(dashboard)/research-projects/[uuid]/experiment-runs/[runUuid]/registry-actions.ts
git commit -m "feat: add experiment configuration panel to run detail"
```

---

## Task 6: Metrics Comparison Table Component

**Files:**
- Create: `src/app/(dashboard)/research-projects/[uuid]/dashboard/metrics-comparison-table.tsx`

- [ ] **Step 1: Create the MetricsComparisonTable client component**

```typescript
"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
```

Props:
```typescript
interface ExperimentRunData {
  uuid: string;
  title: string;
  experimentDesignUuid: string | null;
  experimentDesignTitle: string | null;
  experimentResults: Record<string, number> | null;
  outcome: string | null;
}

interface BaselineData {
  name: string;
  metrics: Record<string, number>;
}

interface MetricsComparisonTableProps {
  runs: ExperimentRunData[];
  baseline: BaselineData | null;
}
```

Implementation:
1. **State:** `mode` ("grouped" | "custom"), `selectedRunUuids` (Set for custom mode)
2. **Compute metric names:** union of all metric keys across all runs + baseline
3. **Grouped mode:** group runs by `experimentDesignUuid`, render a section per group with a sub-table
4. **Custom mode:** show checkboxes for each run, only display selected runs
5. **Table:** rows = metrics, columns = baseline (pinned) + runs. Cells show value, color-coded (green text if > baseline, red if < baseline)
6. **Column headers:** run title + outcome badge
7. **Mode toggle:** Button group at top to switch between "By Design" and "Custom Selection"

Use shadcn/ui `Table` component. Color coding: `text-green-600` for improvement, `text-red-600` for regression, neutral for equal/no baseline.

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "metrics-comparison"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/metrics-comparison-table.tsx
git commit -m "feat: add metrics comparison table component"
```

---

## Task 7: Add Metrics Tab to Dashboard Page

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`

- [ ] **Step 1: Read the current dashboard page**

Read the full `page.tsx` to understand its structure.

- [ ] **Step 2: Add tab navigation**

Convert the dashboard to use shadcn/ui `Tabs` component. Two tabs: "Overview" (existing content) and "Metrics Comparison" (new).

Import:
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricsComparisonTable } from "./metrics-comparison-table";
import { getActiveBaseline } from "@/services/baseline.service";
import { listExperimentRuns } from "@/services/experiment-run.service";
```

- [ ] **Step 3: Fetch metrics data**

In the server component, add data fetches:
```typescript
const [runs, baseline] = await Promise.all([
  listExperimentRuns(auth.companyUuid, { researchProjectUuid: uuid }),
  getActiveBaseline(auth.companyUuid, uuid),
]);
```

Transform runs into the `ExperimentRunData` shape needed by the table (extract uuid, title, experimentDesignUuid, experimentResults, outcome).

- [ ] **Step 4: Wrap existing content in Tabs**

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">{t("dashboard.overview")}</TabsTrigger>
    <TabsTrigger value="metrics">{t("dashboard.metricsComparison")}</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">
    {/* existing dashboard content */}
  </TabsContent>
  <TabsContent value="metrics">
    <MetricsComparisonTable
      runs={runsData}
      baseline={baseline ? { name: baseline.name, metrics: baseline.metrics as Record<string, number> } : null}
    />
  </TabsContent>
</Tabs>
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "dashboard/page"
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx
git commit -m "feat: add Metrics Comparison tab to research project dashboard"
```

---

## Task 8: RDR Document Type Badge

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx`

- [ ] **Step 1: Read the document detail page**

Read the full page to understand the `docTypeConfig` object.

- [ ] **Step 2: Add RDR, literature_review, methodology, results_report to docTypeConfig**

Add new document type entries to the `docTypeConfig` object (around line 16):

```typescript
const docTypeConfig: Record<string, { labelKey: string; color: string; icon: LucideIcon }> = {
  // ... existing types ...
  literature_review: { labelKey: "documents.typeLiteratureReview", color: "bg-[#E8F5E9] text-[#2E7D32]", icon: BookOpen },
  methodology: { labelKey: "documents.typeMethodology", color: "bg-[#E3F2FD] text-[#1565C0]", icon: FileEdit },
  rdr: { labelKey: "documents.typeRdr", color: "bg-[#FFF8E1] text-[#F57F17]", icon: FileText },
  results_report: { labelKey: "documents.typeResultsReport", color: "bg-[#F3E5F5] text-[#6A1B9A]", icon: ClipboardList },
};
```

Import any additional icons needed from lucide-react.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep "documentUuid"
git add src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx
git commit -m "feat: add RDR and research document type badges"
```

---

## Task 9: Add i18n Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add English i18n keys**

Add to `messages/en.json`:

```json
"dashboard": {
  "overview": "Overview",
  "metricsComparison": "Metrics Comparison"
},
"metricsTable": {
  "title": "Metrics Comparison",
  "groupedByDesign": "By Design",
  "customSelection": "Custom Selection",
  "selectRuns": "Select runs to compare",
  "noRuns": "No experiment runs with results",
  "noBaseline": "No active baseline set",
  "baseline": "Baseline",
  "metric": "Metric",
  "outcome": "Outcome",
  "improvement": "Improvement",
  "regression": "Regression"
},
"goNoGo": {
  "title": "Go/No-Go Criteria",
  "noCriteria": "No criteria defined",
  "passed": "Passed",
  "failed": "Failed",
  "pending": "Pending",
  "earlyStop": "Early Stop",
  "suggestedOutcome": "Suggested Outcome",
  "accepted": "Accepted",
  "rejected": "Rejected",
  "inconclusive": "Inconclusive",
  "summaryPassed": "{passed}/{total} passed",
  "summaryWithPending": "{passed}/{total} passed, {pending} pending"
},
"experimentConfig": {
  "title": "Experiment Configuration",
  "configuration": "Configuration",
  "results": "Results",
  "outcome": "Outcome",
  "environment": "Environment",
  "seed": "Random Seed",
  "reproducibility": "Reproducibility",
  "verified": "Verified",
  "unverified": "Unverified",
  "startedAt": "Started",
  "completedAt": "Completed",
  "noConfig": "No configuration recorded"
},
"documents": {
  "typeLiteratureReview": "Literature Review",
  "typeMethodology": "Methodology",
  "typeRdr": "Research Decision Record",
  "typeResultsReport": "Results Report"
}
```

Note: Merge these into the existing JSON structure — some parent keys like `"dashboard"` and `"documents"` may already exist. Add to them, don't replace.

- [ ] **Step 2: Add Chinese i18n keys**

Add corresponding keys to `messages/zh.json`:

```json
"dashboard": {
  "overview": "概览",
  "metricsComparison": "指标对比"
},
"metricsTable": {
  "title": "指标对比",
  "groupedByDesign": "按实验设计分组",
  "customSelection": "自定义选择",
  "selectRuns": "选择要比较的实验运行",
  "noRuns": "没有包含结果的实验运行",
  "noBaseline": "未设置活跃基线",
  "baseline": "基线",
  "metric": "指标",
  "outcome": "结果",
  "improvement": "提升",
  "regression": "下降"
},
"goNoGo": {
  "title": "通过/不通过标准",
  "noCriteria": "未定义标准",
  "passed": "通过",
  "failed": "未通过",
  "pending": "待定",
  "earlyStop": "提前终止",
  "suggestedOutcome": "建议结果",
  "accepted": "已接受",
  "rejected": "已拒绝",
  "inconclusive": "不确定",
  "summaryPassed": "{passed}/{total} 通过",
  "summaryWithPending": "{passed}/{total} 通过, {pending} 待定"
},
"experimentConfig": {
  "title": "实验配置",
  "configuration": "配置",
  "results": "结果",
  "outcome": "结果",
  "environment": "环境",
  "seed": "随机种子",
  "reproducibility": "可复现性",
  "verified": "已验证",
  "unverified": "未验证",
  "startedAt": "开始时间",
  "completedAt": "完成时间",
  "noConfig": "未记录配置"
},
"documents": {
  "typeLiteratureReview": "文献综述",
  "typeMethodology": "方法论",
  "typeRdr": "研究决策记录",
  "typeResultsReport": "结果报告"
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: add Phase 2 research UI translation keys"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Run tests**

```bash
pnpm test
```
Expected: All tests pass (existing tests should not break)

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve any Phase 2 type/lint issues"
```

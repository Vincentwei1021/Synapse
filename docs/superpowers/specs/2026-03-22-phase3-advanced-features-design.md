# Phase 3: Advanced Features Design

> Date: 2026-03-22
> Based on: docs/SYNAPSE_SPEC.md Section 8

---

## Overview

3 features: Hypothesis Board visualization, Early Stopping mechanism, Results Export for paper writing. Reproducibility Verification deferred.

---

## 1. Hypothesis Board

**Location:** New "Hypothesis Board" tab on Research Project dashboard (3rd tab after Overview and Metrics Comparison).

**Visualization:** Multi-level DAG using @xyflow/react + dagre (same stack as existing DAG view).

- **Level 1 (top):** Research Question nodes — large, blue border. Title + status.
- **Level 2 (middle):** Experiment Design nodes — medium, purple border. Title + status. Connected to source Research Question via `inputUuids`.
- **Level 3 (bottom):** Experiment Run nodes — small, color-coded by outcome: green (accepted), red (rejected), yellow (inconclusive), gray (no outcome). Connected to parent Experiment Design via `experimentDesignUuid`. Shows Go/No-Go badge.

**Data flow:**
- Server fetches: all research questions, experiment designs, experiment runs for the project
- Edges: Question → Design (via design.inputUuids), Design → Run (via run.experimentDesignUuid)
- dagre layout: top-to-bottom, rankdir=TB
- Click node → navigate to detail page

**New files:**
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/hypothesis-board.tsx` — client component
- Dashboard page.tsx — add 3rd tab

---

## 2. Early Stopping

**Trigger:** When `synapse_report_metrics` MCP tool calls `criteriaEvaluationService.evaluateCriteria` and result has `shouldStop: true`.

**Actions:**
1. Set `earlyStopTriggered = true` on the ExperimentRun (new schema field)
2. Create notification for PI/assignee: "Early stop triggered on [Run Title]"
3. Return `shouldStop: true` in MCP response (already happens)

No auto-status change — human decides whether to close the run.

**Schema change:**
```prisma
model ExperimentRun {
  earlyStopTriggered  Boolean  @default(false)
}
```

**UI:**
- Run detail panel: prominent amber warning banner when `earlyStopTriggered` is true, showing which criterion failed
- Kanban cards: small warning icon next to Go/No-Go badge

**Modified files:**
- `prisma/schema.prisma` — add field
- `src/services/criteria-evaluation.service.ts` — set flag + create notification when shouldStop
- `src/mcp/tools/researcher.ts` — pass through (already returns evaluation)
- `run-detail-panel.tsx` — warning banner
- `kanban-board.tsx` — warning icon

---

## 3. Results Export

**Location:** "Export" button on Research Project dashboard header.

**Outputs two files:**

### Markdown (`synapse-results-[project].md`)
- Project summary (counts of questions, designs, runs by outcome)
- Baseline metrics
- Per-design results table (runs as rows, metrics as columns)
- All RDR documents (full content)

### CSV (`synapse-metrics-[project].csv`)
- One row per experiment run
- Columns: run_uuid, run_title, design_title, outcome, [all metric columns]

**Implementation:**
- Server action generates both files from existing service data
- Client component: button with loading state, triggers download

**New files:**
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/export-actions.ts` — server action
- `src/app/(dashboard)/research-projects/[uuid]/dashboard/export-button.tsx` — client component
- Dashboard page — add export button to header

---

## Components Summary

| Component | File | Type | New/Modify |
|---|---|---|---|
| Hypothesis Board | `dashboard/hypothesis-board.tsx` | Client | New |
| Dashboard page (3rd tab + export button) | `dashboard/page.tsx` | Server | Modify |
| Dashboard tabs (add 3rd tab) | `dashboard/dashboard-tabs.tsx` | Client | Modify |
| Early stop schema field | `prisma/schema.prisma` | Schema | Modify |
| Criteria evaluation (set flag + notify) | `criteria-evaluation.service.ts` | Service | Modify |
| Criteria evaluation tests | `criteria-evaluation.service.test.ts` | Test | Modify |
| Run detail panel (warning banner) | `run-detail-panel.tsx` | Client | Modify |
| Kanban board (warning icon) | `kanban-board.tsx` | Client | Modify |
| Export server action | `dashboard/export-actions.ts` | Server | New |
| Export button | `dashboard/export-button.tsx` | Client | New |
| i18n keys | `messages/en.json`, `messages/zh.json` | Config | Modify |

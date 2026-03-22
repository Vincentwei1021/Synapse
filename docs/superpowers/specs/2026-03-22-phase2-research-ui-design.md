# Phase 2: Research UI Design

> Date: 2026-03-22
> Based on: docs/SYNAPSE_SPEC.md Section 7 & 8

---

## Overview

Add 4 research-specific UI components to the Synapse platform. These extend existing pages — no new routes needed.

## Decisions

- **Dashboard layout**: Hybrid — Compute Budget dropped (GPU type complexity), Metrics Comparison Table gets its own tab on the dashboard
- **Metrics table grouping**: Default grouped by Experiment Design + manual selection mode for custom comparisons
- **Go/No-Go indicators**: Simple badge on Kanban/DAG cards + full criteria checklist on Run detail panel
- **RDR viewer**: Minimal — conditional badge on existing Document detail page
- **Compute Budget Tracker**: Dropped from Phase 2 (raw hours without GPU type is misleading; revisit later with cost-based model)

---

## 1. Metrics Comparison Table

**Location:** New "Metrics Comparison" tab on Research Project dashboard (`src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`).

**Data flow:**
1. Fetch all experiment runs for the project via `experimentRunService`
2. Fetch active baseline via `baselineService.getActiveBaseline`
3. Group runs by `experimentDesignUuid` (default view)
4. Extract `experimentResults` JSON from each run

**Table structure:**
- Rows = metric names (union of all metrics across all runs)
- Columns = Baseline (pinned left) | Run A | Run B | Run C | ...
- Cells = metric value, color-coded: green if better than baseline, red if worse
- Column header = run title + outcome badge (accepted/rejected/inconclusive)

**Interactions:**
- Default view: grouped by Experiment Design, all runs shown
- Toggle: "Custom Selection" mode — checkboxes to pick specific runs to compare
- Sort by any metric column
- Baseline column always pinned on the left

**Component:** `src/app/(dashboard)/research-projects/[uuid]/dashboard/metrics-comparison-table.tsx` — client component (`"use client"`) for interactivity (tab switching, run selection, sorting).

**No new API routes or services needed** — uses existing `experimentRunService.listExperimentRuns` and `baselineService.getActiveBaseline`.

---

## 2. Go/No-Go Indicators

### Badge (Kanban cards + DAG view)

**Component:** `src/components/go-no-go-badge.tsx` — shared, reusable.

**Props:** `criteria: AcceptanceCriterion[]` (the `acceptanceCriteriaItems` from an ExperimentRun)

**Display:**
- Green dot = all required criteria with reported metrics passed
- Red dot = any required criterion failed
- Yellow dot = pending (some criteria not yet evaluated)
- Gray dot = no criteria defined
- Tooltip: "3/4 passed, 1 pending"

**Used in:**
- `kanban-board.tsx` — on each run card
- `dag-view.tsx` — on each run node

**Data:** Requires `acceptanceCriteriaItems` to be included in the experiment run list query. Check existing includes and add if missing.

### Criteria Checklist (Run detail panel)

**Location:** New collapsible section in `run-detail-panel.tsx`, titled "Go/No-Go Criteria".

**Display:**
- Summary bar: "3 passed, 1 failed, 0 pending — Suggested outcome: Rejected"
- Each criterion row:
  - Metric name (e.g., "accuracy")
  - Threshold (e.g., ">= 0.85")
  - Actual value (e.g., "0.91") or "—" if not reported
  - Status icon: green checkmark / red X / yellow clock
  - Early stop warning icon if `isEarlyStop` is true

**Data:** Read `acceptanceCriteriaItems` from the ExperimentRun, compute pass/fail client-side using the same logic as `criteriaEvaluationService.evaluateOperator`.

---

## 3. Experiment Configuration Panel

**Location:** New collapsible section in `run-detail-panel.tsx`, above Go/No-Go Criteria.

**Content:**
- `experimentConfig` JSON → formatted key-value table (hyperparameters)
- `experimentResults` JSON → formatted key-value table (when available)
- `baselineRunUuid` → link to baseline run (if set)
- `outcome` → badge (accepted / rejected / inconclusive)
- If ExperimentRegistry entry exists:
  - Environment info (software versions, hardware)
  - Random seed
  - Reproducibility badge (green checkmark if `reproducible === true`)
  - Start/completion timestamps

**Data flow:**
- `experimentConfig`, `experimentResults`, `outcome` — already on ExperimentRun model
- ExperimentRegistry — fetch via server action calling `experimentRegistryService.getByRun`

**No separate component file** — rendered as sections within the existing `run-detail-panel.tsx`.

---

## 4. RDR Viewer

**Location:** Existing Document detail page at `src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx`.

**Change:** When `document.type === "rdr"`, show a distinctive "Research Decision Record" badge in the page header. Different accent color for the card border.

**No new components** — just a conditional in the existing page.

---

## Components Summary

| Component | File | Type | New/Modify |
|---|---|---|---|
| Metrics Comparison Table | `dashboard/metrics-comparison-table.tsx` | Client | New |
| Dashboard page (add tabs) | `dashboard/page.tsx` | Server | Modify |
| Go/No-Go Badge | `src/components/go-no-go-badge.tsx` | Client | New |
| Kanban Board (add badge) | `experiment-runs/kanban-board.tsx` | Client | Modify |
| DAG View (add badge) | `experiment-runs/dag-view.tsx` | Client | Modify |
| Run Detail Panel (add sections) | `experiment-runs/run-detail-panel.tsx` | Client | Modify |
| Run Detail Actions (fetch registry) | `experiment-runs/[runUuid]/actions.ts` | Server | Modify |
| Document Detail (RDR badge) | `documents/[documentUuid]/page.tsx` | Server | Modify |

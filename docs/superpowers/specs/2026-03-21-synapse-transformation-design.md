# Synapse Transformation Design

> Chorus → Synapse: AI Research Lifecycle Platform
> Date: 2026-03-21
> Based on: docs/SYNAPSE_SPEC.md

---

## Overview

Transform Chorus (AI-driven software development platform) into Synapse (AI-driven research platform). Full deep rename of all references, model names, API routes, MCP tools, and UI strings. Implementation uses a layered approach: Schema → Backend → Frontend.

## Decisions

- **Rename strategy**: Full deep rename (Approach A). No backward compatibility with Chorus naming.
- **Model rename strategy**: Full model rename (Approach B). Prisma models, services, routes all use research terminology.
- **Implementation strategy**: Layered (Approach B). Three sub-phases executed sequentially.
- **Migration strategy**: Fresh fork, no production data. Single migration per sub-phase.

---

## 1. Schema Layer

### 1.1 Model Renames

| Current Model | New Model | DB Table (`@@map`) |
|---|---|---|
| `Idea` | `ResearchQuestion` | `research_questions` |
| `Task` | `ExperimentRun` | `experiment_runs` |
| `Proposal` | `ExperimentDesign` | `experiment_designs` |
| `Project` | `ResearchProject` | `research_projects` |
| `ElaborationRound` | `HypothesisFormulation` | `hypothesis_formulations` |
| `ElaborationQuestion` | `HypothesisFormulationQuestion` | `hypothesis_formulation_questions` |
| `TaskDependency` | `RunDependency` | `run_dependencies` |
| `SessionTaskCheckin` | `SessionRunCheckin` | `session_run_checkins` |

Models kept as-is: `Company`, `User`, `Agent`, `ApiKey`, `ProjectGroup`, `Document`, `AcceptanceCriterion`, `Comment`, `Activity`, `AgentSession`, `Notification`, `NotificationPreference`, `Mention`.

### 1.2 Field Renames Inside Models

Cross-references that used old names:

| Model | Old Field | New Field |
|---|---|---|
| `RunDependency` | `taskUuid` | `runUuid` |
| `RunDependency` | `dependsOnUuid` | `dependsOnRunUuid` |
| `SessionRunCheckin` | `taskUuid` | `runUuid` |
| `AcceptanceCriterion` | `taskUuid` | `runUuid` |
| `ExperimentRegistry` (new) | `taskUuid` | `runUuid` |
| All models referencing Project | `projectUuid` | `researchProjectUuid` |
| `ExperimentRun`, `Document` | `proposalUuid` | `experimentDesignUuid` |
| `HypothesisFormulation` | `ideaUuid` | `researchQuestionUuid` |
| `AgentSession` relation | `taskCheckins` | `runCheckins` |
| `ExperimentRun` relation | `dependsOn` / `dependedBy` | `dependsOn` / `dependedBy` (keep — generic enough) |
| `ExperimentRun` relation | `sessionCheckins` | `sessionCheckins` (keep) |
| `ExperimentRun` relation | `acceptanceCriteriaItems` | `acceptanceCriteriaItems` (keep) |

### 1.3 New Fields on Existing Models

**ResearchQuestion** (was Idea):
```prisma
hypothesisStatement  String?   // "We hypothesize that X will improve Y by Z%"
nullHypothesis       String?   // "X has no significant effect on Y"
priorWork            String?   // References to related research
researchType         String?   // "exploratory" | "confirmatory" | "replication"
```

**ExperimentRun** (was Task):
```prisma
experimentConfig     Json?     // Hyperparameters, environment, seed
experimentResults    Json?     // Structured metrics output
baselineRunUuid      String?   // Reference to baseline experiment
computeBudgetHours   Float?    // GPU/compute budget allocated
computeUsedHours     Float?    // Actual compute consumed
outcome              String?   // "accepted" | "rejected" | "inconclusive"
```

**AcceptanceCriterion**:
```prisma
metricName       String?   // e.g., "accuracy", "f1_score", "p_value"
operator         String?   // ">=" | "<=" | "<" | ">" | "=="
threshold        Float?    // e.g., 0.85, 0.05
isEarlyStop      Boolean   @default(false)
actualValue      Float?    // Filled by agent after experiment
```

### 1.4 New Models

**ExperimentRegistry**:
```prisma
model ExperimentRegistry {
  id              Int       @id @default(autoincrement())
  uuid            String    @unique @default(uuid())
  companyUuid     String
  researchProjectUuid String
  runUuid         String    // Links to ExperimentRun
  config          Json      // Full experiment configuration
  environment     Json      // Software versions, hardware specs
  seed            Int?      // Random seed for reproducibility
  startedAt       DateTime
  completedAt     DateTime?
  metrics         Json?     // Final metrics
  artifacts       Json?     // Model checkpoints, output files
  reproducible    Boolean   @default(false)
  createdAt       DateTime  @default(now())

  @@index([companyUuid])
  @@index([researchProjectUuid])
  @@index([runUuid])
}
```

**Baseline**:
```prisma
model Baseline {
  id              Int       @id @default(autoincrement())
  uuid            String    @unique @default(uuid())
  companyUuid     String
  researchProjectUuid String
  name            String    // e.g., "GPT-4 zero-shot baseline"
  metrics         Json      // { "accuracy": 0.72, "f1": 0.68, ... }
  experimentUuid  String?   // Source experiment run
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([companyUuid])
  @@index([researchProjectUuid])
}
```

### 1.5 New Document Types

Extend Document.type string union:
- `literature_review` — Background and related work
- `methodology` — Experimental methodology specification
- `rdr` — Research Decision Record (why we chose approach X over Y)
- `results_report` — Experiment results synthesis

### 1.6 Agent Roles

| Old Role | New Role |
|---|---|
| `"pm"` / `"pm_agent"` | `"research_lead"` / `"research_lead_agent"` |
| `"developer"` / `"developer_agent"` | `"researcher"` / `"researcher_agent"` |
| `"admin"` / `"admin_agent"` | `"pi"` / `"pi_agent"` |

Default role on Agent model: `@default(["researcher"])` (was `["developer"]`).

### 1.7 API Key Prefix

`cho_` → `syn_`

---

## 2. Backend Layer

### 2.1 Service Layer Renames

| Current File | New File |
|---|---|
| `idea.service.ts` | `research-question.service.ts` |
| `task.service.ts` | `experiment-run.service.ts` |
| `proposal.service.ts` | `experiment-design.service.ts` |
| `project.service.ts` | `research-project.service.ts` |
| `elaboration.service.ts` | `hypothesis-formulation.service.ts` |
| Keep: `assignment.service.ts`, `session.service.ts`, `comment.service.ts`, `notification.service.ts`, `mention.service.ts`, `activity.service.ts`, `agent.service.ts`, `user.service.ts`, `company.service.ts`, `document.service.ts`, `notification-listener.ts` | |

New services:
- `baseline.service.ts` — Baseline CRUD
- `experiment-registry.service.ts` — ExperimentRegistry CRUD
- `criteria-evaluation.service.ts` — Auto-evaluate Go/No-Go criteria vs metrics

`services/index.ts` updated to export all with new names.

All internal function/variable names update (e.g., `getIdeasByProject` → `getResearchQuestionsByProject`).

### 2.2 API Routes Renames

| Current Path | New Path |
|---|---|
| `/api/projects/` | `/api/research-projects/` |
| `/api/projects/[uuid]/tasks/` | `/api/research-projects/[uuid]/experiment-runs/` |
| `/api/projects/[uuid]/ideas/` | `/api/research-projects/[uuid]/research-questions/` |
| `/api/projects/[uuid]/proposals/` | `/api/research-projects/[uuid]/experiment-designs/` |
| `/api/projects/[uuid]/documents/` | `/api/research-projects/[uuid]/documents/` |
| `/api/projects/[uuid]/activity/` | `/api/research-projects/[uuid]/activity/` |
| `/api/projects/[uuid]/available/` | `/api/research-projects/[uuid]/available/` |
| `/api/projects/[uuid]/group/` | `/api/research-projects/[uuid]/group/` |
| `/api/ideas/[uuid]/` | `/api/research-questions/[uuid]/` |
| `/api/ideas/[uuid]/claim/` | `/api/research-questions/[uuid]/claim/` |
| `/api/ideas/[uuid]/release/` | `/api/research-questions/[uuid]/release/` |
| `/api/ideas/[uuid]/move/` | `/api/research-questions/[uuid]/move/` |
| `/api/tasks/[uuid]/` | `/api/experiment-runs/[uuid]/` |
| `/api/tasks/[uuid]/claim/` | `/api/experiment-runs/[uuid]/claim/` |
| `/api/tasks/[uuid]/release/` | `/api/experiment-runs/[uuid]/release/` |
| `/api/tasks/[uuid]/dependencies/` | `/api/experiment-runs/[uuid]/dependencies/` |
| `/api/tasks/[uuid]/sessions/` | `/api/experiment-runs/[uuid]/sessions/` |
| `/api/proposals/[uuid]/` | `/api/experiment-designs/[uuid]/` |
| `/api/proposals/[uuid]/approve/` | `/api/experiment-designs/[uuid]/approve/` |
| `/api/proposals/[uuid]/reject/` | `/api/experiment-designs/[uuid]/reject/` |
| `/api/proposals/[uuid]/close/` | `/api/experiment-designs/[uuid]/close/` |
| `/api/documents/[uuid]/` | `/api/documents/[uuid]/` (keep) |
| `/api/project-groups/` | `/api/project-groups/` (keep) |

New routes:
- `/api/research-projects/[uuid]/baselines/` — Baseline CRUD
- `/api/experiment-runs/[uuid]/registry/` — ExperimentRegistry CRUD
- `/api/experiment-runs/[uuid]/evaluate-criteria/` — Auto-evaluation trigger

### 2.3 MCP Tools

Server name: `"chorus"` → `"synapse"`

Tool file renames:
| Current | New |
|---|---|
| `tools/pm.ts` | `tools/research-lead.ts` |
| `tools/developer.ts` | `tools/researcher.ts` |
| `tools/admin.ts` | `tools/pi.ts` |
| `tools/public.ts` | Keep |
| `tools/session.ts` | Keep |

All tool name prefixes: `chorus_*` → `synapse_*`

Role checks in `server.ts`:
- `"pm"` → `"research_lead"`
- `"developer"` → `"researcher"`
- `"admin"` → `"pi"`

New tools (Phase 1, added in this pass):

Research Lead tools:
- `synapse_create_baseline` — Register baseline result
- `synapse_list_baselines` — List baselines for project
- `synapse_compare_results` — Compare run results vs baseline
- `synapse_create_rdr` — Create Research Decision Record

Researcher tools:
- `synapse_register_experiment` — Register experiment config + environment
- `synapse_report_metrics` — Report structured metrics
- `synapse_check_criteria` — Auto-evaluate Go/No-Go criteria
- `synapse_request_early_stop` — Request early termination

PI tools:
- `synapse_verify_reproducibility` — Mark experiment as verified
- `synapse_set_active_baseline` — Set current baseline

### 2.4 Auth Layer

- `src/lib/api-key.ts`: prefix `"cho_"` → `"syn_"`
- `src/types/auth.ts`: `AgentRole` type: `"pm" | "developer" | "admin"` → `"research_lead" | "researcher" | "pi"`
- `src/lib/auth.ts`: `isPmAgent()` → `isResearchLead()`, `isDeveloperAgent()` → `isResearcher()`

### 2.5 Test Files

All test files rename alongside their source files. Internal test names/variables update to match new terminology. Mock setup in `src/__mocks__/` updates Prisma model references.

---

## 3. Frontend Layer

### 3.1 Page Route Renames

| Current | New |
|---|---|
| `(dashboard)/projects/` | `(dashboard)/research-projects/` |
| `(dashboard)/projects/new/` | `(dashboard)/research-projects/new/` |
| `(dashboard)/projects/[uuid]/tasks/` | `(dashboard)/research-projects/[uuid]/experiment-runs/` |
| `(dashboard)/projects/[uuid]/tasks/[taskUuid]/` | `(dashboard)/research-projects/[uuid]/experiment-runs/[runUuid]/` |
| `(dashboard)/projects/[uuid]/ideas/` | `(dashboard)/research-projects/[uuid]/research-questions/` |
| `(dashboard)/projects/[uuid]/proposals/` | `(dashboard)/research-projects/[uuid]/experiment-designs/` |
| `(dashboard)/projects/[uuid]/documents/` | `(dashboard)/research-projects/[uuid]/documents/` |
| `(dashboard)/settings/` | Keep |
| `admin/` | Keep |

### 3.2 Component Renames

| Current | New |
|---|---|
| `task-detail-panel.tsx` | `run-detail-panel.tsx` |
| `task-view-toggle.tsx` | `run-view-toggle.tsx` |
| `tasks-page-content.tsx` | `runs-page-content.tsx` |
| `assign-task-modal.tsx` | `assign-run-modal.tsx` |
| `elaboration-panel.tsx` | `hypothesis-formulation-panel.tsx` |
| `proposal-filter.tsx` | `design-filter.tsx` |
| `create-project-dialog.tsx` | `create-research-project-dialog.tsx` |
| `move-project-confirm-dialog.tsx` | `move-research-project-confirm-dialog.tsx` |
| Keep: `kanban-board.tsx`, `dag-view.tsx`, `pixel-canvas*.tsx`, `mention-*.tsx`, `notification-*.tsx`, `assign-modal.tsx`, `*-project-group-dialog.tsx`, `markdown-content.tsx` | |

### 3.3 i18n Strings

Full terminology replacement in both `messages/en.json` and `messages/zh.json`:

| Old (en) | New (en) | New (zh) |
|---|---|---|
| Idea | Research Question | 研究问题 |
| Task | Experiment Run | 实验运行 |
| Proposal | Experiment Design | 实验设计 |
| Project | Research Project | 研究项目 |
| Elaboration | Hypothesis Formulation | 假说构建 |
| Story Points | Compute Budget | 计算预算 |
| PM Agent | Research Lead | 研究负责人 |
| Developer Agent | Research Agent | 研究代理 |
| Admin Agent | Principal Investigator | 首席研究员 |
| Chorus | Synapse | Synapse |

New i18n key groups:
- `researchQuestion.*` — hypothesis, nullHypothesis, priorWork, researchType
- `experimentRun.*` — config, results, baseline, computeBudget, outcome
- `criteria.*` — metricName, operator, threshold, earlyStop, actualValue
- `baseline.*` — name, metrics, active, source
- `experimentRegistry.*` — config, environment, seed, artifacts, reproducible

### 3.4 Middleware

`src/middleware.ts`:
- Legacy redirect patterns: `/projects/` → `/research-projects/`, `?idea=` → `?research-question=`, `?task=` → `?run=`

### 3.5 Static Assets and Docs

- `README.md` / `README.zh.md` — Rewrite for Synapse identity
- `CLAUDE.md` — Update all references and examples
- `docs/` — Update terminology in all doc files
- `public/skill/` — Update skill docs
- `public/chorus-plugin/` → `public/synapse-plugin/`
- `packages/chorus-cdk/` → `packages/synapse-cdk/`
- `docker-compose.yml`, `Dockerfile` — Update image/service names
- `package.json` — name `"chorus"` → `"synapse"`

---

## Execution Order

1. **Sub-phase 0a: Schema** — Prisma model renames + new fields + new models + migration
2. **Sub-phase 0b: Backend** — Services + API routes + MCP tools + auth + tests
3. **Sub-phase 0c: Frontend** — Pages + components + i18n + middleware + docs + static assets

Each sub-phase is verified (type-check + tests) before proceeding to the next.

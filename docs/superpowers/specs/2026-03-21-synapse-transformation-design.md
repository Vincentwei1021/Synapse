# Synapse Transformation Design

> Synapse → Synapse: AI Research Lifecycle Platform
> Date: 2026-03-21
> Based on: docs/SYNAPSE_SPEC.md
> Revision: 2 (post spec-review)

---

## Overview

Transform Synapse (AI-driven software development platform) into Synapse (AI-driven research platform). Full deep rename of all references, model names, API routes, MCP tools, and UI strings. Implementation uses a layered approach: Schema → Backend → Frontend.

## Decisions

- **Rename strategy**: Full deep rename (Approach A). No backward compatibility with Synapse naming.
- **Model rename strategy**: Full model rename (Approach B). Prisma models, services, routes all use research terminology.
- **Implementation strategy**: Layered (Approach B). Three sub-phases executed sequentially.
- **Migration strategy**: Fresh fork, no production data. Single migration per sub-phase.
- **`projectUuid` field name**: Rename to `researchProjectUuid` in all models that reference ResearchProject. This is consistent with the full deep rename strategy.
- **Status values**: Keep internal status strings as-is (`open`, `in_progress`, `to_verify`, `done`, `closed`). Only display labels change in i18n. Renaming status strings is extremely invasive and offers minimal benefit.
- **`targetType`/`entityType` string literals**: Rename to match new model names: `"task"` → `"experiment_run"`, `"idea"` → `"research_question"`, `"proposal"` → `"experiment_design"`. `"document"` stays as-is.
- **`storyPoints` field**: Remove from `ExperimentRun`. Replaced by `computeBudgetHours`.
- **ProjectGroup**: Keep model name. UI strings rename to "Research Program" via i18n.

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

Cross-references that used old model names:

| Model | Old Field | New Field |
|---|---|---|
| `RunDependency` | `taskUuid` | `runUuid` |
| `RunDependency` | `dependsOnUuid` | `dependsOnRunUuid` |
| `SessionRunCheckin` | `taskUuid` | `runUuid` |
| `AcceptanceCriterion` | `taskUuid` | `runUuid` |
| All models referencing ResearchProject | `projectUuid` | `researchProjectUuid` |
| `ExperimentRun`, `Document` | `proposalUuid` | `experimentDesignUuid` |
| `HypothesisFormulation` | `ideaUuid` | `researchQuestionUuid` |
| `AgentSession` relation | `taskCheckins` | `runCheckins` |

Models affected by `projectUuid → researchProjectUuid`: `ResearchProject` (self), `ResearchQuestion`, `ExperimentRun`, `ExperimentDesign`, `Document`, `Activity`, `Notification`, `ExperimentRegistry`, `Baseline`, `ProjectGroup`.

Fields explicitly kept as-is:
- `ExperimentRun.acceptanceCriteria` (free-text String? field) — kept as generic term
- `ExperimentRun.acceptanceCriteriaItems` (relation) — kept
- `ExperimentRun.dependsOn` / `dependedBy` (relations) — kept, generic
- `ExperimentRun.sessionCheckins` — kept

Field removed:
- `ExperimentRun.storyPoints` — removed, replaced by `computeBudgetHours`

### 1.3 `targetType`/`entityType` String Literal Renames

All polymorphic type discriminators update across the codebase:

| Old Value | New Value | Used In |
|---|---|---|
| `"task"` | `"experiment_run"` | Comment.targetType, Activity.targetType, Notification.entityType, Mention.sourceType, event-bus RealtimeEvent, uuid-resolver TargetType |
| `"idea"` | `"research_question"` | Same locations |
| `"proposal"` | `"experiment_design"` | Same locations |
| `"document"` | `"document"` | Keep |

Affected files:
- `src/lib/event-bus.ts` — RealtimeEvent interface, channel names
- `src/lib/uuid-resolver.ts` — TargetType union
- `src/services/notification-listener.ts` — all mapping tables
- `src/services/activity.service.ts`
- `src/services/comment.service.ts`
- `src/services/mention.service.ts`
- `src/mcp/tools/public.ts` — z.enum validators
- `src/mcp/tools/developer.ts`, `pm.ts`, `admin.ts`
- `src/contexts/realtime-context.tsx`
- Frontend action files in all page directories

### 1.4 NotificationPreference Field Renames

| Old Field | New Field |
|---|---|
| `taskAssigned` | `runAssigned` |
| `taskStatusChanged` | `runStatusChanged` |
| `taskVerified` | `runVerified` |
| `taskReopened` | `runReopened` |
| `proposalSubmitted` | `designSubmitted` |
| `proposalApproved` | `designApproved` |
| `proposalRejected` | `designRejected` |
| `ideaClaimed` | `researchQuestionClaimed` |
| `elaborationRequested` | `hypothesisFormulationRequested` |
| `elaborationAnswered` | `hypothesisFormulationAnswered` |
| `mentioned` | `mentioned` (keep) |

Affected files:
- `prisma/schema.prisma`
- `src/services/notification-listener.ts` (PREF_FIELD_MAP)
- `src/services/notification.service.ts`
- `src/components/notification-preferences-form.tsx`

### 1.5 New Fields on Existing Models

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
// REMOVED: storyPoints (replaced by computeBudgetHours)
```

**AcceptanceCriterion**:
```prisma
metricName       String?   // e.g., "accuracy", "f1_score", "p_value"
operator         String?   // ">=" | "<=" | "<" | ">" | "=="
threshold        Float?    // e.g., 0.85, 0.05
isEarlyStop      Boolean   @default(false)
actualValue      Float?    // Filled by agent after experiment
```

### 1.6 New Models

**ExperimentRegistry**:
```prisma
model ExperimentRegistry {
  id              Int       @id @default(autoincrement())
  uuid            String    @unique @default(uuid())
  companyUuid           String
  researchProjectUuid   String
  runUuid               String    // Links to ExperimentRun
  config                Json      // Full experiment configuration
  environment           Json      // Software versions, hardware specs
  seed                  Int?      // Random seed for reproducibility
  startedAt             DateTime
  completedAt           DateTime?
  metrics               Json?     // Final metrics
  artifacts             Json?     // Model checkpoints, output files
  reproducible          Boolean   @default(false)
  createdAt             DateTime  @default(now())

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
  companyUuid           String
  researchProjectUuid   String
  name                  String    // e.g., "GPT-4 zero-shot baseline"
  metrics               Json      // { "accuracy": 0.72, "f1": 0.68, ... }
  experimentUuid        String?   // Source experiment run
  isActive              Boolean   @default(true)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([companyUuid])
  @@index([researchProjectUuid])
}
```

### 1.7 New Document Types

Extend Document.type string union:
- `literature_review` — Background and related work
- `methodology` — Experimental methodology specification
- `rdr` — Research Decision Record (why we chose approach X over Y)
- `results_report` — Experiment results synthesis

### 1.8 Agent Roles

| Old Role | New Role |
|---|---|
| `"pm"` / `"pm_agent"` | `"research_lead"` / `"research_lead_agent"` |
| `"developer"` / `"developer_agent"` | `"researcher"` / `"researcher_agent"` |
| `"admin"` / `"admin_agent"` | `"pi"` / `"pi_agent"` |

Default role on Agent model: `@default(["researcher"])` (was `["developer"]`).

### 1.9 API Key Prefix

`syn_` → `syn_`

### 1.10 Environment Variables and Config Values

Env vars and config strings with `synapse` references:

| Location | Old Value | New Value |
|---|---|---|
| `.env.example` DATABASE_URL | `synapse:synapse@.../synapse` | `synapse:synapse@.../synapse` |
| `.env.example` REDIS_URL | `synapse-redis` | `synapse-redis` |
| `.env.example` DEFAULT_USER | `dev@synapse.local` | `dev@synapse.local` |
| `.env.example` DEFAULT_PASSWORD | `synapse123` | `synapse123` |
| Plugin env vars | `SYNAPSE_URL`, `SYNAPSE_API_KEY` | `SYNAPSE_URL`, `SYNAPSE_API_KEY` |
| `docker-compose.yml` | service/db names with `synapse` | `synapse` |
| `docker-entrypoint.sh` | any `synapse` references | `synapse` |
| `install.sh` | Stack name default `Synapse` | `Synapse` |
| `packages/synapse-cdk/` | all `synapse` references | `synapse` |
| Plugin skill docs | `SYNAPSE_URL`, `SYNAPSE_API_KEY` | `SYNAPSE_URL`, `SYNAPSE_API_KEY` |

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
| `project-group.service.ts` | `project-group.service.ts` (keep) |
| `assignment.service.ts` | Keep |
| `session.service.ts` | Keep |
| `comment.service.ts` | Keep |
| `notification.service.ts` | Keep |
| `notification-listener.ts` | Keep (internal refs update) |
| `mention.service.ts` | Keep |
| `activity.service.ts` | Keep |
| `agent.service.ts` | Keep |
| `user.service.ts` | Keep |
| `company.service.ts` | Keep |
| `document.service.ts` | Keep |

New services:
- `baseline.service.ts` — Baseline CRUD
- `experiment-registry.service.ts` — ExperimentRegistry CRUD
- `criteria-evaluation.service.ts` — Auto-evaluate Go/No-Go criteria vs metrics

`services/index.ts` updated to export all with new names. Also add missing exports: `sessionService`, `notificationService`, `userService`, `companyService`, `projectGroupService`.

All internal function/variable names update (e.g., `getIdeasByProject` → `getResearchQuestionsByProject`, `createTask` → `createExperimentRun`).

### 2.2 Test Files

All test files rename alongside their source files:

| Current | New |
|---|---|
| `__tests__/idea.service.test.ts` | `__tests__/research-question.service.test.ts` |
| `__tests__/idea.service.pure.test.ts` | `__tests__/research-question.service.pure.test.ts` |
| `__tests__/task.service.test.ts` | `__tests__/experiment-run.service.test.ts` |
| `__tests__/task.service.pure.test.ts` | `__tests__/experiment-run.service.pure.test.ts` |
| `__tests__/proposal.service.test.ts` | `__tests__/experiment-design.service.test.ts` |
| `__tests__/proposal.service.pure.test.ts` | `__tests__/experiment-design.service.pure.test.ts` |
| `__tests__/project.service.test.ts` | `__tests__/research-project.service.test.ts` |
| `__tests__/elaboration.service.test.ts` | `__tests__/hypothesis-formulation.service.test.ts` |
| `__tests__/elaboration.service.pure.test.ts` | `__tests__/hypothesis-formulation.service.pure.test.ts` |
| Other test files | Keep names, update internal refs |

Additional test-support files:
- `src/__mocks__/prisma-client.ts` — update model references
- `src/__test-utils__/fixtures.ts` (if exists) — update `makeTask`, `makeIdea`, `makeProposal`, `makeProject` helpers

### 2.3 Type Files

| Current | New |
|---|---|
| `src/types/elaboration.ts` | `src/types/hypothesis-formulation.ts` |
| `src/types/auth.ts` | Keep name, update `AgentRole` type |
| `src/types/admin.ts` | Keep |

### 2.4 API Routes Renames

| Current Path | New Path |
|---|---|
| `/api/projects/` | `/api/research-projects/` |
| `/api/projects/[uuid]/` | `/api/research-projects/[uuid]/` |
| `/api/projects/[uuid]/tasks/` | `/api/research-projects/[uuid]/experiment-runs/` |
| `/api/projects/[uuid]/tasks/dependencies/` | `/api/research-projects/[uuid]/experiment-runs/dependencies/` |
| `/api/projects/[uuid]/ideas/` | `/api/research-projects/[uuid]/research-questions/` |
| `/api/projects/[uuid]/proposals/` | `/api/research-projects/[uuid]/experiment-designs/` |
| `/api/projects/[uuid]/proposals/summary/` | `/api/research-projects/[uuid]/experiment-designs/summary/` |
| `/api/projects/[uuid]/proposals/[proposalUuid]/validate/` | `/api/research-projects/[uuid]/experiment-designs/[designUuid]/validate/` |
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
| `/api/tasks/[uuid]/dependencies/[dependsOnUuid]/` | `/api/experiment-runs/[uuid]/dependencies/[dependsOnRunUuid]/` |
| `/api/tasks/[uuid]/sessions/` | `/api/experiment-runs/[uuid]/sessions/` |
| `/api/proposals/[uuid]/` | `/api/experiment-designs/[uuid]/` |
| `/api/proposals/[uuid]/approve/` | `/api/experiment-designs/[uuid]/approve/` |
| `/api/proposals/[uuid]/reject/` | `/api/experiment-designs/[uuid]/reject/` |
| `/api/proposals/[uuid]/close/` | `/api/experiment-designs/[uuid]/close/` |
| `/api/documents/[uuid]/` | Keep |
| `/api/project-groups/` | Keep |
| `/api/project-groups/[uuid]/` | Keep |
| `/api/project-groups/[uuid]/dashboard/` | Keep |

New routes:
- `/api/research-projects/[uuid]/baselines/` — Baseline CRUD
- `/api/experiment-runs/[uuid]/registry/` — ExperimentRegistry CRUD
- `/api/experiment-runs/[uuid]/evaluate-criteria/` — Auto-evaluation trigger

### 2.5 MCP Tools

Server name: `"synapse"` → `"synapse"`

Tool file renames:
| Current | New |
|---|---|
| `tools/pm.ts` | `tools/research-lead.ts` |
| `tools/developer.ts` | `tools/researcher.ts` |
| `tools/admin.ts` | `tools/pi.ts` |
| `tools/public.ts` | Keep |
| `tools/session.ts` | Keep |

All tool name prefixes: `synapse_*` → `synapse_*`

Role checks in `server.ts`:
- `"pm"` → `"research_lead"`
- `"developer"` → `"researcher"`
- `"admin"` → `"pi"`

Register functions: `registerPmTools` → `registerResearchLeadTools`, `registerDeveloperTools` → `registerResearcherTools`, `registerAdminTools` → `registerPiTools`.

New tools (Phase 1):

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

### 2.6 Auth Layer

- `src/lib/api-key.ts`: prefix `"syn_"` → `"syn_"`
- `src/types/auth.ts`: `AgentRole` type: `"pm" | "developer" | "admin"` → `"research_lead" | "researcher" | "pi"`
- `src/lib/auth.ts`: `isPmAgent()` → `isResearchLead()`, `isDeveloperAgent()` → `isResearcher()`

### 2.7 Internal Infrastructure Renames

| Item | Old | New |
|---|---|---|
| EventBus class | `SynapseEventBus` | `SynapseEventBus` |
| EventBus global | `globalThis.synapseEventBus` | `globalThis.synapseEventBus` |
| Redis channel | `"synapse:events"` | `"synapse:events"` |
| MCP HTTP headers | `X-Synapse-Project` | `X-Synapse-Project` |
| MCP HTTP headers | `X-Synapse-Project-Group` | `X-Synapse-Project-Group` |
| Locale cookie | `synapse-locale` | `synapse-locale` |

Affected files:
- `src/lib/event-bus.ts`
- `src/app/api/mcp/route.ts`
- `src/i18n/request.ts`
- `src/contexts/locale-context.tsx`

---

## 3. Frontend Layer

### 3.1 Page Route Renames

| Current | New |
|---|---|
| `(dashboard)/projects/` | `(dashboard)/research-projects/` |
| `(dashboard)/projects/new/` | `(dashboard)/research-projects/new/` |
| `(dashboard)/projects/[uuid]/` (all sub-routes) | `(dashboard)/research-projects/[uuid]/` |
| `.../[uuid]/tasks/` | `.../[uuid]/experiment-runs/` |
| `.../[uuid]/tasks/[taskUuid]/` | `.../[uuid]/experiment-runs/[runUuid]/` |
| `.../[uuid]/ideas/` | `.../[uuid]/research-questions/` |
| `.../[uuid]/ideas/[ideaUuid]/` | `.../[uuid]/research-questions/[questionUuid]/` |
| `.../[uuid]/proposals/` | `.../[uuid]/experiment-designs/` |
| `.../[uuid]/proposals/new/` | `.../[uuid]/experiment-designs/new/` |
| `.../[uuid]/proposals/[proposalUuid]/` | `.../[uuid]/experiment-designs/[designUuid]/` |
| `.../[uuid]/documents/` | `.../[uuid]/documents/` (keep) |
| `.../[uuid]/documents/[documentUuid]/` | Keep |
| `.../[uuid]/dashboard/` | `.../[uuid]/dashboard/` (keep path, update content) |
| `.../[uuid]/activity/` | `.../[uuid]/activity/` (keep path, update content) |
| `(dashboard)/settings/` | Keep |
| `admin/` | Keep |

### 3.2 Component Renames

Components under `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/`:
| Current | New |
|---|---|
| `task-detail-panel.tsx` | `run-detail-panel.tsx` |
| `task-view-toggle.tsx` | `run-view-toggle.tsx` |
| `tasks-page-content.tsx` | `runs-page-content.tsx` |
| `assign-task-modal.tsx` | `assign-run-modal.tsx` |
| `task-status-progress.tsx` (if exists) | `run-status-progress.tsx` |
| `task-actions.ts` (if exists) | `run-actions.ts` |
| `task-draft-detail-panel.tsx` (if exists) | `run-draft-detail-panel.tsx` |

Components under `src/app/(dashboard)/research-projects/[uuid]/research-questions/`:
| Current | New |
|---|---|
| `assign-idea-modal.tsx` (if exists) | `assign-question-modal.tsx` |
| `idea-create-form.tsx` (if exists) | `question-create-form.tsx` |
| `idea-detail-panel.tsx` (if exists) | `question-detail-panel.tsx` |
| `ideas-list.tsx` (if exists) | `questions-list.tsx` |
| `ideas-page-content.tsx` (if exists) | `questions-page-content.tsx` |

Components under `src/app/(dashboard)/research-projects/[uuid]/experiment-designs/`:
| Current | New |
|---|---|
| `proposal-kanban.tsx` (if exists) | `design-kanban.tsx` |
| `proposal-editor.tsx` (if exists) | `design-editor.tsx` |
| `proposal-actions.tsx` (if exists) | `design-actions.tsx` |
| `proposal-comments.tsx` (if exists) | `design-comments.tsx` |
| `proposal-validation-checklist.tsx` (if exists) | `design-validation-checklist.tsx` |
| `source-ideas-card.tsx` (if exists) | `source-questions-card.tsx` |
| `create-proposal-form.tsx` (if exists) | `create-design-form.tsx` |

Shared components under `src/components/`:
| Current | New |
|---|---|
| `elaboration-panel.tsx` | `hypothesis-formulation-panel.tsx` |
| `proposal-filter.tsx` | `design-filter.tsx` |
| `create-project-dialog.tsx` | `create-research-project-dialog.tsx` |
| `move-project-confirm-dialog.tsx` | `move-research-project-confirm-dialog.tsx` |
| Keep: `kanban-board.tsx`, `dag-view.tsx`, `pixel-canvas*.tsx`, `mention-*.tsx`, `notification-*.tsx`, `assign-modal.tsx`, `*-project-group-dialog.tsx`, `markdown-content.tsx` | |

Server action files (`actions.ts`, `comment-actions.ts`, `activity-actions.ts`, `criteria-actions.ts`, `dependency-actions.ts`, `elaboration-actions.ts`, `session-actions.ts`, `source-actions.ts`) — rename follows parent directory. Internal refs update to new service names and field names.

### 3.3 i18n Strings

Full terminology replacement in both `messages/en.json` and `messages/zh.json`:

| Old (en) | New (en) | New (zh) |
|---|---|---|
| Idea | Research Question | 研究问题 |
| Task | Experiment Run | 实验运行 |
| Proposal | Experiment Design | 实验设计 |
| Project | Research Project | 研究项目 |
| Project Group | Research Program | 研究计划 |
| Elaboration | Hypothesis Formulation | 假说构建 |
| Acceptance Criteria | Go/No-Go Criteria | 通过/不通过标准 |
| Story Points | Compute Budget | 计算预算 |
| PM Agent | Research Lead | 研究负责人 |
| Developer Agent | Research Agent | 研究代理 |
| Admin Agent | Principal Investigator | 首席研究员 |
| Synapse | Synapse | Synapse |

Note: "Experiment Plan" (the task-breakdown aspect of an Experiment Design) should appear in relevant i18n strings where Proposals currently distinguish "PRD" vs "task breakdown" content.

New i18n key groups:
- `researchQuestion.*` — hypothesis, nullHypothesis, priorWork, researchType
- `experimentRun.*` — config, results, baseline, computeBudget, outcome
- `criteria.*` — metricName, operator, threshold, earlyStop, actualValue
- `baseline.*` — name, metrics, active, source
- `experimentRegistry.*` — config, environment, seed, artifacts, reproducible

### 3.4 Middleware

`src/middleware.ts`:
- Legacy redirect patterns update: `/projects/` → `/research-projects/`, `?idea=` → `?research-question=`, `?task=` → `?run=`
- Existing legacy redirects also update to new paths

### 3.5 Static Assets, Docs, and Config

| Item | Action |
|---|---|
| `package.json` | name `"synapse"` → `"synapse"` |
| `README.md` / `README.zh.md` | Rewrite for Synapse identity |
| `CLAUDE.md` | Update all references, terminology, examples |
| `docs/` | Update terminology in all doc files |
| `public/skill/` | Update skill docs (Synapse → Synapse terminology) |
| `public/synapse-plugin/` | Rename to `public/synapse-plugin/`, update all content |
| `packages/synapse-cdk/` | Rename to `packages/synapse-cdk/`, update package name |
| `packages/openclaw-plugin/` | Update Synapse refs, role terminology, `syn_` → `syn_` |
| `.claude-plugin/marketplace.json` | Update `"synapse-plugins"` → `"synapse-plugins"`, plugin name |
| `.claude/settings.json` | Update any Synapse references |
| `docker-compose.yml` | Update service/image names |
| `Dockerfile` | Update labels, references |
| `docker-entrypoint.sh` | Update any Synapse references |
| `pnpm-workspace.yaml` | Update if package names changed |

---

## Execution Order

1. **Sub-phase 0a: Schema** — Prisma model renames + field renames + new fields + new models + remove storyPoints + NotificationPreference field renames + migration
2. **Sub-phase 0b: Backend** — Services + API routes + MCP tools + auth + types + event-bus + headers + tests + mocks
3. **Sub-phase 0c: Frontend** — Pages + components + i18n + middleware + locale cookie + docs + static assets + plugin + CDK

Each sub-phase is verified (type-check + tests) before proceeding to the next.

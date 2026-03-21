# Synapse Transformation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Chorus into Synapse — an AI Research Lifecycle Platform — by renaming all models, services, routes, MCP tools, UI strings, and adding research-specific features.

**Architecture:** Layered transformation: Schema (Prisma models + fields) → Backend (services, routes, MCP, auth) → Frontend (pages, components, i18n, docs). Each layer builds on the previous. Existing tests serve as regression verification after each rename phase. New features (Baseline, ExperimentRegistry, criteria-evaluation) use TDD.

**Tech Stack:** Next.js 15, TypeScript 5, Prisma 7, PostgreSQL, React 19, Tailwind CSS 4, shadcn/ui, MCP SDK 1.26, Vitest 4

**Spec:** `docs/superpowers/specs/2026-03-21-synapse-transformation-design.md`

---

## File Structure Overview

### Renamed Files (existing → new)

**Schema:**
- `prisma/schema.prisma` — rewrite in-place (model renames, field renames, new fields, new models)

**Types:**
- `src/types/auth.ts` — update AgentRole type
- `src/types/elaboration.ts` → `src/types/hypothesis-formulation.ts`

**Lib:**
- `src/lib/api-key.ts` — `cho_` → `syn_`
- `src/lib/auth.ts` — role helpers rename
- `src/lib/event-bus.ts` — `ChorusEventBus` → `SynapseEventBus`
- `src/lib/uuid-resolver.ts` — TargetType values
- `src/i18n/request.ts` — `chorus-locale` → `synapse-locale`

**Services:**
- `src/services/idea.service.ts` → `src/services/research-question.service.ts`
- `src/services/task.service.ts` → `src/services/experiment-run.service.ts`
- `src/services/proposal.service.ts` → `src/services/experiment-design.service.ts`
- `src/services/project.service.ts` → `src/services/research-project.service.ts`
- `src/services/elaboration.service.ts` → `src/services/hypothesis-formulation.service.ts`
- `src/services/index.ts` — update exports
- All other services — update internal references (model names, field names)

**MCP:**
- `src/mcp/server.ts` — name, roles, register functions
- `src/mcp/tools/pm.ts` → `src/mcp/tools/research-lead.ts`
- `src/mcp/tools/developer.ts` → `src/mcp/tools/researcher.ts`
- `src/mcp/tools/admin.ts` → `src/mcp/tools/pi.ts`
- `src/mcp/tools/public.ts`, `session.ts` — update tool name prefixes + entity types

**API Routes (directory renames):**
- `src/app/api/projects/` → `src/app/api/research-projects/`
- `src/app/api/ideas/` → `src/app/api/research-questions/`
- `src/app/api/tasks/` → `src/app/api/experiment-runs/`
- `src/app/api/proposals/` → `src/app/api/experiment-designs/`
- `src/app/api/mcp/route.ts` — header renames

**Frontend Pages (directory renames):**
- `src/app/(dashboard)/projects/` → `src/app/(dashboard)/research-projects/`
- All nested directories follow (ideas→research-questions, tasks→experiment-runs, proposals→experiment-designs)

**Frontend Components:**
- `src/components/elaboration-panel.tsx` → `hypothesis-formulation-panel.tsx`
- `src/components/proposal-filter.tsx` → `design-filter.tsx`
- `src/components/create-project-dialog.tsx` → `create-research-project-dialog.tsx`
- `src/components/move-project-confirm-dialog.tsx` → `move-research-project-confirm-dialog.tsx`
- Page-local components follow directory renames

**i18n:**
- `messages/en.json` — full terminology replacement
- `messages/zh.json` — full terminology replacement

**Config/Docs:**
- `package.json`, `.env.example`, `docker-compose.yml`, `Dockerfile`, `docker-entrypoint.sh`, `install.sh`
- `README.md`, `README.zh.md`, `CLAUDE.md`, `CHANGELOG.md`
- `public/chorus-plugin/` → `public/synapse-plugin/`
- `packages/chorus-cdk/` → `packages/synapse-cdk/`
- `.claude-plugin/marketplace.json`

### New Files

**Services:**
- `src/services/baseline.service.ts`
- `src/services/experiment-registry.service.ts`
- `src/services/criteria-evaluation.service.ts`

**Tests:**
- `src/services/__tests__/baseline.service.test.ts`
- `src/services/__tests__/experiment-registry.service.test.ts`
- `src/services/__tests__/criteria-evaluation.service.test.ts`

**API Routes:**
- `src/app/api/research-projects/[uuid]/baselines/route.ts`
- `src/app/api/experiment-runs/[uuid]/registry/route.ts`
- `src/app/api/experiment-runs/[uuid]/evaluate-criteria/route.ts`

---

## Phase 0a: Schema Layer

### Task 1: Rewrite Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Read the current schema**

Read `prisma/schema.prisma` to understand all 21 models, their fields, relations, and indexes.

- [ ] **Step 2: Rename models and add @@map**

Apply these model renames with `@@map` to preserve DB table mapping:

```
Idea              → ResearchQuestion              @@map("Idea")
Task              → ExperimentRun                 @@map("Task")
Proposal          → ExperimentDesign              @@map("Proposal")
Project           → ResearchProject               @@map("Project")
ElaborationRound  → HypothesisFormulation         @@map("ElaborationRound")
ElaborationQuestion → HypothesisFormulationQuestion @@map("ElaborationQuestion")
TaskDependency    → RunDependency                 @@map("TaskDependency")
SessionTaskCheckin → SessionRunCheckin            @@map("SessionTaskCheckin")
```

For each renamed model, update:
- The `model X {` declaration
- Add `@@map("OldName")` to preserve DB table name
- Update all `@relation` references that point to the old model name
- Update all relation fields in OTHER models that reference this model

- [ ] **Step 3: Rename fields across all models**

Apply these field renames (update both the field declaration and any `@relation(fields: [...])` / `@@index([...])` that reference them):

| Model | Old Field | New Field |
|---|---|---|
| All models with `projectUuid` | `projectUuid` | `researchProjectUuid` |
| `RunDependency` | `taskUuid` | `runUuid` |
| `RunDependency` | `dependsOnUuid` | `dependsOnRunUuid` |
| `SessionRunCheckin` | `taskUuid` | `runUuid` |
| `AcceptanceCriterion` | `taskUuid` | `runUuid` |
| `ExperimentRun`, `Document` | `proposalUuid` | `experimentDesignUuid` |
| `HypothesisFormulation` | `ideaUuid` | `researchQuestionUuid` |

Also rename relation fields:
- `AgentSession.taskCheckins` → `runCheckins`
- All `@relation(fields: [oldField])` must reference the new field name
- All `@@index([oldField])` must reference the new field name

Also update `@@map` on renamed fields to preserve DB column names, e.g.:
```prisma
researchProjectUuid String @map("projectUuid")
```

- [ ] **Step 4: Remove storyPoints, add new fields**

On `ExperimentRun` (was Task):
- Remove `storyPoints Float?`
- Add:
```prisma
experimentConfig     Json?
experimentResults    Json?
baselineRunUuid      String?
computeBudgetHours   Float?
computeUsedHours     Float?
outcome              String?   // "accepted" | "rejected" | "inconclusive"
```

On `ResearchQuestion` (was Idea):
- Add:
```prisma
hypothesisStatement  String?
nullHypothesis       String?
priorWork            String?
researchType         String?   // "exploratory" | "confirmatory" | "replication"
```

On `AcceptanceCriterion`:
- Add:
```prisma
metricName       String?
operator         String?   // ">=" | "<=" | "<" | ">" | "=="
threshold        Float?
isEarlyStop      Boolean   @default(false)
actualValue      Float?
```

- [ ] **Step 5: Rename NotificationPreference fields**

```
taskAssigned          → runAssigned           @map("taskAssigned")
taskStatusChanged     → runStatusChanged      @map("taskStatusChanged")
taskVerified          → runVerified           @map("taskVerified")
taskReopened          → runReopened           @map("taskReopened")
proposalSubmitted     → designSubmitted       @map("proposalSubmitted")
proposalApproved      → designApproved        @map("proposalApproved")
proposalRejected      → designRejected        @map("proposalRejected")
ideaClaimed           → researchQuestionClaimed @map("ideaClaimed")
elaborationRequested  → hypothesisFormulationRequested @map("elaborationRequested")
elaborationAnswered   → hypothesisFormulationAnswered  @map("elaborationAnswered")
```

- [ ] **Step 6: Add new models**

Add `ExperimentRegistry` and `Baseline` models exactly as specified in the design doc section 1.6.

- [ ] **Step 7: Update Agent default roles**

Change `roles String[] @default(["developer"])` to `roles String[] @default(["researcher"])`.

- [ ] **Step 8: Verify schema syntax**

Run: `npx prisma format`
Expected: No errors, schema formatted successfully.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: rename models and fields, add research-specific entities"
```

### Task 2: Generate Prisma Migration

**Files:**
- Modify: `prisma/migrations/` (new migration created)
- Modify: `src/generated/prisma/` (regenerated client)

- [ ] **Step 1: Delete old migrations directory**

Since this is a fresh fork with no production data, wipe migration history and start fresh:
```bash
rm -rf prisma/migrations
```

- [ ] **Step 2: Generate fresh migration**

This requires a running PostgreSQL instance:
```bash
pnpm docker:db
# Wait for DB to be ready, then:
DATABASE_URL="postgresql://chorus:chorus@localhost:5432/chorus" npx prisma migrate dev --name synapse_init
```

If the database doesn't exist or has old schema, reset it first:
```bash
DATABASE_URL="postgresql://chorus:chorus@localhost:5432/chorus" npx prisma migrate reset --force
```

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

Verify the generated client has the new model names by checking `src/generated/prisma/` for `ResearchQuestion`, `ExperimentRun`, etc.

- [ ] **Step 4: Commit**

```bash
git add prisma/ src/generated/
git commit -m "schema: generate fresh migration for Synapse models"
```

---

## Phase 0b: Backend Layer

### Task 3: Update Type Definitions

**Files:**
- Modify: `src/types/auth.ts`
- Rename: `src/types/elaboration.ts` → `src/types/hypothesis-formulation.ts`

- [ ] **Step 1: Update auth types**

In `src/types/auth.ts`:
- Change `AgentRole` type from `"pm" | "developer" | "admin"` to `"research_lead" | "researcher" | "pi"`
- Update any role-related comments
- Rename any interface fields that reference old terminology (e.g., `isPm` → `isResearchLead`)

- [ ] **Step 2: Rename elaboration types**

```bash
git mv src/types/elaboration.ts src/types/hypothesis-formulation.ts
```

Update the file content: rename all `Elaboration` → `HypothesisFormulation`, `elaboration` → `hypothesisFormulation`, `Idea` references → `ResearchQuestion`, `ideaUuid` → `researchQuestionUuid`.

- [ ] **Step 3: Commit**

```bash
git add src/types/
git commit -m "types: rename AgentRole values and elaboration types"
```

### Task 4: Update Lib Layer

**Files:**
- Modify: `src/lib/api-key.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/event-bus.ts`
- Modify: `src/lib/uuid-resolver.ts`
- Modify: `src/lib/redis.ts`
- Modify: `src/i18n/request.ts`
- Modify: `src/contexts/locale-context.tsx`

- [ ] **Step 1: Update api-key.ts**

Replace all `"cho_"` → `"syn_"` including:
- Key generation prefix
- Key validation prefix check
- Comments referencing the prefix

- [ ] **Step 2: Update auth.ts**

- `isPmAgent()` → `isResearchLead()`
- `isDeveloperAgent()` → `isResearcher()`
- Update role checks: `"pm"` → `"research_lead"`, `"developer"` → `"researcher"`, `"admin"` → `"pi"`
- Also support old format: `"pm_agent"` → `"research_lead_agent"`, `"developer_agent"` → `"researcher_agent"`, `"admin_agent"` → `"pi_agent"`
- Update all comments referencing old terminology

- [ ] **Step 3: Update event-bus.ts**

- `class ChorusEventBus` → `class SynapseEventBus`
- `globalThis.chorusEventBus` → `globalThis.synapseEventBus`
- Redis channel `"chorus:events"` → `"synapse:events"`
- Update `RealtimeEvent` interface: entity type values `"task"` → `"experiment_run"`, `"idea"` → `"research_question"`, `"proposal"` → `"experiment_design"`
- All comments mentioning "Chorus" → "Synapse"

- [ ] **Step 4: Update uuid-resolver.ts**

Update `TargetType` union: `"task"` → `"experiment_run"`, `"idea"` → `"research_question"`, `"proposal"` → `"experiment_design"`. `"document"` stays.

Update any resolver functions that map between entity types and Prisma models.

- [ ] **Step 5: Update locale cookie name**

In `src/i18n/request.ts`: `"chorus-locale"` → `"synapse-locale"`
In `src/contexts/locale-context.tsx`: `"chorus-locale"` → `"synapse-locale"`

- [ ] **Step 6: Update redis.ts**

Update any `chorus` references in connection naming or channel prefixes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ src/i18n/ src/contexts/locale-context.tsx
git commit -m "lib: rename api-key prefix, auth roles, event-bus, locale cookie"
```

### Task 5: Rename Service — idea → research-question

**Files:**
- Rename: `src/services/idea.service.ts` → `src/services/research-question.service.ts`
- Rename: `src/services/__tests__/idea.service.test.ts` → `src/services/__tests__/research-question.service.test.ts`
- Rename: `src/services/__tests__/idea.service.pure.test.ts` → `src/services/__tests__/research-question.service.pure.test.ts`

- [ ] **Step 1: Rename files**

```bash
git mv src/services/idea.service.ts src/services/research-question.service.ts
git mv src/services/__tests__/idea.service.test.ts src/services/__tests__/research-question.service.test.ts
git mv src/services/__tests__/idea.service.pure.test.ts src/services/__tests__/research-question.service.pure.test.ts
```

- [ ] **Step 2: Update service content**

In `src/services/research-question.service.ts`:
- All function names: `createIdea` → `createResearchQuestion`, `getIdeasByProject` → `getResearchQuestionsByProject`, etc.
- Prisma model references: `prisma.idea` → `prisma.researchQuestion`
- Field references: `projectUuid` → `researchProjectUuid`, `ideaUuid` → `researchQuestionUuid`
- Type annotations: `Idea` → `ResearchQuestion`
- `targetType: "idea"` → `targetType: "research_question"`
- All comments

- [ ] **Step 3: Update test content**

Same transformations in both test files. Update mock model names, function call names, expected values.

- [ ] **Step 4: Commit**

```bash
git add src/services/research-question.service.ts src/services/__tests__/research-question.service.*
git commit -m "service: rename idea → research-question"
```

### Task 6: Rename Service — task → experiment-run

**Files:**
- Rename: `src/services/task.service.ts` → `src/services/experiment-run.service.ts`
- Rename: `src/services/__tests__/task.service.test.ts` → `src/services/__tests__/experiment-run.service.test.ts`
- Rename: `src/services/__tests__/task.service.pure.test.ts` → `src/services/__tests__/experiment-run.service.pure.test.ts`

- [ ] **Step 1: Rename files**

```bash
git mv src/services/task.service.ts src/services/experiment-run.service.ts
git mv src/services/__tests__/task.service.test.ts src/services/__tests__/experiment-run.service.test.ts
git mv src/services/__tests__/task.service.pure.test.ts src/services/__tests__/experiment-run.service.pure.test.ts
```

- [ ] **Step 2: Update service content**

In `src/services/experiment-run.service.ts`:
- Function names: `createTask` → `createExperimentRun`, `getTasksByProject` → `getExperimentRunsByProject`, etc.
- Prisma: `prisma.task` → `prisma.experimentRun`, `prisma.taskDependency` → `prisma.runDependency`, `prisma.sessionTaskCheckin` → `prisma.sessionRunCheckin`
- Fields: `projectUuid` → `researchProjectUuid`, `taskUuid` → `runUuid`, `proposalUuid` → `experimentDesignUuid`, `storyPoints` → `computeBudgetHours`, `dependsOnUuid` → `dependsOnRunUuid`
- Types: `Task` → `ExperimentRun`, `TaskDependency` → `RunDependency`
- `targetType: "task"` → `targetType: "experiment_run"`
- Remove any `storyPoints` references, replace with `computeBudgetHours`

- [ ] **Step 3: Update test content**

Same transformations in both test files.

- [ ] **Step 4: Commit**

```bash
git add src/services/experiment-run.service.ts src/services/__tests__/experiment-run.service.*
git commit -m "service: rename task → experiment-run"
```

### Task 7: Rename Service — proposal → experiment-design

**Files:**
- Rename: `src/services/proposal.service.ts` → `src/services/experiment-design.service.ts`
- Rename: `src/services/__tests__/proposal.service.test.ts` → `src/services/__tests__/experiment-design.service.test.ts`
- Rename: `src/services/__tests__/proposal.service.pure.test.ts` → `src/services/__tests__/experiment-design.service.pure.test.ts`

- [ ] **Step 1: Rename files**

```bash
git mv src/services/proposal.service.ts src/services/experiment-design.service.ts
git mv src/services/__tests__/proposal.service.test.ts src/services/__tests__/experiment-design.service.test.ts
git mv src/services/__tests__/proposal.service.pure.test.ts src/services/__tests__/experiment-design.service.pure.test.ts
```

- [ ] **Step 2: Update service content**

- Function names: `createProposal` → `createExperimentDesign`, etc.
- Prisma: `prisma.proposal` → `prisma.experimentDesign`
- Fields: `projectUuid` → `researchProjectUuid`, `proposalUuid` → `experimentDesignUuid`
- Types: `Proposal` → `ExperimentDesign`
- `targetType: "proposal"` → `targetType: "experiment_design"`
- When proposal creates tasks on approval, update to: creates ExperimentRuns
- `taskDrafts` field in the JSON → keep field name (it's stored JSON), but update code comments
- `documentDrafts` → keep field name

- [ ] **Step 3: Update test content**

Same transformations in both test files.

- [ ] **Step 4: Commit**

```bash
git add src/services/experiment-design.service.ts src/services/__tests__/experiment-design.service.*
git commit -m "service: rename proposal → experiment-design"
```

### Task 8: Rename Service — project → research-project, elaboration → hypothesis-formulation

**Files:**
- Rename: `src/services/project.service.ts` → `src/services/research-project.service.ts`
- Rename: `src/services/__tests__/project.service.test.ts` → `src/services/__tests__/research-project.service.test.ts`
- Rename: `src/services/elaboration.service.ts` → `src/services/hypothesis-formulation.service.ts`
- Rename: `src/services/__tests__/elaboration.service.test.ts` → `src/services/__tests__/hypothesis-formulation.service.test.ts`
- Rename: `src/services/__tests__/elaboration.service.pure.test.ts` → `src/services/__tests__/hypothesis-formulation.service.pure.test.ts`

- [ ] **Step 1: Rename files**

```bash
git mv src/services/project.service.ts src/services/research-project.service.ts
git mv src/services/__tests__/project.service.test.ts src/services/__tests__/research-project.service.test.ts
git mv src/services/elaboration.service.ts src/services/hypothesis-formulation.service.ts
git mv src/services/__tests__/elaboration.service.test.ts src/services/__tests__/hypothesis-formulation.service.test.ts
git mv src/services/__tests__/elaboration.service.pure.test.ts src/services/__tests__/hypothesis-formulation.service.pure.test.ts
```

- [ ] **Step 2: Update project service content**

- Function names: `createProject` → `createResearchProject`, etc.
- Prisma: `prisma.project` → `prisma.researchProject`
- Fields: `projectUuid` → `researchProjectUuid`
- Types: `Project` → `ResearchProject`

- [ ] **Step 3: Update elaboration service content**

- Function names: `createElaborationRound` → `createHypothesisFormulation`, etc.
- Prisma: `prisma.elaborationRound` → `prisma.hypothesisFormulation`, `prisma.elaborationQuestion` → `prisma.hypothesisFormulationQuestion`
- Fields: `ideaUuid` → `researchQuestionUuid`, `projectUuid` → `researchProjectUuid`
- Types: `ElaborationRound` → `HypothesisFormulation`, `ElaborationQuestion` → `HypothesisFormulationQuestion`
- Import path: update from `@/types/elaboration` to `@/types/hypothesis-formulation`

- [ ] **Step 4: Update test content**

Same transformations in all test files.

- [ ] **Step 5: Commit**

```bash
git add src/services/research-project.service.ts src/services/__tests__/research-project.service.* \
  src/services/hypothesis-formulation.service.ts src/services/__tests__/hypothesis-formulation.service.*
git commit -m "service: rename project → research-project, elaboration → hypothesis-formulation"
```

### Task 9: Update Remaining Services

**Files:**
- Modify: `src/services/activity.service.ts`
- Modify: `src/services/assignment.service.ts`
- Modify: `src/services/session.service.ts`
- Modify: `src/services/notification.service.ts`
- Modify: `src/services/notification-listener.ts`
- Modify: `src/services/mention.service.ts`
- Modify: `src/services/comment.service.ts`
- Modify: `src/services/document.service.ts`
- Modify: `src/services/agent.service.ts`
- Modify: `src/services/company.service.ts`
- Modify: `src/services/user.service.ts`
- Modify: `src/services/project-group.service.ts`
- Modify: `src/services/index.ts`
- Modify: All corresponding `__tests__/` files

These services keep their filenames but ALL internal references must update:

- [ ] **Step 1: Update activity.service.ts**

- Prisma: `prisma.activity` stays, but field refs change: `projectUuid` → `researchProjectUuid`
- `targetType` values: `"task"` → `"experiment_run"`, `"idea"` → `"research_question"`, `"proposal"` → `"experiment_design"`
- Import paths for renamed services

- [ ] **Step 2: Update assignment.service.ts**

- Prisma model refs: `prisma.task` → `prisma.experimentRun`, `prisma.idea` → `prisma.researchQuestion`
- Field refs: `projectUuid` → `researchProjectUuid`, `taskUuid` → `runUuid`
- Function names if they reference task/idea

- [ ] **Step 3: Update session.service.ts**

- `prisma.sessionTaskCheckin` → `prisma.sessionRunCheckin`
- `prisma.agentSession` stays
- Field refs: `taskUuid` → `runUuid`, `taskCheckins` → `runCheckins`

- [ ] **Step 4: Update notification.service.ts and notification-listener.ts**

- `notification-listener.ts` has PREF_FIELD_MAP — update all keys to new NotificationPreference field names
- Entity type values: `"task"` → `"experiment_run"`, `"idea"` → `"research_question"`, `"proposal"` → `"experiment_design"`
- Prisma model refs for tasks, ideas, proposals
- Field refs throughout

- [ ] **Step 5: Update mention.service.ts, comment.service.ts**

- `targetType`/`sourceType` values: same entity type renames
- Prisma model refs, field refs

- [ ] **Step 6: Update document.service.ts**

- Field: `projectUuid` → `researchProjectUuid`, `proposalUuid` → `experimentDesignUuid`
- Prisma: model stays `prisma.document`

- [ ] **Step 7: Update agent.service.ts**

- Default role references: `"developer"` → `"researcher"`
- Field: any `projectUuid` → `researchProjectUuid`

- [ ] **Step 8: Update company.service.ts, user.service.ts, project-group.service.ts**

- Field: `projectUuid` → `researchProjectUuid` where applicable
- Prisma: `prisma.project` → `prisma.researchProject` in project-group.service.ts

- [ ] **Step 9: Update services/index.ts**

```typescript
export * as researchQuestionService from "./research-question.service";
export * as experimentRunService from "./experiment-run.service";
export * as experimentDesignService from "./experiment-design.service";
export * as researchProjectService from "./research-project.service";
export * as hypothesisFormulationService from "./hypothesis-formulation.service";
// Keep unchanged:
export * as agentService from "./agent.service";
export * as commentService from "./comment.service";
export * as activityService from "./activity.service";
export * as assignmentService from "./assignment.service";
export * as sessionService from "./session.service";
export * as notificationService from "./notification.service";
export * as mentionService from "./mention.service";
export * as documentService from "./document.service";
export * as userService from "./user.service";
export * as companyService from "./company.service";
export * as projectGroupService from "./project-group.service";
```

- [ ] **Step 10: Update all corresponding test files**

Update all `__tests__/*.test.ts` files for the services modified above. Same field/model/type transformations.

- [ ] **Step 11: Update mocks**

In `src/__mocks__/prisma-client.ts`: update model names in the mock object.
In `src/lib/__mocks__/prisma.ts`: same.
In `src/lib/__mocks__/event-bus.ts`: update class name if referenced.

- [ ] **Step 12: Commit**

```bash
git add src/services/ src/__mocks__/ src/lib/__mocks__/
git commit -m "service: update all remaining services with new model/field names"
```

### Task 10: Rename MCP Tools

**Files:**
- Modify: `src/mcp/server.ts`
- Rename: `src/mcp/tools/pm.ts` → `src/mcp/tools/research-lead.ts`
- Rename: `src/mcp/tools/developer.ts` → `src/mcp/tools/researcher.ts`
- Rename: `src/mcp/tools/admin.ts` → `src/mcp/tools/pi.ts`
- Modify: `src/mcp/tools/public.ts`
- Modify: `src/mcp/tools/session.ts`
- Modify: `src/mcp/tools/schema-utils.ts`
- Modify: `src/mcp/__tests__/public-tools-proposalUuids.test.ts`

- [ ] **Step 1: Rename tool files**

```bash
git mv src/mcp/tools/pm.ts src/mcp/tools/research-lead.ts
git mv src/mcp/tools/developer.ts src/mcp/tools/researcher.ts
git mv src/mcp/tools/admin.ts src/mcp/tools/pi.ts
```

- [ ] **Step 2: Update server.ts**

```typescript
import { registerResearchLeadTools } from "./tools/research-lead";
import { registerResearcherTools } from "./tools/researcher";
import { registerPiTools } from "./tools/pi";
```

- Server name: `"chorus"` → `"synapse"`
- Role checks: `"pm"` / `"pm_agent"` → `"research_lead"` / `"research_lead_agent"`, etc.
- Register calls: `registerPmTools` → `registerResearchLeadTools`, `registerDeveloperTools` → `registerResearcherTools`, `registerAdminTools` → `registerPiTools`

- [ ] **Step 3: Update all tool files**

In every tool file:
- Tool name prefix: `chorus_` → `synapse_`
- All service imports update to new names
- All Prisma model references update
- All field references update (`projectUuid` → `researchProjectUuid`, etc.)
- `targetType` z.enum values: `"task"` → `"experiment_run"`, etc.
- Tool descriptions: update terminology

- [ ] **Step 4: Update MCP test**

Rename `src/mcp/__tests__/public-tools-proposalUuids.test.ts` → `src/mcp/__tests__/public-tools-designUuids.test.ts`
Update all internal references.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/
git commit -m "mcp: rename tools chorus→synapse, update roles and entity types"
```

### Task 11: Rename API Routes

**Files:**
- Rename directories: `src/app/api/projects/` → `src/app/api/research-projects/`
- Rename directories: `src/app/api/ideas/` → `src/app/api/research-questions/`
- Rename directories: `src/app/api/tasks/` → `src/app/api/experiment-runs/`
- Rename directories: `src/app/api/proposals/` → `src/app/api/experiment-designs/`
- Modify: `src/app/api/mcp/route.ts` (headers)
- Modify: all route files inside renamed directories
- Modify: `src/app/api/comments/route.ts`
- Modify: `src/app/api/me/assignments/route.ts`
- Modify: `src/app/api/events/route.ts`
- Rename: `src/app/api/__tests__/tasks-route.test.ts` → `experiment-runs-route.test.ts`
- Rename: `src/app/api/__tests__/proposals-summary-route.test.ts` → `experiment-designs-summary-route.test.ts`

- [ ] **Step 1: Rename route directories**

```bash
git mv src/app/api/projects src/app/api/research-projects
git mv src/app/api/ideas src/app/api/research-questions
git mv src/app/api/tasks src/app/api/experiment-runs
git mv src/app/api/proposals src/app/api/experiment-designs
```

Inside `experiment-runs/`, rename the param directory:
```bash
# If [taskUuid] exists as a param name in any nested routes, rename to [runUuid]
# Check actual directory names first
```

Inside `experiment-designs/`, rename:
```bash
# [proposalUuid] → [designUuid] if it exists as a directory name
```

- [ ] **Step 2: Update all route file contents**

For every `route.ts` inside the renamed directories:
- Service imports: `ideaService` → `researchQuestionService`, etc.
- Prisma model names
- Field names: `projectUuid` → `researchProjectUuid`, etc.
- Param names from URL: update `params.taskUuid` → `params.runUuid`, etc.
- Entity type strings in responses

- [ ] **Step 3: Update MCP route headers**

In `src/app/api/mcp/route.ts`:
- `X-Chorus-Project` → `X-Synapse-Project`
- `X-Chorus-Project-Group` → `X-Synapse-Project-Group`

- [ ] **Step 4: Update other API routes**

- `src/app/api/comments/route.ts`: update targetType values
- `src/app/api/me/assignments/route.ts`: update model/field refs
- `src/app/api/events/route.ts`: update entity type values
- `src/app/api/events/notifications/route.ts`: same
- `src/app/api/mentionables/route.ts`: update refs

- [ ] **Step 5: Rename and update API test files**

```bash
git mv src/app/api/__tests__/tasks-route.test.ts src/app/api/__tests__/experiment-runs-route.test.ts
git mv src/app/api/__tests__/proposals-summary-route.test.ts src/app/api/__tests__/experiment-designs-summary-route.test.ts
```

Update test file contents.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/
git commit -m "api: rename route directories and update all route handlers"
```

### Task 12: Backend Verification

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Fix any type errors. This is the critical verification step — all model names, field names, imports must align.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Fix any test failures. Since we've renamed models and fields, some test expectations may need updating.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from backend rename"
```

---

## Phase 0c: Frontend Layer

### Task 13: Rename Frontend Page Directories

**Files:**
- Rename: `src/app/(dashboard)/projects/` → `src/app/(dashboard)/research-projects/`
- All nested directories follow

- [ ] **Step 1: Rename top-level directory**

```bash
git mv src/app/(dashboard)/projects src/app/(dashboard)/research-projects
```

- [ ] **Step 2: Rename nested directories inside research-projects/[uuid]/**

```bash
# Rename ideas → research-questions
git mv "src/app/(dashboard)/research-projects/[uuid]/ideas" "src/app/(dashboard)/research-projects/[uuid]/research-questions"

# Rename tasks → experiment-runs
git mv "src/app/(dashboard)/research-projects/[uuid]/tasks" "src/app/(dashboard)/research-projects/[uuid]/experiment-runs"

# Rename proposals → experiment-designs
git mv "src/app/(dashboard)/research-projects/[uuid]/proposals" "src/app/(dashboard)/research-projects/[uuid]/experiment-designs"
```

- [ ] **Step 3: Rename param directories**

```bash
# [ideaUuid] → [questionUuid]
git mv "src/app/(dashboard)/research-projects/[uuid]/research-questions/[ideaUuid]" "src/app/(dashboard)/research-projects/[uuid]/research-questions/[questionUuid]"

# [taskUuid] → [runUuid]
git mv "src/app/(dashboard)/research-projects/[uuid]/experiment-runs/[taskUuid]" "src/app/(dashboard)/research-projects/[uuid]/experiment-runs/[runUuid]"

# [proposalUuid] → [designUuid]
git mv "src/app/(dashboard)/research-projects/[uuid]/experiment-designs/[proposalUuid]" "src/app/(dashboard)/research-projects/[uuid]/experiment-designs/[designUuid]"
```

- [ ] **Step 4: Rename component files inside page directories**

Inside `experiment-runs/`:
```bash
cd "src/app/(dashboard)/research-projects/[uuid]/experiment-runs"
git mv task-detail-panel.tsx run-detail-panel.tsx
git mv task-view-toggle.tsx run-view-toggle.tsx
git mv tasks-page-content.tsx runs-page-content.tsx
git mv assign-task-modal.tsx assign-run-modal.tsx
# In [runUuid]/:
git mv [runUuid]/task-actions.tsx [runUuid]/run-actions.tsx
git mv [runUuid]/task-status-progress.tsx [runUuid]/run-status-progress.tsx
```

Inside `research-questions/`:
```bash
cd "src/app/(dashboard)/research-projects/[uuid]/research-questions"
git mv assign-idea-modal.tsx assign-question-modal.tsx 2>/dev/null
git mv idea-detail-panel.tsx question-detail-panel.tsx 2>/dev/null
git mv idea-create-form.tsx question-create-form.tsx 2>/dev/null
git mv ideas-list.tsx questions-list.tsx 2>/dev/null
git mv ideas-page-content.tsx questions-page-content.tsx 2>/dev/null
```

Inside `experiment-designs/`:
```bash
cd "src/app/(dashboard)/research-projects/[uuid]/experiment-designs"
git mv proposal-kanban.tsx design-kanban.tsx 2>/dev/null
# In [designUuid]/:
git mv [designUuid]/proposal-editor.tsx [designUuid]/design-editor.tsx 2>/dev/null
git mv [designUuid]/proposal-actions.tsx [designUuid]/design-actions.tsx 2>/dev/null
git mv [designUuid]/proposal-comments.tsx [designUuid]/design-comments.tsx 2>/dev/null
git mv [designUuid]/proposal-validation-checklist.tsx [designUuid]/design-validation-checklist.tsx 2>/dev/null
git mv [designUuid]/source-ideas-card.tsx [designUuid]/source-questions-card.tsx 2>/dev/null
# In new/:
git mv new/create-proposal-form.tsx new/create-design-form.tsx 2>/dev/null
```

Inside `experiment-runs/[runUuid]/`:
```bash
git mv [runUuid]/task-draft-detail-panel.tsx [runUuid]/run-draft-detail-panel.tsx 2>/dev/null
```

Also rename elaboration-actions.ts:
```bash
git mv research-questions/[questionUuid]/elaboration-actions.ts research-questions/[questionUuid]/hypothesis-formulation-actions.ts 2>/dev/null
```

Rename test directories/files:
```bash
git mv experiment-runs/__tests__/task-view-toggle-proposal-filter.test.ts experiment-runs/__tests__/run-view-toggle-design-filter.test.ts 2>/dev/null
git mv experiment-runs/__tests__/kanban-proposal-filter.test.ts experiment-runs/__tests__/kanban-design-filter.test.ts 2>/dev/null
git mv experiment-runs/__tests__/dag-view-filtering.test.ts experiment-runs/__tests__/dag-view-filtering.test.ts 2>/dev/null
```

Note: Use `2>/dev/null` on git mv commands to handle files that may not exist. Check actual filenames first.

- [ ] **Step 5: Commit directory renames**

```bash
git add src/app/\(dashboard\)/
git commit -m "frontend: rename page directories to research terminology"
```

### Task 14: Rename Shared Components

**Files:**
- Rename: `src/components/elaboration-panel.tsx` → `hypothesis-formulation-panel.tsx`
- Rename: `src/components/proposal-filter.tsx` → `design-filter.tsx`
- Rename: `src/components/create-project-dialog.tsx` → `create-research-project-dialog.tsx`
- Rename: `src/components/move-project-confirm-dialog.tsx` → `move-research-project-confirm-dialog.tsx`
- Rename: `src/components/__tests__/proposal-filter.test.ts` → `design-filter.test.ts`

- [ ] **Step 1: Rename component files**

```bash
git mv src/components/elaboration-panel.tsx src/components/hypothesis-formulation-panel.tsx
git mv src/components/proposal-filter.tsx src/components/design-filter.tsx
git mv src/components/create-project-dialog.tsx src/components/create-research-project-dialog.tsx
git mv src/components/move-project-confirm-dialog.tsx src/components/move-research-project-confirm-dialog.tsx
git mv src/components/__tests__/proposal-filter.test.ts src/components/__tests__/design-filter.test.ts
```

- [ ] **Step 2: Commit**

```bash
git add src/components/
git commit -m "frontend: rename shared components"
```

### Task 15: Update All Frontend File Contents

**Files:**
- All `.tsx`, `.ts` files under `src/app/(dashboard)/research-projects/`
- All renamed components under `src/components/`
- All server action files
- `src/contexts/realtime-context.tsx`
- `src/contexts/auth-context.tsx`
- `src/app/(dashboard)/settings/page.tsx` and `actions.ts`
- `src/app/(dashboard)/research-projects/` all `page.tsx` and `actions.ts` files
- `src/app/layout.tsx`

- [ ] **Step 1: Update all page.tsx and layout files**

For every `page.tsx` and `layout.tsx` under `research-projects/`:
- Import paths: update to renamed service/component files
- API fetch URLs: `/api/projects/` → `/api/research-projects/`, etc.
- Link hrefs: `/projects/` → `/research-projects/`, etc.
- Variable names: `task` → `experimentRun`, `idea` → `researchQuestion`, `proposal` → `experimentDesign`, `project` → `researchProject`
- Param names: `taskUuid` → `runUuid`, `ideaUuid` → `questionUuid`, `proposalUuid` → `designUuid`
- `projectUuid` → `researchProjectUuid`

- [ ] **Step 2: Update all server action files**

For every `actions.ts` under `research-projects/`:
- Service imports and calls
- Field names in API calls
- Route paths

- [ ] **Step 3: Update all renamed component contents**

For each renamed component, update:
- Internal variable/prop names
- Service/API calls
- i18n translation keys
- Import paths

- [ ] **Step 4: Update settings page**

`src/app/(dashboard)/settings/page.tsx` and `actions.ts`:
- Agent role display: "PM" → "Research Lead", "Developer" → "Researcher", "Admin" → "PI"
- API key prefix display: `cho_` → `syn_`

- [ ] **Step 5: Update contexts**

`src/contexts/realtime-context.tsx`:
- Entity type values: `"task"` → `"experiment_run"`, etc.
- Event type references

`src/contexts/auth-context.tsx`:
- Role references if any

- [ ] **Step 6: Update middleware**

`src/middleware.ts`:
- Legacy redirect patterns: `/projects/` → `/research-projects/`
- `?idea=` → `?research-question=`
- `?task=` → `?run=`

- [ ] **Step 7: Commit**

```bash
git add src/app/ src/components/ src/contexts/ src/middleware.ts
git commit -m "frontend: update all file contents with new terminology"
```

### Task 16: Update i18n Strings

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Read current i18n files**

Read both `messages/en.json` and `messages/zh.json` to understand the full key structure.

- [ ] **Step 2: Rename existing keys and values in en.json**

Systematic replacements:
- All keys containing `idea` → `researchQuestion`
- All keys containing `task` → `experimentRun`
- All keys containing `proposal` → `experimentDesign`
- All keys containing `project` (not `projectGroup`) → `researchProject`
- All keys containing `elaboration` → `hypothesisFormulation`
- All display values: "Idea" → "Research Question", "Task" → "Experiment Run", "Proposal" → "Experiment Design", "Project" → "Research Project", "Elaboration" → "Hypothesis Formulation"
- "Story Points" → "Compute Budget"
- "PM" / "PM Agent" → "Research Lead"
- "Developer" / "Developer Agent" → "Research Agent"
- "Admin" / "Admin Agent" → "Principal Investigator"
- "Chorus" → "Synapse"
- "Project Group" display values → "Research Program"
- "Acceptance Criteria" → "Go/No-Go Criteria"

- [ ] **Step 3: Add new research-specific keys in en.json**

Add keys for:
- `researchQuestion.hypothesisStatement`: "Hypothesis Statement"
- `researchQuestion.nullHypothesis`: "Null Hypothesis"
- `researchQuestion.priorWork`: "Prior Work"
- `researchQuestion.researchType`: "Research Type"
- `experimentRun.experimentConfig`: "Experiment Configuration"
- `experimentRun.experimentResults`: "Results"
- `experimentRun.baseline`: "Baseline"
- `experimentRun.computeBudget`: "Compute Budget (GPU Hours)"
- `experimentRun.computeUsed`: "Compute Used"
- `experimentRun.outcome`: "Outcome"
- `experimentRun.outcomeAccepted`: "Accepted"
- `experimentRun.outcomeRejected`: "Rejected"
- `experimentRun.outcomeInconclusive`: "Inconclusive"
- `criteria.metricName`: "Metric Name"
- `criteria.operator`: "Operator"
- `criteria.threshold`: "Threshold"
- `criteria.earlyStop`: "Early Stop Condition"
- `criteria.actualValue`: "Actual Value"
- `baseline.name`: "Baseline Name"
- `baseline.metrics`: "Baseline Metrics"
- `baseline.active`: "Active Baseline"

- [ ] **Step 4: Apply same changes to zh.json**

Same key renames. Chinese translations:
- "Research Question" → "研究问题"
- "Experiment Run" → "实验运行"
- "Experiment Design" → "实验设计"
- "Research Project" → "研究项目"
- "Research Program" → "研究计划"
- "Hypothesis Formulation" → "假说构建"
- "Go/No-Go Criteria" → "通过/不通过标准"
- "Compute Budget" → "计算预算"
- "Research Lead" → "研究负责人"
- "Research Agent" → "研究代理"
- "Principal Investigator" → "首席研究员"
- New field translations follow

- [ ] **Step 5: Commit**

```bash
git add messages/
git commit -m "i18n: update all strings from Chorus/software to Synapse/research terminology"
```

### Task 17: Update Static Assets, Config, and Docs

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `docker-entrypoint.sh`
- Modify: `install.sh`
- Modify: `.dockerignore`
- Modify: `.gitignore`
- Rename: `public/chorus-plugin/` → `public/synapse-plugin/`
- Rename: `packages/chorus-cdk/` → `packages/synapse-cdk/`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `README.md`, `README.zh.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: all files under `docs/`
- Modify: all files under `public/synapse-plugin/` (after rename)
- Modify: all files under `packages/synapse-cdk/` (after rename)
- Modify: all files under `packages/openclaw-plugin/`

- [ ] **Step 1: Update package.json**

- `"name": "chorus"` → `"name": "synapse"`

- [ ] **Step 2: Update .env.example**

```
DATABASE_URL="postgresql://synapse:synapse@localhost:5432/synapse"
REDIS_URL="redis://default:synapse-redis@localhost:6379"
DEFAULT_USER="dev@synapse.local"
DEFAULT_PASSWORD="synapse123"
```

- [ ] **Step 3: Update docker-compose.yml**

- Service names: `chorus` refs → `synapse`
- Image names: `chorusaidlc/chorus-app` → update
- Environment variables: match .env.example changes
- Database name, user, password

- [ ] **Step 4: Update Dockerfile, docker-entrypoint.sh**

Replace all `chorus` references with `synapse`.

- [ ] **Step 5: Update install.sh**

Default stack name: `Chorus` → `Synapse`
All `chorus` refs → `synapse`

- [ ] **Step 6: Rename plugin directory**

```bash
git mv public/chorus-plugin public/synapse-plugin
```

Update ALL files inside `public/synapse-plugin/`:
- `CHORUS_URL` → `SYNAPSE_URL`
- `CHORUS_API_KEY` → `SYNAPSE_API_KEY`
- `chorus` → `synapse` in all scripts, skill docs, config files
- Role terminology: PM → Research Lead, Developer → Researcher, Admin → PI
- Tool names: `chorus_*` → `synapse_*`

- [ ] **Step 7: Rename CDK directory**

```bash
git mv packages/chorus-cdk packages/synapse-cdk
```

Update ALL files inside:
- Package name in `package.json`
- All `chorus` refs → `synapse`
- CDK stack names, construct names

- [ ] **Step 8: Update packages/openclaw-plugin/**

- All `chorus` refs → `synapse`
- Tool names: `chorus_*` → `synapse_*`
- Role terminology
- `cho_` → `syn_`

- [ ] **Step 9: Update .claude-plugin/marketplace.json**

- `"chorus-plugins"` → `"synapse-plugins"`
- Plugin name and descriptions

- [ ] **Step 10: Update README.md and README.zh.md**

Full rewrite for Synapse identity:
- Title, description, badges
- All "Chorus" → "Synapse"
- All terminology (Idea→Research Question, Task→Experiment Run, etc.)
- Docker commands, env vars
- Plugin install commands

- [ ] **Step 11: Update CLAUDE.md**

Full rewrite:
- "Chorus" → "Synapse" throughout
- Tech stack section: same stack, new name
- Project structure: update directory names
- Architecture patterns: update terminology
- Key commands: same
- Common pitfalls: update with new names
- MCP tool registration example: `synapse_*`
- Agent roles: Research Lead, Researcher, PI

- [ ] **Step 12: Update all docs/ files**

For each file in `docs/`:
- `PRD_Chorus.md` → `PRD_Synapse.md` (rename + content update)
- `ARCHITECTURE.md` → update terminology
- `MCP_TOOLS.md` → update all tool names
- `chorus-plugin.md` → `synapse-plugin.md` (rename + content update)
- `AIDLC_GAP_ANALYSIS.md` → update
- `DOCKER.md` → update
- All other docs: find/replace Chorus → Synapse + terminology updates

- [ ] **Step 13: Update pnpm-workspace.yaml**

If it references `chorus-cdk`, update to `synapse-cdk`.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "config: rename all static assets, docs, and config from Chorus to Synapse"
```

### Task 18: Frontend Verification

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Fix ALL type errors.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Fix ALL test failures.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Fix lint errors.

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Verify production build succeeds.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve all type/test/lint/build errors from frontend rename"
```

---

## Phase 1: New Research Features (TDD)

### Task 19: Implement Baseline Service

**Files:**
- Create: `src/services/baseline.service.ts`
- Create: `src/services/__tests__/baseline.service.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/services/__tests__/baseline.service.test.ts`, write tests for:
- `createBaseline(companyUuid, projectUuid, { name, metrics, experimentUuid? })` — returns created baseline
- `listBaselines(companyUuid, projectUuid)` — returns all baselines for project
- `getActiveBaseline(companyUuid, projectUuid)` — returns the active baseline
- `setActiveBaseline(companyUuid, baselineUuid)` — sets isActive=true, deactivates others
- `deleteBaseline(companyUuid, baselineUuid)` — deletes baseline

Mock `prisma.baseline` following existing test patterns in `src/services/__tests__/`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/services/__tests__/baseline.service.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement baseline.service.ts**

Follow existing service patterns. All queries scoped by `companyUuid`. Use `researchProjectUuid` field name.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/services/__tests__/baseline.service.test.ts
```
Expected: ALL PASS

- [ ] **Step 5: Add to services/index.ts**

```typescript
export * as baselineService from "./baseline.service";
```

- [ ] **Step 6: Commit**

```bash
git add src/services/baseline.service.ts src/services/__tests__/baseline.service.test.ts src/services/index.ts
git commit -m "feat: add baseline service with CRUD operations"
```

### Task 20: Implement ExperimentRegistry Service

**Files:**
- Create: `src/services/experiment-registry.service.ts`
- Create: `src/services/__tests__/experiment-registry.service.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for:
- `registerExperiment(companyUuid, { projectUuid, runUuid, config, environment, seed?, startedAt })` — creates registry entry
- `completeExperiment(companyUuid, registryUuid, { metrics, artifacts?, completedAt })` — marks complete
- `getByRun(companyUuid, runUuid)` — gets registry entry for a run
- `markReproducible(companyUuid, registryUuid)` — sets reproducible=true
- `listByProject(companyUuid, projectUuid)` — lists all experiments for project

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/services/__tests__/experiment-registry.service.test.ts
```

- [ ] **Step 3: Implement experiment-registry.service.ts**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add to services/index.ts**

- [ ] **Step 6: Commit**

```bash
git add src/services/experiment-registry.service.ts src/services/__tests__/experiment-registry.service.test.ts src/services/index.ts
git commit -m "feat: add experiment registry service"
```

### Task 21: Implement Criteria Evaluation Service

**Files:**
- Create: `src/services/criteria-evaluation.service.ts`
- Create: `src/services/__tests__/criteria-evaluation.service.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for:
- `evaluateCriteria(companyUuid, runUuid, reportedMetrics: Record<string, number>)`:
  - Given criteria with `metricName="accuracy", operator=">=", threshold=0.85` and reported `{ accuracy: 0.90 }` → marks `actualValue=0.90`, `devStatus="passed"`
  - Given criteria with `metricName="accuracy", operator=">=", threshold=0.85` and reported `{ accuracy: 0.70 }` → marks `actualValue=0.70`, `devStatus="failed"`
  - Given early-stop criterion that fails → returns `shouldStop: true`
  - Given all required criteria pass → returns `allPassed: true, suggestedOutcome: "accepted"`
  - Given any required criterion fails → returns `allPassed: false, suggestedOutcome: "rejected"`
  - Given missing metric → leaves criterion as `pending`

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement criteria-evaluation.service.ts**

Core logic:
```typescript
function evaluateOperator(actual: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case ">=": return actual >= threshold;
    case "<=": return actual <= threshold;
    case ">": return actual > threshold;
    case "<": return actual < threshold;
    case "==": return actual === threshold;
    default: return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add to services/index.ts**

- [ ] **Step 6: Commit**

```bash
git add src/services/criteria-evaluation.service.ts src/services/__tests__/criteria-evaluation.service.test.ts src/services/index.ts
git commit -m "feat: add criteria evaluation service with Go/No-Go logic"
```

### Task 22: Add New API Routes

**Files:**
- Create: `src/app/api/research-projects/[uuid]/baselines/route.ts`
- Create: `src/app/api/experiment-runs/[uuid]/registry/route.ts`
- Create: `src/app/api/experiment-runs/[uuid]/evaluate-criteria/route.ts`

- [ ] **Step 1: Implement baselines route**

GET — list baselines for project
POST — create baseline

Follow existing route patterns: `requireAuth`, `withErrorHandler`, `success(data)`.

- [ ] **Step 2: Implement registry route**

GET — get registry entry for run
POST — register experiment

- [ ] **Step 3: Implement evaluate-criteria route**

POST — evaluate criteria against reported metrics
Request body: `{ metrics: { accuracy: 0.90, f1: 0.85 } }`
Response: `{ allPassed, suggestedOutcome, results: [...] }`

- [ ] **Step 4: Run type check and tests**

```bash
npx tsc --noEmit
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/research-projects/[uuid]/baselines/ src/app/api/experiment-runs/[uuid]/registry/ src/app/api/experiment-runs/[uuid]/evaluate-criteria/
git commit -m "feat: add API routes for baselines, experiment registry, and criteria evaluation"
```

### Task 23: Add New MCP Tools

**Files:**
- Modify: `src/mcp/tools/research-lead.ts` (add new tools)
- Modify: `src/mcp/tools/researcher.ts` (add new tools)
- Modify: `src/mcp/tools/pi.ts` (add new tools)

- [ ] **Step 1: Add Research Lead tools**

In `src/mcp/tools/research-lead.ts`, add:
- `synapse_create_baseline` — calls `baselineService.createBaseline`
- `synapse_list_baselines` — calls `baselineService.listBaselines`
- `synapse_compare_results` — calls `baselineService.getActiveBaseline` + comparison logic
- `synapse_create_rdr` — calls `documentService.createDocument` with type `"rdr"`

- [ ] **Step 2: Add Researcher tools**

In `src/mcp/tools/researcher.ts`, add:
- `synapse_register_experiment` — calls `experimentRegistryService.registerExperiment`
- `synapse_report_metrics` — calls `criteriaEvaluationService.evaluateCriteria`
- `synapse_check_criteria` — calls `criteriaEvaluationService.evaluateCriteria` (read-only check)
- `synapse_request_early_stop` — checks early-stop criteria, requests status change if met

- [ ] **Step 3: Add PI tools**

In `src/mcp/tools/pi.ts`, add:
- `synapse_verify_reproducibility` — calls `experimentRegistryService.markReproducible`
- `synapse_set_active_baseline` — calls `baselineService.setActiveBaseline`

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/
git commit -m "feat: add research-specific MCP tools for all roles"
```

---

## Final Verification

### Task 24: Full Build and Test

- [ ] **Step 1: Clean install**

```bash
rm -rf node_modules .next
pnpm install
```

- [ ] **Step 2: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

- [ ] **Step 5: Production build**

```bash
pnpm build
```

- [ ] **Step 6: Lint**

```bash
pnpm lint
```

- [ ] **Step 7: Commit any final fixes and tag**

```bash
git add -A
git commit -m "chore: final verification — all checks pass"
git tag v0.5.0-synapse
```

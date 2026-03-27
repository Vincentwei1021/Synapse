# CLAUDE.md — Synapse Working Guide

## What Synapse Is

Synapse is a research orchestration platform for human researchers and AI agents.
The current product is centered on:

- `ResearchProject`: project brief, datasets, evaluation methods, rolling synthesis
- `ResearchQuestion`: optional problem framing and question hierarchy
- `Experiment`: the primary execution unit
- `Document`: project docs, experiment result docs, and project synthesis docs
- `Compute`: pools, machines, GPUs, and reservations
- `AgentSession`: observability for long-running or delegated agent work

The current primary workflow is:

1. Human creates a `ResearchProject`
2. Human or agent creates `ResearchQuestion` records
3. Human or agent creates `Experiment` records
4. Experiments are assigned to agents
5. Agents use MCP tools to inspect context, allocate compute, start experiments, and submit results
6. Synapse updates experiment result documents and rolling project synthesis

This repo still contains older Chorus-derived entities like `ExperimentDesign` and `ExperimentRun`, but they are now mostly compatibility or legacy surfaces. For new research work, default to the `Experiment` model unless a specific route or tool still explicitly uses the older flow.

## Tech Stack

- Framework: Next.js 15 App Router
- Language: TypeScript 5
- Frontend: React 19, Tailwind CSS 4, Radix/shadcn UI
- Database: PostgreSQL + Prisma 7
- Realtime / Pub-Sub: Redis via `ioredis` with in-memory fallback
- Auth: OIDC-style user login, default-login fallback for local/demo use, `syn_` API keys for agents
- MCP: `@modelcontextprotocol/sdk` over HTTP streamable transport
- i18n: `next-intl` (`en`, `zh`)
- Testing: Vitest
- Package manager: pnpm

## Commands

```bash
pnpm dev                      # Dev server (Turbopack)
pnpm dev:webpack              # Dev server without Turbopack
pnpm build                    # prisma generate + next build
pnpm start                    # Standalone start via scripts/start-standalone.sh
pnpm start:legacy             # Plain next start
pnpm lint                     # ESLint
pnpm test                     # Vitest run
pnpm test:watch               # Vitest watch mode
pnpm test:coverage            # Coverage report
pnpm db:generate              # Prisma client generation
pnpm db:migrate               # Deploy migrations
pnpm db:migrate:dev           # Create/apply dev migration
pnpm db:push                  # Push schema without migrations
pnpm db:studio                # Prisma Studio
pnpm docker:db                # Start postgres + redis
pnpm docker:up                # Full docker profile
pnpm docker:down              # Stop full docker profile
```

Important:

- After every `prisma/schema.prisma` change, run `pnpm db:generate`
- Restart the running app after schema changes
- The standalone start path depends on `scripts/start-standalone.sh`, which copies static assets into `.next/standalone` before launch

## Current Project Structure

```text
src/
  app/
    (dashboard)/
      research-projects/
        [uuid]/
          dashboard/
          research-questions/
          experiments/
          insights/
          documents/
          activity/                # still present, not a primary nav surface
          experiment-designs/      # legacy / compatibility
          experiment-runs/         # legacy / compatibility
      compute/
      settings/
      project-groups/
    api/
      mcp/
      comments/
      compute-nodes/
      compute-pools/
      experiments/
      research-projects/
      research-questions/
      notifications/
      events/notifications/
  services/
  lib/
  mcp/
  components/
  contexts/
  generated/prisma/

packages/
  openclaw-plugin/
  synapse-cdk/

public/
  skill/
  synapse-plugin/
```

## Data Model Reality

The schema currently contains `29` Prisma models.

The most important active models are:

- `Company`
- `User`
- `Agent`
- `ApiKey`
- `ProjectGroup`
- `ResearchProject`
- `ResearchQuestion`
- `Document`
- `Experiment`
- `ComputePool`
- `ComputeNode`
- `ComputeGpu`
- `ExperimentGpuReservation`
- `AgentSession`
- `Notification`
- `Comment`
- `Activity`

Older but still present legacy/compatibility models:

- `ExperimentDesign`
- `ExperimentRun`
- `RunDependency`
- `AcceptanceCriterion`
- `RunGpuReservation`
- `SessionRunCheckin`
- `HypothesisFormulation`
- `HypothesisFormulationQuestion`

## Core Architecture Rules

### UUID-first

All public references use UUIDs. URLs, APIs, assignments, notifications, and comments all use UUIDs, not serial IDs.

### Service layer

Business logic belongs in `src/services/*.service.ts`.
Routes and MCP tools should orchestrate auth, parsing, and response formatting, then call services.

### Multi-tenancy

Every query must stay scoped by `companyUuid`.
Do not return or mutate cross-company data.

### Auth context

Requests resolve to an auth context with:

- `type`: `user | agent | super_admin`
- `companyUuid`
- `actorUuid`

Agents authenticate with API keys. Users use session/cookie-based auth.

### Realtime model

Activities are emitted through the `EventBus`.
Redis is optional; if unavailable, the app falls back to in-memory pub/sub.
Notifications are streamed over SSE at `/api/events/notifications`.

## Agent and MCP Rules

### Primary research MCP flow

For the current research workflow, the main tools are the experiment-oriented ones:

- `synapse_get_research_project`
- `synapse_get_research_question`
- `synapse_get_experiment`
- `synapse_get_assigned_experiments`
- `synapse_start_experiment`
- `synapse_submit_experiment_results`
- `synapse_list_compute_nodes`
- `synapse_get_node_access_bundle`
- `synapse_add_comment`
- `synapse_get_comments`

Default to these tools for new work. Do not prefer legacy `experiment_run` tools unless the task is explicitly about that older flow.

### OpenClaw wake semantics

The OpenClaw plugin now wakes agents via `/hooks/agent`, not `/hooks/wake`.

Why this matters:

- `/hooks/agent` creates an isolated agent turn
- the Synapse assignment prompt becomes the primary message
- this is what currently enables end-to-end automatic experiment execution

Relevant code:

- [/Users/weiyihao/personal/Synapse/packages/openclaw-plugin/src/index.ts](/Users/weiyihao/personal/Synapse/packages/openclaw-plugin/src/index.ts)

### Compute access

Agents do not SSH using server-local key paths.

Correct flow:

1. Inspect machines with `synapse_list_compute_nodes`
2. If `managedKeyAvailable=true`, call `synapse_get_node_access_bundle`
3. Write `privateKeyPemBase64` to a local file
4. `chmod 600` the PEM file
5. SSH using the returned host/user/port

Never assume a path like `/home/ubuntu/.synapse/keys/...` exists on the agent machine.

## Experiment vs Document

`Document` is not strongly foreign-keyed to `Experiment`.

Current relationship:

- Documents are still project-scoped first
- Experiment result docs are soft-linked to experiments via a marker in document content
- Project synthesis docs are separate rolling documents of type `project_synthesis`

Agent-triggered document behavior:

- `synapse_start_experiment` will create or update the experiment result document
- `synapse_submit_experiment_results` updates the experiment and its result document
- Completing experiments also refreshes the project-level synthesis document

So if an agent runs an experiment correctly, Synapse should update both:

- the `Experiment`
- the related result document

## Comments

`Comment.targetType` now supports:

- `research_question`
- `experiment`
- `experiment_design`
- `experiment_run`
- `document`

For current research work, prefer commenting directly on `experiment` instead of forcing everything through `experiment_run`.

## UI / Product Reality

Primary project navigation today is:

- Overview
- Research Questions
- Experiments
- Insights
- Documents

Other important surfaces:

- `Compute`
- `Settings`
- `Project Groups`

Notes:

- `Insights` is the project-level synthesis surface
- `Research Questions` uses a canvas-style hierarchy view
- `Experiments` is a five-column board:
  - `draft`
  - `pending_review`
  - `pending_start`
  - `in_progress`
  - `completed`

Human-created experiments should normally land in `pending_start`, not sit in `draft`, unless explicitly created as drafts.

## i18n Rules

All user-facing frontend text must use i18n.

Rules:

- Add keys to both:
  - [/Users/weiyihao/personal/Synapse/messages/en.json](/Users/weiyihao/personal/Synapse/messages/en.json)
  - [/Users/weiyihao/personal/Synapse/messages/zh.json](/Users/weiyihao/personal/Synapse/messages/zh.json)
- Use `useTranslations()` in client components
- Use `getTranslations()` in server components
- Do not ship JSX with hardcoded English copy

## Frontend Rules

Use the project UI primitives instead of raw HTML where a shared component already exists.

In practice:

- Prefer shadcn/Radix components in `src/components/ui`
- Use Tailwind utilities for layout and state styling
- Reuse existing board, panel, and detail-sheet patterns from the current research project screens

## Development Conventions

### Keep `docs/design.pen` updated

If you change user-facing flows or layout, update `docs/design.pen`.
Do not read or edit `.pen` files directly with generic text tools; use Pencil tooling.

### Prefer server components by default

Only add `"use client"` when you need:

- local state
- effects
- browser-only APIs
- event handlers

### Keep compatibility layers explicit

This repo is mid-migration from Chorus-style `research_question -> experiment_design -> experiment_run` to a flatter `research_question -> experiment` flow.

When changing behavior:

- keep legacy routes working unless you are intentionally removing them
- mark docs and code comments clearly when something is legacy-only
- do not accidentally route new features through old `experiment_run` abstractions if `Experiment` already covers the use case

## Common Pitfalls

1. Prisma client stale after schema change
   Run `pnpm db:generate` and restart the app.

2. Wrong MCP tool family
   For current research work, use `experiment` tools first. Only use `experiment_run` tools when you are intentionally working on the old pipeline.

3. Wrong wake endpoint
   OpenClaw auto-start depends on `/hooks/agent`, not `/hooks/wake`.

4. Assuming server-local SSH key paths
   Agents must use `synapse_get_node_access_bundle` instead of trying to read Synapse host filesystem paths.

5. Hardcoded English copy
   Always add locale keys to both `en` and `zh`.

6. Confusing `Document` linkage
   Experiment result docs are soft-linked, not strict foreign-key children of `Experiment`.

7. Legacy pages still exist
   `experiment-designs` and `experiment-runs` are still in the repo. Do not assume they are the primary workflow just because routes exist.

8. Demo/remote environment may run `pnpm dev`
   Some demo environments are temporarily run with `pnpm dev -H 0.0.0.0 -p 3000` for stability, even if `pnpm start` is the intended production path.

9. Comment target mismatch
   If an agent comments on an `experiment`, use `targetType: "experiment"`. Do not force it into `experiment_run` unless the entity is actually a legacy run.

10. Bash compatibility for plugin hooks
   Keep shell scripts compatible with macOS Bash 3.2 when editing files under `public/synapse-plugin/bin/`.

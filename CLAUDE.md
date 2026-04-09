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
pnpm preflight                # Local environment / build / health preflight checks
pnpm perf:sample:remote       # Remote performance sampling helper
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
pnpm docker:build             # Build Docker image
pnpm docker:logs              # Tail Docker logs
```

Important:

- After every `prisma/schema.prisma` change, run `pnpm db:generate`
- Restart the running app after schema changes
- The standalone start path depends on `scripts/start-standalone.sh`, which copies static assets into `.next/standalone` before launch and binds `HOSTNAME` from `SYNAPSE_HOSTNAME` (default `127.0.0.1`)
- `scripts/preflight.sh` is the canonical startup/env sanity check and now loads repo-root `.env` before validating the environment

## Current Project Structure

```text
src/
  app/
    (dashboard)/
      agents/                     # Agent management page (composable permissions)
      research-projects/
        [uuid]/
          dashboard/
          related-works/           # Literature search + deep research reports
          research-questions/
          experiments/
          insights/
          documents/
          settings/                # Project settings (edit info, delete entities)
          activity/                # still present, not a primary nav surface
          experiment-designs/      # legacy / compatibility
          experiment-runs/         # legacy / compatibility
      compute/
      settings/                   # Language, theme, notification preferences only
      project-groups/
    api/
      admin/stats/                # Super-admin statistics
      agents/                     # Agent CRUD
      api-keys/                   # API key management
      auth/                       # Authentication endpoints
      comments/
      compute-nodes/
      compute-pools/
      documents/                  # Document CRUD
      events/notifications/       # SSE notification stream
      experiment-designs/         # Legacy experiment designs
      experiment-runs/            # Legacy experiment runs
      experiments/
        [uuid]/progress/          # Experiment progress log API
      health/                     # Health check (direct Prisma)
      mcp/                        # MCP server endpoint
      me/                         # Current user endpoint
      mentionables/               # Mention/tagging targets
      notifications/
      project-groups/
      research-projects/
        [uuid]/related-works/     # Related works CRUD API
      research-questions/
      sessions/                   # Session management
      ssh-config/                 # SSH config endpoint
  services/
    experiment-progress.service.ts # Progress log service
  lib/
  mcp/
  components/
  contexts/
  generated/prisma/

packages/
  openclaw-plugin/

public/
  skill/
  synapse-plugin/
```

Important implementation notes:

- `src/services/project-metrics.service.ts` is the canonical read-model for project and group counts
- `src/mcp/tools/tool-registry.ts` and `src/mcp/tools/compat-alias-tools.ts` are the shared MCP tool registration helpers
- `packages/openclaw-plugin/src/tools/common-tool-definitions.ts` plus `tool-registry.ts` are the shared declarative OpenClaw tool-definition layer
- `src/app/(dashboard)/research-projects/page.tsx` is now split into a page container, section components, shared helpers, and a page data hook; extend those modules instead of growing the container again

## Data Model Reality

The schema currently contains `31` Prisma models.

The most important active models are:

- `Company`
- `User`
- `Agent` (has composable `roles`: `pre_research`, `research`, `experiment`, `report`, `admin`)
- `ApiKey`
- `ProjectGroup`
- `ResearchProject` (has `computePoolUuid`, `autonomousLoopEnabled/AgentUuid`, `autoSearchEnabled/AgentUuid`)
- `ResearchQuestion`
- `Document`
- `Experiment` (has `liveStatus`, `liveMessage`, `liveUpdatedAt` for real-time tracking)
- `ExperimentProgressLog` (agent progress message timeline)
- `RelatedWork` (academic papers linked to a project, with Semantic Scholar metadata)
- `ComputePool`
- `ComputeNode`
- `ComputeGpu`
- `ExperimentGpuReservation`
- `AgentSession`
- `Notification`
- `NotificationPreference`
- `Comment`
- `Mention`
- `Activity`
- `ExperimentRegistry`
- `Baseline`

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
Prefer the boundary `route/page -> service/read-model -> prisma`.
Direct Prisma access inside `app/` should now be treated as an exception reserved for infrastructure probes like `/api/health`.

### Read-models first

For project lists, dashboards, and group summaries:

- use `src/services/project-metrics.service.ts` as the shared source of counts and completion rate
- keep compatibility fields like `ideas / proposals / tasks` at API boundaries only
- prefer canonical internal fields like `researchQuestions`, `experimentDesigns`, `experimentRuns`, and `documents`

### Multi-tenancy

Every query must stay scoped by `companyUuid`.
Do not return or mutate cross-company data.

### Auth context

Requests resolve to an auth context with:

- `type`: `user | agent | super_admin`
- `companyUuid`
- `actorUuid`

Agents authenticate with API keys. Users use session/cookie-based auth.

For user-managed agents, API keys, and agent sessions:

- scope by `companyUuid` and `ownerUuid`
- do not let one user inspect, mutate, or revoke another user's agents, keys, or sessions inside the same company

### Realtime model

Activities are emitted through the `EventBus`.
Redis is optional; if unavailable, the app falls back to in-memory pub/sub.
Notifications are streamed over SSE at `/api/events/notifications`.
Redis subscribers and other background listeners should be started explicitly by the runtime that needs them, not as import-time side effects.

## Agent and MCP Rules

### Primary research MCP flow

For the current research workflow, the main tools are the experiment-oriented ones:

- `synapse_get_research_project`
- `synapse_get_research_question`
- `synapse_get_experiment`
- `synapse_get_assigned_experiments`
- `synapse_start_experiment`
- `synapse_submit_experiment_results`
- `synapse_report_experiment_progress` — agents report step-by-step progress
- `synapse_list_compute_nodes`
- `synapse_get_node_access_bundle`
- `synapse_add_comment`
- `synapse_get_comments`
- `synapse_get_project_full_context` — full project context for autonomous analysis
- `synapse_propose_experiment` — agent proposes draft experiment (autonomous loop only)
- `synapse_search_papers` — search for academic papers (DeepXiv hybrid search, arXiv API fallback)
- `synapse_read_paper_brief` — quick paper summary: TLDR, keywords, citations (~500 tokens)
- `synapse_read_paper_head` — paper structure with per-section TLDRs and token counts (~1-2k tokens)
- `synapse_read_paper_section` — read one section in full (~1-5k tokens)
- `synapse_read_paper_full` — read complete paper as Markdown (~10-50k tokens)
- `synapse_add_related_work` — add a paper to project's related works
- `synapse_get_related_works` — list all related works for a project

Default to these tools for new work. Do not prefer legacy `experiment_run` tools unless the task is explicitly about that older flow.

### Agent permission model

Agents use 5 composable permissions stored in the `roles` field:

- `pre_research`: literature search, paper collection, research project context reading
- `research`: research question CRUD, research question management
- `experiment`: experiment start/complete/submit, compute tools, metrics/baseline
- `report`: document CRUD, deep research reports, synthesis tools
- `admin`: create/delete research projects, manage project groups, review/close/delete research questions

These replace the old roles (`researcher_agent`, `research_lead_agent`, `pi_agent`). Old role values are still accepted for backward compatibility but new agents should use the new permission names. An agent can have any combination of permissions.

### Experiment live status

Experiments now track real-time sub-status via `liveStatus`:

- `sent` → set when experiment is assigned to an agent
- `ack` → set when agent fetches its assigned experiments
- `checking_resources` → set when agent checks GPU availability
- `queuing` → set if no GPUs are available
- `running` → set when experiment is actively running
- `null` → cleared on completion

Agents report progress via `synapse_report_experiment_progress`, which updates `liveMessage` on the experiment and creates an `ExperimentProgressLog` entry. The experiment card on the board shows the live status badge and latest message.

### Compute pool binding

Research projects can optionally bind to a compute pool via `computePoolUuid`. When set:

- GPU reservations are validated: only GPUs from nodes in the bound pool are allowed
- `synapse_list_compute_nodes` can be filtered by `researchProjectUuid` to show only the bound pool
- `null` means no constraint (any pool's GPUs can be used)

### Autonomous Loop

Research projects can enable an autonomous loop via `autonomousLoopEnabled` + `autonomousLoopAgentUuid`:

- Toggle on the Experiments page header (three-state: OFF → ON waiting → Active)
- When enabled and all experiment queues are empty (draft=0, pending_review=0, pending_start=0), completing an experiment triggers the assigned agent
- Agent receives full project context and can propose new experiments (as `draft`) via `synapse_propose_experiment`
- Human reviews proposed experiments on the board before they execute
- This creates a self-sustaining research cycle: execute → analyze → propose → review → execute

### Related Works

New project-level page at `/research-projects/[uuid]/related-works`:

- Manual paper addition (paste arXiv URL → auto-fetch metadata) or auto-search via `pre_research` agent
- Auto-search toggle (three-state with agent selector) — agent uses `synapse_search_papers` + `synapse_read_paper_brief` + `synapse_add_related_work`
- Deep Research action — user selects agent + clicks Generate → agent produces `literature_review` Document
- Papers are stored in the `RelatedWork` model, linked to project
- Literature tools: `synapse_search_papers` (DeepXiv hybrid search, arXiv API fallback), `synapse_read_paper_brief/head/section/full` (progressive full-text reading via DeepXiv), `synapse_add_related_work`, `synapse_get_related_works`

### Declarative MCP / plugin tool registration

The repo now has a partial declarative tool-definition layer:

- MCP side: `src/mcp/tools/tool-registry.ts` and `src/mcp/tools/compat-alias-tools.ts`
- OpenClaw side: `packages/openclaw-plugin/src/tools/tool-registry.ts` plus `common-tool-definitions.ts`

When adding or updating tools:

- prefer extending the existing definition arrays instead of hand-writing repetitive `registerTool(...)` blocks
- keep compatibility aliases explicit and close to the registry layer
- preserve legacy tool names at the boundary when compatibility matters, but map them to canonical entities internally

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

### Compute telemetry

GPU telemetry no longer starts from `listComputePools()` or other request-path helpers.
GPU telemetry is controlled per-node via a toggle on the compute page (30s polling interval, auto-disables after 3 consecutive SSH failures).
Treat compute polling as background infrastructure, not page-load logic.

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

`Experiment.computeBudgetHours` is nullable:

- `null` means unlimited budget
- blank create-form input should stay `null`, not coerce to `0`

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

Global navigation (sidebar):

- `Research Projects`
- `Compute`
- `Agents` (agent management with 5 composable permissions)
- `Settings` (language, theme, notification preferences only — agents moved to /agents)

Project-level navigation:

- Overview (research questions on left, experiment pipeline on right)
- Related Works (literature search, paper collection, deep research reports)
- Research Questions
- Experiments
- Insights
- Documents
- Project Settings (edit project info, delete experiments/questions/project)

Notes:

- `Insights` is the project-level synthesis surface
- `Research Questions` uses a canvas-style hierarchy view
- `Related Works` collects papers (manual arXiv URL + auto-search via Semantic Scholar), supports deep research report generation
- `Experiments` is a five-column board with live status badges on cards:
  - `draft`
  - `pending_review`
  - `pending_start`
  - `in_progress`
  - `completed`
- Experiment cards show `liveStatus` badge (sent/ack/checking/queuing/running) and `liveMessage` when available, no description or question shown on cards
- Experiment detail panel includes a progress log timeline
- On experiment completion, the assigned agent writes its own report (replaces the old template approach)
- Project dashboard has an Edit button to modify project details (name, description, datasets, evaluation methods, compute pool)
- Create experiment form includes a "Copy from existing experiment" dropdown
- Project groups are editable (name, description) from the projects list page

Human-created experiments should normally land in `pending_start`, not sit in `draft`, unless explicitly created as drafts.

Create project form:
- No Goal field (removed — use description for research direction, objectives, constraints)
- Compute Pool dropdown (required field, "None" means no constraint)
- Sections 2 ("Initial Ideas") and 3 ("Reference Documents") are collapsible, default collapsed

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

### Keep all environments in sync

This project has three environments that must stay in sync:

1. **Local**: `/Users/weiyihao/personal/Synapse`
2. **Synapse remote**: `synapse:/home/ubuntu/Synapse`
3. **OpenClaw machine**: `openclaw` — runs the OpenClaw gateway with the Synapse plugin

SSH details for `synapse` and `openclaw` are in the local `~/.ssh/config`. Use `ssh synapse` and `ssh openclaw` directly.

Rules for code changes:

- any code change must be synced to both local and synapse remote working copies
- **git commit and push must be done on the synapse remote**, not locally
- do not leave local and remote code in diverged states after finishing work
- when syncing to remote, exclude `.env` to preserve remote-specific config (e.g. DB port): `rsync --exclude .env`

### Git branching workflow

**All changes go on feature branches, never commit directly to main.**

- When starting a new session (no conversation history), create a new branch from main:
  `ssh synapse 'cd /home/ubuntu/Synapse && git checkout main && git pull && git checkout -b session/YYYY-MM-DD-topic'`
- Multiple commits on the branch are fine during a session
- When ready to release, open a PR from the branch to main and merge
- All commits and pushes happen on the synapse remote:
  `ssh synapse 'cd /home/ubuntu/Synapse && git add ... && git commit -m "..." && git push -u origin session/YYYY-MM-DD-topic'`
- After pushing, sync locally: `git fetch && git checkout session/YYYY-MM-DD-topic && git reset --hard origin/session/YYYY-MM-DD-topic`
- when syncing to remote, exclude `.env` to preserve remote-specific config (e.g. DB port): `rsync --exclude .env`

### OpenClaw plugin deployment

When `packages/openclaw-plugin/` has changes, the plugin must be published and deployed:

1. **Bump version** in `packages/openclaw-plugin/package.json`
2. **Publish** from synapse: `ssh synapse 'cd /home/ubuntu/Synapse/packages/openclaw-plugin && npm publish --access public'`
3. **Install on openclaw**: `ssh openclaw 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && rm -rf /home/ubuntu/.openclaw/extensions/synapse-openclaw-plugin && openclaw plugins install @vincentwei1021/synapse-openclaw-plugin'`
4. **Restart gateway**: `ssh openclaw '... && openclaw gateway restart'`

The `openclaw` command requires nvm initialization (`. "$NVM_DIR/nvm.sh"`) before use.

If only Synapse MCP server code changes (e.g. `src/mcp/tools/*.ts`, `src/services/*.ts`), the OpenClaw plugin does NOT need updating — only sync to synapse remote and restart the dev server.

### Three-environment sync verification

After finishing work, verify all three environments:

```bash
git log --oneline -1                    # local
ssh synapse 'cd /home/ubuntu/Synapse && git log --oneline -1'  # synapse
ssh openclaw 'cat /home/ubuntu/.openclaw/extensions/synapse-openclaw-plugin/package.json | grep version'  # openclaw plugin
```

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

### Keep page containers thin

Large client pages should be split into:

- shared types / pure helpers
- page-level data hooks or server loaders
- presentational sections
- dialog / mutation wiring in the top-level container

Recent examples:

- `src/app/(dashboard)/research-projects/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/research-projects/[uuid]/experiment-runs/run-detail-panel.tsx`

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

11. Reintroducing page-level aggregation
   Project list, dashboard, and group dashboard counts should come from `project-metrics.service.ts`, not fresh ad-hoc aggregation inside pages or routes.

12. Reintroducing request-path background work
   Do not restart GPU telemetry loops or Redis subscribers from ordinary request handlers or page data loaders.

13. Bypassing declarative tool registries
   Before adding a new MCP or OpenClaw tool by hand, check the existing registry helpers and `*-tool-definitions.ts` files first.

14. Missing owner scoping in agent management
   Agent management (now at `/agents`) must enforce both `companyUuid` and `ownerUuid`; same-company visibility alone is not sufficient.

15. Misreading blank time limit
   For `Experiment`, an empty `computeBudgetHours` input means unlimited (`null`), not zero. The UI label is "Time Limit" but the field name remains `computeBudgetHours`.

16. Using old agent roles
   New agents should use `pre_research`, `research`, `experiment`, `report`, `admin` — not the old `researcher_agent`, `research_lead_agent`, `pi_agent`. Old values are accepted for backward compat but should not be used for new agents.

17. Forgetting compute pool binding validation
   When a project has `computePoolUuid` set, GPU reservations must be from that pool. The `validatePoolBinding` helper in `compute.service.ts` handles this.

18. Session token expiry during long forms
   The dashboard layout has a proactive 45-minute token refresh interval. Do not remove it — it prevents logout during long form sessions.

19. Leaking SSH key paths in API responses
   SSH key file paths must be stripped from all API responses. Only expose `managedKeyAvailable` (boolean) and the access bundle endpoint. Never return server-side key paths to clients.

20. Bypassing experiment status restrictions via PATCH
   Experiment PATCH is locked down — callers cannot change `status`, `outcome`, or `results` directly. These fields are only modifiable through the dedicated start/complete/submit endpoints.

21. Forgetting notification permission grouping
   Notification preferences in Settings are grouped by the 5 agent permission categories (pre_research, research, experiment, report, admin). Keep new notification types in the correct group.

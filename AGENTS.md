# AGENTS.md - Synapse Quick Guide

This is the short, high-signal guide for agents working in Synapse. Keep it easy to scan.
For fuller background, see `docs/agent-working-guide.md`.

## Product Reality

Synapse is a research orchestration platform for human researchers and AI agents.
The active workflow is:

1. Humans create `ResearchProject` records.
2. Humans or agents create `ResearchQuestion` records.
3. Humans or agents create `Experiment` records.
4. Experiments are assigned to agents.
5. Agents inspect context, reserve compute, run work, and submit results through MCP tools.
6. Synapse updates experiment result documents and rolling project synthesis.

Use `Experiment` as the primary execution unit. Legacy `ExperimentDesign` and `ExperimentRun` routes still exist for compatibility, but new research work should not use them unless the task explicitly targets that legacy flow.

## Stack And Commands

- Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4, Prisma 7, PostgreSQL, Redis via `ioredis`, `next-intl`, Vitest, pnpm.
- `pnpm dev` starts the dev server.
- `pnpm build` runs Prisma generation and Next build.
- `pnpm lint` runs ESLint.
- `pnpm test` runs Vitest.
- `pnpm db:generate` is required after every `prisma/schema.prisma` change.
- `pnpm preflight` is the canonical local startup/env sanity check.

Restart the running app after schema changes.

## Architecture Rules

- Public references are UUID-first. Do not use serial IDs in URLs, APIs, assignments, notifications, or comments.
- Keep all data scoped by `companyUuid`.
- Business logic belongs in `src/services/*.service.ts`; routes and MCP tools should parse/auth/orchestrate, then call services.
- Project lists, dashboards, and group counts should use `src/services/project-metrics.service.ts`.
- User-facing frontend text must use i18n keys in both `messages/en.json` and `messages/zh.json`.
- Prefer server components. Add `"use client"` only for state, effects, browser APIs, or event handlers.
- Use existing shadcn/Radix UI primitives and existing board/panel/detail-sheet patterns.

## Active Models

The most important active models are:

- `ResearchProject`: brief, datasets, evaluation methods, compute pool, autonomous loop, auto search, rolling synthesis.
- `ResearchQuestion`: optional problem framing and hierarchy.
- `Experiment`: primary execution unit, with `status`, `liveStatus`, `liveMessage`, and `liveUpdatedAt`.
- `Document`: project docs, experiment result docs, and `project_synthesis` docs.
- `RelatedWork`: papers linked to a project.
- `ComputePool`, `ComputeNode`, `ComputeGpu`, `ExperimentGpuReservation`: compute and GPU reservations.
- `Agent`: composable permissions plus `type` (`openclaw` or `claude_code`).
- `AgentSession`, `Notification`, `Comment`, `Mention`, `Activity`: observability and collaboration.

## Agent Permissions And Transport

Agents use composable `roles`:

- `pre_research`: literature search, paper collection, project context.
- `research`: research question CRUD and management.
- `experiment`: experiment start/complete/submit, compute tools, metrics/baseline.
- `report`: document CRUD, deep research reports, synthesis tools.
- `admin`: create/delete projects, manage groups, review/close/delete questions.

Agent `type` controls transport:

- `openclaw`: realtime task delivery through SSE notifications.
- `claude_code`: discovers tasks at session start through checkin assignments.

Auto-search, deep research, and autonomous loop dispatch require realtime transport. Filter UI dropdowns with `?transport=realtime` where relevant. The mapping lives in `src/lib/agent-transport.ts`.

## MCP Tools To Prefer

For current research work, prefer:

- Project/context: `synapse_get_research_project`, `synapse_get_project_full_context`
- Questions: `synapse_get_research_question`
- Experiments: `synapse_get_experiment`, `synapse_get_assigned_experiments`, `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_report_experiment_progress`, `synapse_propose_experiment`
- Compute: `synapse_list_compute_nodes`, `synapse_reserve_gpus`, `synapse_get_node_access_bundle`
- Comments: `synapse_add_comment`, `synapse_get_comments`
- Literature: `synapse_search_papers`, `synapse_read_paper_brief`, `synapse_read_paper_head`, `synapse_read_paper_section`, `synapse_read_paper_full`, `synapse_add_related_work`, `synapse_get_related_works`
- Synthesis: `synapse_save_project_synthesis`, `synapse_complete_task`

When adding tools, prefer the declarative registries:

- MCP: `src/mcp/tools/tool-registry.ts`, `src/mcp/tools/compat-alias-tools.ts`
- OpenClaw: `packages/openclaw-plugin/src/tools/common-tool-definitions.ts`, `packages/openclaw-plugin/src/tools/tool-registry.ts`

## Experiment Execution Rules

- Ask agents to create and maintain a todo list before complex implementation or experiment execution.
- Agents must call `synapse_list_compute_nodes` before any execution decision. Do not infer availability from memory or project text.
- If a project has `computePoolUuid`, reservations must stay inside that pool.
- Agents do not SSH with server-local key paths. If `managedKeyAvailable=true`, call `synapse_get_node_access_bundle`, write the returned key locally, `chmod 600`, and SSH with the returned host/user/port.
- `Experiment.computeBudgetHours = null` means unlimited. Blank UI input must remain `null`, not `0`.
- Human-created experiments normally go to `pending_start` unless explicitly created as drafts.
- Approval must not silently assign an agent-created experiment back to its creator. Preserve explicit assignments and wake already-assigned experiments.

Live statuses:

- `sent`: assigned to an agent.
- `ack`: fetched by agent.
- `checking_resources`: checking GPU availability.
- `queuing`: waiting for resources.
- `running`: actively running.
- `null`: cleared on completion.

`synapse_report_experiment_progress` usually updates `liveMessage` and creates an `ExperimentProgressLog`. Exception: `liveStatus: "queuing"` is status-only and should not create progress-log noise.

## Autonomous Loop

Research projects can enable the autonomous loop through `autonomousLoopEnabled` and `autonomousLoopAgentUuid`.

- Human Review mode triggers when `draft=0`, `pending_review=0`, and `pending_start=0`.
- Full Auto mode triggers whenever `pending_start=0`, even if experiments are still `in_progress`.
- Create/update/delete/status changes should all re-check the loop when they affect experiment cards.
- In Full Auto mode, `synapse_propose_experiment` creates `pending_start` experiments assigned to the loop agent.
- Each generated experiment card should represent one independent run. Split comparisons, ablations, sweeps, and repeated runs into separate cards.
- The loop prompt should review project context, compute availability, and synthesis before proposing new work.

## Insights, Documents, And Comments

- `Insights` is the project-level synthesis surface.
- `synthesis_refresh_requested` should lead the agent to call `synapse_save_project_synthesis`, then `synapse_complete_task` with `taskType: "synthesis"`.
- Active synthesis work should mark Insights as working, not the Documents sidebar.
- Experiment result docs are project-scoped and soft-linked by `<!-- synapse:experiment:<experimentUuid> -->`.
- A soft-linked result document should link back to the corresponding experiment detail panel.
- New `comment_added` and `mentioned` notifications should appear in the bottom-right toast stream.
- The mention editor should allow `@` mentions anywhere in text.
- Prefer comments on `targetType: "experiment"` for current research work.

## UI Reality

Global nav: Research Projects, Compute, Agents, Settings.

Project nav: Overview, Related Works, Research Questions, Experiments, Insights, Documents, Project Settings.

Important UI notes:

- Experiments board has five columns: `draft`, `pending_review`, `pending_start`, `in_progress`, `completed`.
- Experiment cards show live status/message, not long descriptions.
- Research question cards should use the active agent color consistently.
- Global Settings links to `/onboarding`.
- Empty Research Projects page should guide users to create a project group and project.

## Environment And Git Workflow

Four environments must stay in sync:

1. Local: `/Users/weiyihao/personal/Synapse`
2. Synapse remote: `synapse:/home/ubuntu/Synapse`
3. Synapse test: `synapse-test:/home/ubuntu/Synapse`
4. OpenClaw machine: `openclaw`

Rules:

- Feature branches only; never commit directly to main.
- Commit and push from `synapse`, not locally.
- Sync local from origin after pushing.
- `synapse-test` syncs by `git pull`, not rsync.
- Exclude `.env` when rsyncing to `synapse`.
- Do not overwrite unrelated dirty files. Current screenshots or remote docker-compose edits may be user/local artifacts.

Useful verification:

```bash
git log --oneline -1
ssh synapse 'cd /home/ubuntu/Synapse && git log --oneline -1'
ssh synapse-test 'cd /home/ubuntu/Synapse && git log --oneline -1'
ssh openclaw 'cat /home/ubuntu/.openclaw/extensions/synapse-openclaw-plugin/package.json | grep version'
```

## OpenClaw Plugin Deployment

When `packages/openclaw-plugin/` changes:

1. Bump `packages/openclaw-plugin/package.json`.
2. Publish from `synapse`: `npm publish --access public`.
3. Install on `openclaw`: initialize nvm, remove old extension, run `openclaw plugins install @vincentwei1021/synapse-openclaw-plugin`.
4. Restart gateway with `openclaw gateway restart`.

Publishing requires npm publish permission. If npm 2FA is enabled, use a granular automation token that can publish the package, or pass a current OTP. Never commit tokens or leave them in checked-in config.

If only Synapse MCP/server code changes, the OpenClaw plugin does not need updating.

## Highest-Risk Pitfalls

- Using legacy `experiment_run` tools for new work.
- Waking OpenClaw through `/hooks/wake` instead of `/hooks/agent`.
- Assuming server-local SSH key paths.
- Bypassing company/owner scoping.
- Hardcoding frontend English.
- Reintroducing request-path background work for Redis/GPU telemetry.
- Letting PATCH mutate restricted experiment fields (`status`, `outcome`, `results`) instead of dedicated endpoints.
- Blocking Full Auto just because experiments are still running.
- Treating synthesis activity as Documents activity.

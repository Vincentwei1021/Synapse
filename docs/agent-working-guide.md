# Synapse Agent Working Guide

This document holds the fuller agent-facing context that used to live directly in `AGENTS.md` and `CLAUDE.md`.
Keep the root files short; put durable background and lower-frequency details here.

## Product Shape

Synapse coordinates research work between humans and AI agents. The current product is centered on:

- `ResearchProject`: project brief, datasets, evaluation methods, compute pool, autonomous loop, auto-search, and rolling synthesis.
- `ResearchQuestion`: optional framing and hierarchy.
- `Experiment`: the primary unit of execution and review.
- `Document`: project docs, experiment result docs, literature reviews, and project synthesis docs.
- `Compute`: pools, nodes, GPUs, reservations, and access bundles.
- `AgentSession`: observability for long-running or delegated work.

Legacy Chorus-derived entities such as `ExperimentDesign`, `ExperimentRun`, `RunDependency`, and `AcceptanceCriterion` still exist. Treat them as compatibility surfaces unless the user explicitly asks about that older flow.

## Main Code Areas

- `src/app/(dashboard)/research-projects/[uuid]/experiments`: current experiment board and detail workflow.
- `src/app/(dashboard)/research-projects/[uuid]/insights`: project synthesis surface.
- `src/app/(dashboard)/research-projects/[uuid]/related-works`: paper collection and deep research.
- `src/app/(dashboard)/research-projects/[uuid]/documents`: project and experiment result documents.
- `src/app/(dashboard)/agents`: user-managed agents and permissions.
- `src/app/(dashboard)/compute`: pools, nodes, GPUs, reservations, telemetry controls.
- `src/services/*.service.ts`: business logic.
- `src/mcp/tools`: Synapse MCP tools.
- `packages/openclaw-plugin`: OpenClaw integration, prompts, SSE routing, and shared tool definitions.

Large page containers should stay thin. Prefer splitting into data hooks/loaders, pure helpers, presentational sections, and dialog/mutation wiring. Existing examples include the research projects page and settings page.

## Data And Auth Rules

- Public references use UUIDs.
- Scope all reads/writes by `companyUuid`.
- User-owned agents, API keys, and sessions must also be scoped by `ownerUuid`.
- Auth contexts resolve to `user`, `agent`, or `super_admin`, with `companyUuid` and `actorUuid`.
- Agents authenticate with `syn_` API keys. Users use session/cookie auth.
- Do not expose server-side SSH key paths. API responses should expose `managedKeyAvailable` and use access bundle endpoints for actual key material.

## Service And Read-Model Rules

Routes and MCP tools should call service-layer functions rather than embedding business logic. Direct Prisma in `app/` should be rare and reserved for infrastructure probes such as `/api/health`.

Use `src/services/project-metrics.service.ts` for project lists, dashboards, group summaries, and completion-rate style counts. Avoid reintroducing ad hoc page-level aggregation.

Redis is optional. Realtime uses the event bus with Redis when available and in-memory pub/sub otherwise. Redis subscribers and telemetry loops should start explicitly in runtimes that need them, not as import-time side effects or ordinary request-path work.

## Agent Model

Agents use composable permissions in `roles`:

- `pre_research`
- `research`
- `experiment`
- `report`
- `admin`

Old role values (`researcher_agent`, `research_lead_agent`, `pi_agent`) are accepted for compatibility, but new code should not use them.

Agent `type` determines task delivery:

- `openclaw` receives realtime task notifications.
- `claude_code` discovers assignments during session startup/checkin.

Realtime dispatch features should only select realtime-capable agents. Keep `src/lib/agent-transport.ts` updated when adding new agent types.

## MCP And OpenClaw

The current research workflow should use experiment-oriented tools first:

- `synapse_get_research_project`
- `synapse_get_research_question`
- `synapse_get_experiment`
- `synapse_get_assigned_experiments`
- `synapse_start_experiment`
- `synapse_submit_experiment_results`
- `synapse_report_experiment_progress`
- `synapse_list_compute_nodes`
- `synapse_get_node_access_bundle`
- `synapse_add_comment`
- `synapse_get_comments`
- `synapse_get_project_full_context`
- `synapse_propose_experiment`
- paper tools under `synapse_search_papers` and `synapse_read_paper_*`
- `synapse_save_project_synthesis`
- `synapse_complete_task`

Prefer declarative tool definitions. Keep compatibility aliases explicit and close to registry layers.

OpenClaw wakes agents through `/hooks/agent`, not `/hooks/wake`. The agent assignment prompt is the primary message for an isolated agent turn.

## Experiment Lifecycle

Experiment statuses:

- `draft`
- `pending_review`
- `pending_start`
- `in_progress`
- `completed`

Human-created experiments usually start at `pending_start`. Agent-created experiments outside the autonomous loop usually go through review. The dedicated experiment endpoints own status/outcome/results transitions; generic PATCH should not mutate these restricted fields.

Experiment live status is a realtime sub-status:

- `sent`
- `ack`
- `checking_resources`
- `queuing`
- `running`
- `null`

Progress reports normally create `ExperimentProgressLog` entries. `queuing` is the exception: it should update live status/message only.

Approval should be assignment-neutral unless explicit assignment is provided or the experiment is already assigned. This avoids silently assigning Haru or another creator agent during approval.

`computeBudgetHours` is nullable. `null` means unlimited; blank form input should not become `0`.

## Compute Access

Agents must call `synapse_list_compute_nodes` before deciding where or whether to run work. Project text and stale memory are not enough.

If a project is bound to a compute pool through `computePoolUuid`, GPU reservations must come from that pool. The service helper validates this.

Correct SSH flow:

1. Inspect nodes with `synapse_list_compute_nodes`.
2. If `managedKeyAvailable=true`, call `synapse_get_node_access_bundle`.
3. Decode/write `privateKeyPemBase64` locally.
4. `chmod 600` the PEM.
5. SSH using returned host/user/port.

GPU telemetry is per-node background infrastructure controlled from the compute page. Do not restart telemetry from page loads or request helpers.

## Autonomous Loop

The autonomous loop uses project fields such as `autonomousLoopEnabled`, `autonomousLoopAgentUuid`, and loop mode.

Human Review mode triggers only when the human review/start queues are empty:

- `draft=0`
- `pending_review=0`
- `pending_start=0`

Full Auto mode triggers whenever `pending_start=0`. It must not wait for `in_progress=0`, because it is meant to keep the start queue filled.

Any experiment card mutation can make the loop eligible. Create, update, delete, and status transitions should all re-check the loop where relevant.

Generated experiment cards should be atomic: one independent run per card. Split comparisons, ablations, sweeps, and repeated runs into separate cards. This keeps review, assignment, compute reservation, and result documents clear.

## Insights And Documents

`Insights` is the project-level synthesis workflow. It is not the same as ordinary document activity.

For synthesis refresh:

1. The OpenClaw plugin receives `synthesis_refresh_requested`.
2. The agent analyzes project context and results.
3. The agent calls `synapse_save_project_synthesis`.
4. The agent calls `synapse_complete_task` with `taskType: "synthesis"`.
5. Synapse emits completion notifications such as `synthesis_refresh_completed`.

Active synthesis work should mark Insights as working, not the Documents left sidebar.

Documents are project-scoped. Experiment result documents are soft-linked by a marker:

```html
<!-- synapse:experiment:<experimentUuid> -->
```

When viewing a soft-linked result document, expose a link to open the corresponding experiment detail panel.

## Related Works

Related Works is project-level. It supports manual arXiv addition, auto-search, deep research reports, and progressive paper reading through DeepXiv/arXiv-backed tools.

Deep research produces `literature_review` documents. Auto-search and deep research dispatch should select realtime-capable `pre_research` or `report` agents as appropriate.

## Comments And Notifications

Current `Comment.targetType` values include:

- `research_question`
- `experiment`
- `experiment_design`
- `experiment_run`
- `document`

For current work, prefer `experiment` comments over legacy `experiment_run` comments.

`comment_added`, `mentioned`, and synthesis completion notifications should appear in the bottom-right toast stream.

Mentions should work anywhere in text, not only at the beginning of a sentence or block. Use the exact mention format expected by Synapse when prompting agents to reply:

```text
@[Name](actorType:actorUuid)
```

## UI And Product Notes

Global navigation:

- Research Projects
- Compute
- Agents
- Settings

Project navigation:

- Overview
- Related Works
- Research Questions
- Experiments
- Insights
- Documents
- Project Settings

Settings is for language, theme, notification preferences, and an entry point to the setup wizard at `/onboarding`. Agent management belongs under `/agents`.

The empty Research Projects page should act as an onboarding landing state that guides users to create a group and then a project.

Research Questions uses a canvas-style hierarchy view. Active/working card colors should derive from the active agent consistently.

Experiment cards should remain scannable: status, live badge, latest live message, and key metadata. Long descriptions belong in details, not cards.

## i18n

All user-facing frontend copy needs keys in:

- `messages/en.json`
- `messages/zh.json`

Use `useTranslations()` in client components and `getTranslations()` in server components. Do not ship hardcoded English JSX.

## Development Workflow

Keep these environments synchronized:

- Local: `/Users/weiyihao/personal/Synapse`
- Synapse remote: `synapse:/home/ubuntu/Synapse`
- Synapse test: `synapse-test:/home/ubuntu/Synapse`
- OpenClaw: `openclaw`

All code changes should end up on local, synapse remote, and synapse-test. Commit and push from `synapse`. Pull/reset locally after pushing. Pull on `synapse-test`.

When syncing to `synapse` manually, exclude `.env` to preserve remote config.

`synapse-test` is a full git clone. Use git operations there rather than rsync.

Do not revert or overwrite unrelated dirty files. If local screenshots or remote docker-compose edits exist, leave them alone unless the user explicitly asks.

## OpenClaw Plugin Release

When changing `packages/openclaw-plugin/`:

1. Bump package version.
2. Publish from `synapse` with `npm publish --access public`.
3. Install the published package on `openclaw`.
4. Restart the OpenClaw gateway.
5. Verify the installed package version.

The `openclaw` command requires nvm initialization. npm publish requires a token/account with package publish permission. For 2FA accounts, use a publish-capable granular automation token or pass OTP.

If only Synapse MCP server files change, plugin publish is not needed.

## Release Notes

When releasing a new product version, update the "What's New" sections in both `README.md` and `README.zh.md` with concise, user-facing bullets.

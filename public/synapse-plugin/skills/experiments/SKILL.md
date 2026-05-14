---
name: experiments
description: Plan, revise, execute, and report Synapse experiments, including compute access and result submission.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Experiments Skill

Use this skill for the experiment stage: drafting plans, revising returned experiments, running approved work, using compute, and submitting results.

## Prompt Boundary

Stay inside this skill when the work is about:
- creating a brand-new experiment from scratch
- `draft`, `pending_review`, `pending_start`, `in_progress`, or `completed` experiments
- plan authoring or revision based on reviewer feedback
- reserving GPUs and starting workloads
- reporting progress and saving results
- writing experiment result reports

Hand off to:
- **[research](../research/SKILL.md)** for literature and deep research
- **[documents](../documents/SKILL.md)** for Markdown report figures, `chart` blocks, and Synapse-hosted image uploads
- **[autonomy](../autonomy/SKILL.md)** to drive the CC-client autonomous loop when there is nothing to execute and you need to propose the next experiment
- **[sessions](../sessions/SKILL.md)** when running multiple experiments in parallel via sub-agents

## Empty-Assignment Onboarding

If `synapse_get_assigned_experiments` returns empty, do not idle. Ask the user which path:

1. **Execute an approved experiment** — list `pending_start` experiments in the project with `synapse_get_project_full_context` and ask which to start.
2. **Flesh out a quick idea** — call `synapse_get_project_full_context`, then draft a plan with `synapse_create_experiment` (defaults to `draft`; run a self-review sub-agent before pushing to `pending_review` per the "Create → Self-Review → Pending Review → Verbal Approve" section below).
3. **Create the foundational experiment** — if the project has no completed experiments, offer the foundational template below.
4. **Enter the autonomous loop** — hand off to **[autonomy](../autonomy/SKILL.md)** to propose and auto-dispatch the next experiment.

## Create → Self-Review → Pending Review → Verbal Approve

Every agent-created experiment goes through this sequence before reaching `pending_review`.

1. `synapse_create_experiment(...)` — defaults to `draft`. The PostToolUse hook will remind you to run self-review next.
2. Spawn a self-review sub-agent with the `Task` tool. Use a prompt similar to:
   ```
   Self-review experiment <experimentUuid> for project <projectUuid>.
   Call synapse_get_experiment to read the plan. Then evaluate against the project's evaluationMethods:
   - Is the objective specific and measurable?
   - Is the methodology sound and reproducible?
   - Do the success criteria align with the project's evaluation methods?
   - Is the compute budget realistic given current availability (synapse_list_compute_nodes)?
   Return a short verdict: "pass" or a bulleted list of concrete revisions.
   Do NOT write back to Synapse — your verdict is consumed in-session by the main agent.
   ```
3. If the verdict surfaces issues, apply revisions with `synapse_update_experiment_plan({ experimentUuid, ... })`.
4. `synapse_update_experiment_status({ experimentUuid, status: "pending_review" })` to push the draft into review.
5. Present the self-review summary and the plan summary to the user in the terminal. Wait for a verbal answer.
6. **On verbal approve:**
   ```
   synapse_review_experiment({
     experimentUuid,
     decision: "approved",
     reviewNote: 'User verbally approved in terminal: "<exact words>"',
   })
   ```
   That call atomically transitions to `pending_start`, writes the activity, and emits `task_assigned` so execution can begin.
7. **On verbal reject:** summarize the user's revision request in second-person Chinese, including a quoted phrase from the user, and pass it as `reviewNote`:
   ```
   synapse_review_experiment({
     experimentUuid,
     decision: "rejected",
     reviewNote: '用户口头要求修改：…（原话："…"）',
   })
   ```
   The review tool writes the comment and emits `experiment_revision_requested` automatically — **do not** also call `synapse_add_comment`.
8. After a reject, the experiment is back in `draft`. Revise per feedback, run self-review again, then resubmit to `pending_review`.
9. **Full-auto mode** (set verbally via the `autonomy` skill, lives only in the current CC session): after step 4, skip steps 5–8 and immediately call `synapse_review_experiment` with the fixed full-auto template:
   ```
   reviewNote: 'Full-auto session authorized by <ownerName> at <ISO time>. Self-review pass: <key points>.'
   ```
   If self-review timed out or errored: `'Self-review skipped: <reason>.'`. Full-auto **never pauses** on advisory self-review output — it only exits on user-stop or hard external errors.

The `synapse_review_experiment` tool requires `admin` or `pi_agent` role. To run verbal-approve flows on Claude Code, configure the CC agent with one of those roles.

## Foundational First Experiment

If the project has no completed experiments yet, the first experiment is not a normal research run — it is the project's baseline infrastructure. Drive it through three bundled deliverables before any comparison work:

1. **Data preparation** — normalize the raw dataset into a single canonical format every future experiment will consume. Keep the prep scripts under the project's repo (if one is configured via `synapse_get_repo_access`).
2. **Baseline run** — execute the simplest reasonable approach end-to-end and record its metrics with `synapse_submit_experiment_results`, so subsequent experiments have something to beat.
3. **Evaluation script** — implement the canonical eval harness future experiments will call. Commit alongside data prep.

If the project has a repo, commit all three onto the base branch (or a per-experiment branch merged back). Every subsequent experiment branches from that base so it inherits prep + eval automatically.

## Typical Flow

1. `synapse_checkin()` — refresh identity and assignments
2. Author or fetch the experiment
   - New plan: `synapse_create_experiment(...)` (defaults to `draft`; run a self-review sub-agent and revise before pushing to `pending_review` per the section below)
   - Existing assignment: `synapse_get_assigned_experiments()` then `synapse_get_experiment({ experimentUuid })`
3. If drafting or revising: `synapse_update_experiment_status({ status: "draft", liveStatus: "writing" })` + `synapse_update_experiment_plan(...)`, then `synapse_update_experiment_status({ status: "pending_review" })`
4. Before execution: `synapse_search_incident_lessons({ researchProjectUuid, query? })` for relevant prior failures/recoveries, then `synapse_list_compute_nodes({ onlyAvailable: true, researchProjectUuid })`
5. Reserve compute: optional `synapse_reserve_gpus(...)` or inline via `synapse_start_experiment({ gpuUuids })`
6. `synapse_start_experiment({ experimentUuid, workingNotes })` — moves to `in_progress`
7. If remote compute: `synapse_get_node_access_bundle({ experimentUuid, nodeUuid })`, write the returned `privateKeyPemBase64` to a local PEM, `chmod 600`, SSH with the returned host/user/port
8. If repo-backed: `synapse_get_repo_access` → clone → branch from the experiment's base branch (commit + push back to this repo at the end is mandatory)
9. Run the workload in a persistent remote shell (`tmux`/`screen`) with unbuffered output (`python -u …` or `PYTHONUNBUFFERED=1`) so logs never stall a tool call
10. Report progress with `synapse_report_experiment_progress` at milestones — `phase` ∈ `setup` | `training` | `evaluation` | `analysis`; `liveStatus` ∈ `checking_resources` | `queuing` | `running`
11. If you hit a reusable execution issue and recover, call `synapse_record_experiment_incident_lesson({ status: "resolved_in_run", ... })` after the fix. Use progress logs for the live narrative; use incident lessons for root cause, resolution, and prevention.
12. For long runs (>30 min), the main agent must schedule its own monitor heartbeat with `CronCreate` so the experiment card never looks dead. See "Monitoring Long Runs With CronCreate" below for the exact pattern.
13. Commit code/artifacts to the experiment branch or base branch; capture the commit SHA
14. Finish with `synapse_submit_experiment_results({ outcome, experimentResults, branch, commitSha })` — `outcome` ∈ `success` | `failure` | `inconclusive`; on failure include the error and partial results
15. If the final outcome is `failure` or `inconclusive`, call `synapse_record_experiment_incident_lesson({ status: "caused_failure" | "unresolved", ... })` unless there is truly no reusable lesson; in that case state that explicitly in the report.
16. **Always** follow `synapse_submit_experiment_results` with `synapse_save_experiment_report({ experimentUuid, title, content })` — write a full markdown writeup (objective, methodology, results, analysis, charts where relevant). For generated plots, use **[documents](../documents/SKILL.md)** and upload each figure with `synapse_upload_document_image({ experimentUuid, filename, mimeType, base64Content })` before embedding the returned `/api/documents/.../images/...` URL. Do **not** post the report as a comment, and do **not** treat this step as optional even for `failure` / `inconclusive` runs
17. If revising per reviewer feedback, read the full thread first with `synapse_get_comments({ targetType: "experiment", targetUuid })` before editing the plan

## Core Rules

- **Never assume a server-local SSH key path exists.** Always fetch the access bundle and write the PEM locally.
- **One independent run per experiment card.** Do not bundle comparison runs, ablations, or parameter sweeps into a single experiment — create multiple cards.
- **Match the project description's language.** If the project brief is in Chinese, write the plan, progress, and report in Chinese.
- **If the project is repo-backed, you must commit back.** Whenever `synapse_get_repo_access` returns a configured repo, all experiment code, configs, and meaningful artifacts must be committed and pushed to that repo (on the experiment branch or merged to base), and the resulting `branch` + `commitSha` must be passed to `synapse_submit_experiment_results`. Local-only runs without a commit are not acceptable when a repo exists.
- **Always save an experiment report after submitting results.** Every `synapse_submit_experiment_results` call must be immediately followed by `synapse_save_experiment_report({ experimentUuid, title, content })` with a full markdown writeup. This applies to `success`, `failure`, and `inconclusive` outcomes alike.
- **Split plan / execution / report tools.** Use `synapse_update_experiment_plan` for plan edits, `synapse_report_experiment_progress` for live status, `synapse_submit_experiment_results` for completion, and `synapse_save_experiment_report` for the dedicated report. Do not substitute with comments.
- **Progress logs are not lessons.** Use `synapse_report_experiment_progress` for what is happening now. Use `synapse_record_experiment_incident_lesson` when the root cause / resolution / prevention would help a future agent.
- **Revision stays durable.** When a reviewer sends an experiment back, flip to `draft`, revise, then move it back to `pending_review`; leave a reply via `synapse_add_comment` using `@[name](actorType:uuid)` format to notify the reviewer.
- **Failures are data.** An experiment that crashes or shows a regression is still a valid submission: set `outcome: "failure"` (or `"inconclusive"`), write up what happened in `experimentResults` and the report, and record an incident lesson when there is reusable execution knowledge.

## Monitoring Long Runs With CronCreate

For any experiment that you expect to run longer than ~30 minutes, the main agent must set up its own heartbeat with Claude Code's built-in `CronCreate` tool so the experiment card stays current and the user (or the autonomous loop) sees regress / completion as soon as it happens. **Do not** ask the user to run `/loop` and **do not** install a remote cron job — the main agent owns this.

### When to schedule

Schedule the monitor **immediately after** `synapse_start_experiment` returns successfully, before you SSH into the node or hand off to the workload. That way the card is being touched even while the workload is still warming up.

### The CronCreate call

`CronCreate` is a deferred Claude Code tool. If its schema is not loaded yet, run `ToolSearch` with `select:CronCreate,CronDelete` once before scheduling.

```text
CronCreate({
  cron: "<every-N-minutes expression>",
  prompt: "Check Synapse experiment <experimentUuid>: read synapse_get_experiment, parse the latest tmux/log output on the remote node, and call synapse_report_experiment_progress with phase + liveStatus + a one-line message describing the latest metric. If the experiment has completed, call CronDelete on this job.",
  recurring: true,
  durable: true,
})
```

Capture the returned job id — you will need it for `CronDelete` when the experiment finishes.

### Cadence

- **Default: every 10 minutes** (`cron: "*/10 * * * *"`). This matches the `/loop` default and is the right starting point for almost every experiment.
- **Long experiments (expected to run >3 hours): tighten cadence over time.** Start with 10 minutes for the first few heartbeats so users see early-failure signals quickly; once the experiment has reached a steady-state training phase, the main agent should `CronDelete` the 10-minute job and `CronCreate` a 30-minute job (`cron: "*/30 * * * *"` — or pick `"7,37 * * * *"` etc to avoid the :00 / :30 fleet-wide convoy).
- **Avoid `:00` and `:30` exact minutes** unless something else demands them. The `CronCreate` schema documents that the global Claude fleet stampedes those marks; pick odd offsets (`*/10` is fine because of the natural distribution; `0 */1 * * *` for hourly is not — use `7 */1 * * *`).
- **Never schedule below 5 minutes.** Synapse's backend doesn't need that resolution and you'll burn through the 7-day recurring-task budget on noise.

### Required: `durable: true`

Set `durable: true` always. Long experiments routinely outlive a single CC session (user closes laptop overnight, CC restarts, etc.). With `durable: true`, the cron job persists to `.claude/scheduled_tasks.json` and resumes automatically — missed fires are caught up after restart, so the card never goes stale just because CC was offline.

The `recurring: true` 7-day auto-expiry is fine: very few experiments run longer than a week. If one does, the heartbeat firing one last time and self-deleting is a safe failure mode.

### What the heartbeat prompt does

When the cron fires, CC enqueues your prompt as a fresh user turn. The agent should:

1. `synapse_get_experiment({ experimentUuid })` — read current state.
2. If `status` is `completed` (success / failure / inconclusive), call `CronDelete({ id: <jobId> })` and exit. **Do not** keep heartbeating after completion.
3. Otherwise, SSH into the compute node (use the cached PEM, do not re-fetch the access bundle on every tick) and read the tail of the tmux log.
4. Compose a one-line `synapse_report_experiment_progress` update: latest metric, current phase, `liveStatus: "running"`. If progress has stalled (same metric for 3+ heartbeats), surface that to the user.
5. If you change cadence (10 min → 30 min after warmup), do `CronDelete(oldId)` then `CronCreate(...)` with the new cadence and the new id.

### Cleanup

After `synapse_submit_experiment_results`, the post-submit hook reminds you to call `synapse_save_experiment_report`. **At the same time**, call `CronDelete({ id: <heartbeatJobId> })` to stop the heartbeat. Forgetting this is the easiest mistake — the experiment is `completed` but a stale heartbeat keeps re-checking it for up to 7 days. Track the job id in your todo list right after `CronCreate` so you don't lose it.

### Why CronCreate, not `/loop` or remote cron

- `/loop` is the user-facing command that wraps `CronCreate`. The main agent should call `CronCreate` directly — never push the user to type `/loop` themselves.
- A remote cron job on the GPU node would work but adds operational overhead (SSH + cron edit + cleanup) and breaks if the node is reimaged. CC's scheduler is closer to the agent, knows when to fire (REPL-idle), and clears itself in 7 days.

## Running Multiple Experiments In Parallel

When the user wants to execute several `pending_start` experiments at the same time, the main agent should monitor and dispatch rather than run workloads itself. Spawn one Task-tool sub-agent per experiment UUID — the plugin's `SubagentStart` hook auto-creates a Synapse session and injects the full execution workflow. To track progress without blocking on any one sub-agent, schedule a single `CronCreate` heartbeat that reads `synapse_get_assigned_experiments({ statuses: ["in_progress", "completed"] })` and reports state changes — see "Monitoring Long Runs With CronCreate" above for the pattern. See **[sessions](../sessions/SKILL.md)** for the full sub-agent pattern.

## Reference

- **[Experiment workflow reference](../synapse/references/03-experiment-workflow.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**
- **[Plugin hooks and parallel execution](../synapse/references/05-session-sub-agent.md)**

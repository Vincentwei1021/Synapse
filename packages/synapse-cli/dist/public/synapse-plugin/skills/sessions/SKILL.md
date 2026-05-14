---
name: sessions
description: Understand the Synapse Claude Code plugin hooks, session lifecycle, and multi-agent parallel execution. Covers what each hook does, where plugin state lives, and how to run multiple experiments in parallel via Task sub-agents.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Sessions Skill

Use this skill when the task is about how the Synapse plugin itself behaves inside Claude Code: which hooks fire, what they inject into context, how sub-agent sessions are managed, and how to dispatch multiple experiments in parallel to Task sub-agents.

## Prompt Boundary

Stay inside this skill when the work is about:
- understanding why Synapse context appeared in the session (which hook injected it)
- debugging a sub-agent that is not behaving as expected (session, heartbeat, or teardown issue)
- deciding how a main agent should dispatch parallel experiment work across sub-agents
- deciding when to call `synapse_create_session` / `synapse_close_session` directly instead of relying on hooks

Hand off to:
- **[experiments](../experiments/SKILL.md)** for the actual work inside one experiment
- **[autonomy](../autonomy/SKILL.md)** for the CC-client autonomous loop

## Core Rule

For sub-agents spawned through the Task tool, sessions are fully automatic. Do not manually call `synapse_create_session` or `synapse_close_session` for a sub-agent unless you are debugging the lifecycle itself. The `SubagentStart` and `SubagentStop` hooks already do it.

## Plugin Hooks At A Glance

The plugin ships ten hooks wired up in `hooks/hooks.json`. Each reads/writes local state under `.synapse/` in the project and, when needed, calls Synapse MCP tools via the bundled `synapse-api.sh` wrapper.

| Hook script | Claude Code event | What it does | State touched | MCP calls |
|---|---|---|---|---|
| `on-session-start.sh` | `SessionStart` (`startup` \| `resume` \| `compact`) | Calls `synapse_checkin`, caches owner / roles / project UUID into `state.json`, scans for pre-assigned sub-agent session files, and builds the rich `additionalContext` block that orients the agent on assignments, projects, and workflow. | `state.json`, reads `sessions/*.json` | `synapse_checkin`, optional `synapse_session_heartbeat` |
| `on-user-prompt.sh` | `UserPromptSubmit` | Fast local-only check on every user turn. Scans `.synapse/sessions/` and injects a brief reminder that sub-agent sessions are auto-managed. No network calls (stays under 100 ms). | reads `sessions/` | none |
| `on-pre-enter-plan.sh` | `PreToolUse` (`EnterPlanMode`) | Injects planning-mode guidance: prefer the current Experiment pipeline (`draft → pending_review → pending_start → in_progress → completed`), plan one independent run per experiment card, do not plan to create sessions manually. | none | none |
| `on-pre-exit-plan.sh` | `PreToolUse` (`ExitPlanMode`) | Reminds the agent to verify that the plan is expressed as Experiment records before executing. | none | none |
| `on-pre-spawn-agent.sh` | `PreToolUse` (`Task`) | Before a sub-agent is spawned, atomically writes `.synapse/pending/{name}` with the agent name and type so the `SubagentStart` hook can claim it. Skips read-only sub-agent types. | writes `pending/{name}` | none |
| `on-subagent-start.sh` | `SubagentStart` | Atomically claims the pending file via `mv`, then either reuses an active session, reopens a closed one, or creates a new one via `synapse_list_sessions` / `synapse_reopen_session` / `synapse_create_session`. Writes `sessions/{name}.json`, stores the mapping in `state.json`, and injects the session UUID plus the execution workflow directly into the sub-agent's context. | `state.json`, `sessions/{name}.json`, `claimed/{agent_id}` | `synapse_list_sessions`, `synapse_create_session`, `synapse_reopen_session`, `synapse_session_heartbeat` |
| `on-teammate-idle.sh` | `TeammateIdle` | When a teammate sub-agent idles between turns, sends a heartbeat so its Synapse session does not auto-time-out after 1 hour. Output suppressed — this fires too often to notify the user. | reads `state.json` | `synapse_session_heartbeat` |
| `on-subagent-stop.sh` | `SubagentStop` | Looks up the session UUID, calls `synapse_close_session`, and cleans up `state.json`, `sessions/{name}.json`, and `claimed/{agent_id}`. | deletes state entries, `sessions/{name}.json`, `claimed/{agent_id}` | `synapse_close_session` |
| `on-task-completed.sh` | `TaskCompleted` | Scans the completed task description/subject for a `synapse:experiment:<uuid>` marker. If found, injects a reminder to finalize the experiment with `synapse_submit_experiment_results` (or report progress if still running). | reads task metadata only | none |
| `on-session-end.sh` | `SessionEnd` | Safety-checked cleanup. Removes `.synapse/` only when all sub-agent sessions are closed and `state.json` has no meaningful content left. | deletes `.synapse/` if safe | none |

## Local State Layout

The plugin keeps per-project state under `.synapse/` in the project working directory:

- `state.json` — flock-guarded key/value store. Holds owner info cached from `synapse_checkin`, agent roles, the primary project UUID, and the `session_{…}` / `agent_for_session_{…}` / `name_for_agent_{…}` mappings used by the start/stop hooks.
- `pending/{name}` — written by `on-pre-spawn-agent.sh`, atomically claimed by `on-subagent-start.sh` via `mv`.
- `claimed/{agent_id}` — marker file showing which pending entry was claimed.
- `sessions/{name}.json` — per-sub-agent session metadata: `sessionUuid`, `agentId`, `agentName`, `agentType`, `sessionAction`, `createdAt`. Other hooks (idle, stop, user-prompt) read from here to locate the session.

`on-session-end.sh` removes `.synapse/` only when it is safe; otherwise state is preserved across sessions so resumed work reconnects to the same Synapse sessions.

## MCP Connection Session vs Synapse Agent Session

These are two different things — do not confuse them.

- **MCP connection session** — the HTTP-streamable session on `/api/mcp`. Identified by the `mcp-session-id` header, auto-renewed on every request, expires after 30 minutes of inactivity. The plugin handles this transparently.
- **Synapse agent session** — a durable record in Synapse of which agent is working on what (the green / yellow / grey indicators on the Settings page). Created/closed by the plugin hooks above, or explicitly by `synapse_create_session` / `synapse_close_session`.

## Session Status Lifecycle

```
active ——(no heartbeat 1h)——> inactive ——(heartbeat)——> active
  \                                 \
   \—— close ——> closed ——(reopen)——> active
```

| Status | Meaning |
|---|---|
| `active` | Agent is working. Green indicator. |
| `inactive` | No heartbeat in over an hour. Yellow indicator. |
| `closed` | Session ended. Grey indicator. Can be reopened. |

## Session Tools

| Tool | Purpose |
|---|---|
| `synapse_list_sessions` | List sessions for the current agent. |
| `synapse_get_session` | Read one session's details. |
| `synapse_create_session` | Create a named session — usually only needed for direct (non-sub-agent) work. |
| `synapse_close_session` | Close a session. |
| `synapse_reopen_session` | Reopen a closed session instead of creating a duplicate with the same name. |
| `synapse_session_heartbeat` | Keep a session active. Hooks already send heartbeats automatically. |

## Running Multiple Experiments In Parallel

When the main agent needs to execute several `pending_start` experiments concurrently, it should **orchestrate, not execute**. The plugin does the heavy lifting for session bookkeeping; the main agent only needs to spawn sub-agents and monitor.

### Main agent: dispatch

```text
# 1. Refresh and list what needs to run
synapse_checkin()
synapse_get_assigned_experiments({ researchProjectUuid, statuses: ["pending_start"] })

# 2. Inspect each candidate
synapse_get_experiment({ experimentUuid })

# 3. For each experiment, spawn a Task sub-agent with the experiment UUID in the prompt.
#    The SubagentStart hook auto-creates/reuses a Synapse session and injects the
#    execution workflow. The main agent does not need to call synapse_create_session.
Task({
  subagent_type: "general-purpose",
  name: "training-worker-<short>",
  prompt: "Your Synapse experiment UUID: <experiment-uuid>. Run the experiment end to end."
})
```

### Sub-agent: execute

Each sub-agent follows the full execution checklist in **[experiments](../experiments/SKILL.md)**: `synapse_start_experiment` → `synapse_list_compute_nodes` / `synapse_reserve_gpus` → `synapse_get_node_access_bundle` → run remotely (tmux + unbuffered) → `synapse_report_experiment_progress` at milestones → `synapse_submit_experiment_results` → optional `synapse_save_experiment_report`.

### Main agent: monitor

The main agent does not block on any one sub-agent. After dispatching all sub-agents, it schedules a single Claude Code `CronCreate` heartbeat that polls Synapse on a cadence — see "Monitoring Long Runs With CronCreate" in the [experiments](../experiments/SKILL.md) skill for the full pattern. The heartbeat prompt should look like:

```text
CronCreate({
  cron: "*/10 * * * *",
  prompt: "Check Synapse for project <projectUuid>: synapse_get_assigned_experiments({ researchProjectUuid: '<projectUuid>', statuses: ['in_progress', 'completed'] }). For each still-in-progress experiment, synapse_get_experiment + synapse_report_experiment_progress with the latest tmux/log line. Once all have completed, CronDelete this job.",
  recurring: true,
  durable: true,
})
```

Within each fire of the heartbeat, the iteration looks like:

```text
synapse_get_assigned_experiments({
  researchProjectUuid,
  statuses: ["in_progress", "completed"]
})

# For any experiment still in_progress, read its latest state
synapse_get_experiment({ experimentUuid })

# Once all have completed, synthesize. If this is the assigned autonomous-loop
# agent, propose follow-ups; otherwise use synapse_create_experiment for
# user-directed terminal work.
synapse_propose_experiment({ researchProjectUuid, title, description })
```

`durable: true` keeps the heartbeat alive across CC restarts so cards do not go stale just because the user closed their laptop. Always `CronDelete` once every experiment is `completed` and synthesis has been written.

### Sequential multi-experiment sub-agent

A single sub-agent can also handle multiple experiments in order when dependencies matter:

```text
Task({
  subagent_type: "general-purpose",
  name: "sequential-worker",
  prompt: """
    Synapse experiments, in order (each depends on the previous):
      1. <experiment-uuid-1> — baseline evaluation
      2. <experiment-uuid-2> — ablation built on #1's results

    For each: start_experiment → run → report_progress → submit_results.
  """
})
```

## Project-Level MCP For Sub-Agents

Sub-agents only inherit Synapse MCP access if the MCP server is configured at the project level. Put the config in `.mcp.json` at the project root (the plugin bundle ships the template at `public/synapse-plugin/.mcp.json`). User-level-only MCP configs will not reach sub-agents.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Sub-agent cannot see Synapse tools | MCP is user-level only. Move `.mcp.json` to the project root. |
| Sub-agent session shown as `inactive` | Heartbeat has not fired for 1 h. Usually the sub-agent crashed; respawn with the same name — `SubagentStart` will reopen the existing session instead of making a duplicate. |
| Duplicate sessions appear with similar names | A previous sub-agent stopped without the `SubagentStop` hook firing (hard crash). Close stale sessions with `synapse_close_session`, then respawn. |
| Main agent did not receive checkin context | `SessionStart` hook failed (check `SYNAPSE_URL`, `SYNAPSE_API_KEY`). Call `synapse_checkin()` manually to recover. |
| Experiment stuck in `in_progress` | The sub-agent died before `synapse_submit_experiment_results`. Either resume by respawning the sub-agent with the same experiment UUID, or the main agent calls `synapse_report_experiment_progress` and then `synapse_submit_experiment_results({ outcome: "failure", experimentResults: { error: "..." } })` to close it out. |

## Reference

- **[Session and sub-agent reference](../synapse/references/05-session-sub-agent.md)**
- **[Experiments skill](../experiments/SKILL.md)**
- **[Autonomy skill](../autonomy/SKILL.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**

# Plugin Hooks, Sessions, And Multi-Agent Parallel Execution

This reference documents how the Synapse Claude Code plugin actually works: which hooks fire, what they do, where their state lives, and how to run multiple experiments in parallel using Task sub-agents.

---

## Plugin Layout

The plugin ships under `public/synapse-plugin/` in the repo and is installed into Claude Code's plugin directory. Three things matter for day-to-day use:

| Path | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest (name, version). |
| `.mcp.json` | MCP server config. Streamable HTTP transport to `${SYNAPSE_URL}/api/mcp` with `Authorization: Bearer ${SYNAPSE_API_KEY}`. |
| `hooks/hooks.json` | Wires Claude Code events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `SubagentStart`, `TeammateIdle`, `SubagentStop`, `TaskCompleted`, `SessionEnd`) to the hook scripts under `bin/`. |
| `bin/on-*.sh` + `bin/synapse-api.sh` | The hook scripts themselves. `synapse-api.sh` is the shared helper: flock-guarded state read/write and MCP JSON-RPC over streamable HTTP. |

Local state per project lives under `.synapse/` in the working directory.

---

## Hook Catalogue

| Hook script | Claude Code event | What it does | State touched | MCP calls |
|---|---|---|---|---|
| `on-session-start.sh` | `SessionStart` (`startup` \| `resume` \| `compact`) | Calls `synapse_checkin`, caches owner / roles / project UUID into `state.json`, scans for pre-assigned sub-agent session files, and builds the rich `additionalContext` block that orients the agent on assignments, projects, and workflow. On `resume`, injects the existing main session UUID instead of creating a new one. | `state.json`, reads `sessions/*.json` | `synapse_checkin`, optional `synapse_session_heartbeat` |
| `on-user-prompt.sh` | `UserPromptSubmit` | Fast local-only check on every user turn. Scans `.synapse/sessions/` and injects a brief reminder that sub-agent sessions are auto-managed and that experiment UUIDs should be passed in prompts. No network, stays under 100 ms. | reads `sessions/` | none |
| `on-pre-enter-plan.sh` | `PreToolUse` (`EnterPlanMode`) | Injects planning-mode guidance: prefer the current Experiment pipeline (`draft → pending_review → pending_start → in_progress → completed`), plan one independent run per experiment card, do not plan to create sessions manually. | none | none |
| `on-pre-exit-plan.sh` | `PreToolUse` (`ExitPlanMode`) | Reminds the agent to verify the plan is expressed as Experiment records before executing. | none | none |
| `on-pre-spawn-agent.sh` | `PreToolUse` (`Task`) | Atomically writes `.synapse/pending/{name}` with the agent name and type so the `SubagentStart` hook can claim it. Skips read-only sub-agent types (Explore, Plan, etc.). Per-spawn file avoids shared-state contention. | writes `pending/{name}` | none |
| `on-subagent-start.sh` | `SubagentStart` | Atomically claims the pending file via `mv`. Reuses an active session, reopens a closed one, or creates a new one via `synapse_list_sessions` / `synapse_reopen_session` / `synapse_create_session` (named by the sub-agent name). Writes `sessions/{name}.json`, stores `session_{id}` / `agent_for_session_{uuid}` / `name_for_agent_{id}` mappings in `state.json`, and injects the session UUID plus execution workflow directly into the sub-agent's context. | `state.json`, `sessions/{name}.json`, `claimed/{agent_id}` | `synapse_list_sessions`, `synapse_create_session`, `synapse_reopen_session`, `synapse_session_heartbeat` |
| `on-teammate-idle.sh` | `TeammateIdle` | Sends a heartbeat so the sub-agent's Synapse session does not auto-time-out after 1 hour. Output suppressed — this fires too often to notify the user. | reads `state.json` | `synapse_session_heartbeat` |
| `on-subagent-stop.sh` | `SubagentStop` | Looks up the session UUID, calls `synapse_close_session`, and cleans up `state.json` mappings, `sessions/{name}.json`, and `claimed/{agent_id}`. | deletes state entries, `sessions/{name}.json`, `claimed/{agent_id}` | `synapse_close_session` |
| `on-task-completed.sh` | `TaskCompleted` | Scans the completed task's description/subject for a `synapse:experiment:<uuid>` marker. If found, injects a reminder to finalize the experiment with `synapse_submit_experiment_results` (or report progress if still running). | reads task metadata only | none |
| `on-session-end.sh` | `SessionEnd` | Safety-checked cleanup. Removes `.synapse/` only when all sub-agent sessions are closed and `state.json` has no meaningful content left. Otherwise state is preserved so a resumed session reconnects to the same Synapse sessions. | deletes `.synapse/` if safe | none |

---

## Context Injection Points

The plugin injects context into the model via two channels in its hook output JSON:

- `systemMessage` — a toast shown to the user (not visible to the model in its system prompt).
- `hookSpecificOutput.additionalContext` — prepended to the model's system context.

Where context is injected:

- **SessionStart**: full checkin result, pending assignments, project summaries, workflow guide, session management rules, and (on resume) the main session UUID.
- **UserPromptSubmit**: short reminder listing active sub-agent sessions.
- **PreToolUse (EnterPlanMode / ExitPlanMode)**: plan-mode guidance.
- **PreToolUse (Task)**: reminder to pass experiment UUIDs into sub-agent prompts.
- **SubagentStart**: session UUID, execution workflow, owner identity (so sub-agents can `@mention` correctly).
- **TaskCompleted**: reminder to finalize a Synapse experiment if the task was linked to one.

---

## Local State Layout

Per-project state under `.synapse/`:

| Path | Owner | Lifecycle |
|---|---|---|
| `state.json` | all hooks | Flock-guarded key/value store. Owner info, agent roles, primary project UUID, and `session_{agent_id}` / `agent_for_session_{uuid}` / `name_for_agent_{id}` / `session_{name}` mappings. |
| `pending/{name}` | `on-pre-spawn-agent.sh` → `on-subagent-start.sh` | Written just before `Task` runs, atomically claimed by `mv` when the sub-agent actually starts. |
| `claimed/{agent_id}` | `on-subagent-start.sh` → `on-subagent-stop.sh` | Marker of which pending entry was claimed. Deleted on stop. |
| `sessions/{name}.json` | `on-subagent-start.sh` → `on-subagent-stop.sh` | Per-sub-agent session metadata: `sessionUuid`, `agentId`, `agentName`, `agentType`, `sessionAction` (`created` / `reused` / `reopened`), `createdAt`. Read by idle/stop/user-prompt hooks. |

`on-session-end.sh` only wipes `.synapse/` if everything inside is either closed or empty.

---

## MCP Connection Session vs Synapse Agent Session

These are two different things.

- **MCP connection session** — the HTTP-streamable session on `/api/mcp`. Identified by the `mcp-session-id` header, auto-renewed on every request, expires after 30 minutes of inactivity. Handled transparently by the plugin; you never touch it.
- **Synapse agent session** — a durable record in Synapse of which agent is working on what. Drives the green / yellow / grey indicators on the Settings page and the activity stream. Created/closed by plugin hooks, or explicitly via `synapse_create_session` / `synapse_close_session` for direct (non-sub-agent) work.

---

## Session Status Lifecycle

```text
active ——(no heartbeat 1h)——> inactive ——(heartbeat)——> active
  \                                 \
   \—— close ——> closed ——(reopen)——> active
```

| Status | Meaning |
|---|---|
| `active` | Agent is working. Green indicator. |
| `inactive` | No heartbeat in over an hour. Yellow indicator. |
| `closed` | Session ended. Grey indicator. Reusable via `synapse_reopen_session`. |

---

## Session Tools

| Tool | Purpose |
|---|---|
| `synapse_list_sessions` | List sessions for the current agent. |
| `synapse_get_session` | Read one session's details. |
| `synapse_create_session` | Create a named session — usually only needed for direct work, not sub-agents. |
| `synapse_close_session` | Close a session. |
| `synapse_reopen_session` | Reopen a closed session instead of creating a duplicate with the same name. |
| `synapse_session_heartbeat` | Keep a session active. Hooks already send heartbeats automatically via `TeammateIdle`. |

---

## Running Multiple Experiments In Parallel

The main agent **orchestrates**. Sub-agents **execute**. This is the recommended pattern whenever there is more than one `pending_start` experiment that can run concurrently.

### Architecture

```text
Main agent (Claude Code)
  ├── spawn Task → sub-agent A → Synapse session A → Experiment X
  ├── spawn Task → sub-agent B → Synapse session B → Experiment Y
  └── spawn Task → sub-agent C → Synapse session C → Experiment Z

All session creation / heartbeats / closes are handled by the plugin hooks.
```

Tool availability still depends on the Synapse roles attached to the API key. The sub-agent inherits the same MCP config the main agent uses (see **Project-Level MCP** below), but the roles it can exercise are determined by whichever API key is configured in `.mcp.json`.

### Main agent: dispatch

```text
# 1. Refresh and list what needs to run
synapse_checkin()
synapse_get_assigned_experiments({ researchProjectUuid, statuses: ["pending_start"] })

# 2. Inspect each candidate
synapse_get_experiment({ experimentUuid })

# 3. For each experiment, spawn a Task sub-agent with the experiment UUID in the prompt.
#    The SubagentStart hook auto-creates/reuses a Synapse session and injects the
#    execution workflow. The main agent does not call synapse_create_session.
Task({
  subagent_type: "general-purpose",
  name: "training-worker-1",
  prompt: "Your Synapse experiment UUID: <experiment-uuid>. Run the experiment end to end following the experiments skill."
})
```

### Sub-agent: execute

Each sub-agent follows the full execution checklist in **[03-experiment-workflow.md](03-experiment-workflow.md)**:

```text
synapse_start_experiment({ experimentUuid })
synapse_list_compute_nodes({ researchProjectUuid, onlyAvailable: true })   # if needed
synapse_reserve_gpus({ experimentUuid, gpuUuids })                         # if needed
synapse_get_node_access_bundle({ experimentUuid, nodeUuid })               # write PEM, chmod 600, SSH
# run in tmux with python -u
synapse_report_experiment_progress({ experimentUuid, message, phase, liveStatus })
synapse_submit_experiment_results({ experimentUuid, outcome, experimentResults })
synapse_save_experiment_report({ experimentUuid, title, content })         # if the flow needs it
```

### Planning / revision sub-agent

A sub-agent can also be used for plan authoring or reviewer-driven revision:

```text
synapse_get_experiment({ experimentUuid })
synapse_get_comments({ targetType: "experiment", targetUuid: experimentUuid })
synapse_update_experiment_status({ experimentUuid, status: "draft", liveStatus: "writing" })
synapse_update_experiment_plan({ experimentUuid, description: "## Objective\n\n..." })
synapse_update_experiment_status({ experimentUuid, status: "pending_review" })
```

### Main agent: monitor and continue

The main agent does not block on any individual sub-agent. It polls Synapse:

```text
synapse_get_assigned_experiments({
  researchProjectUuid,
  statuses: ["in_progress", "completed"]
})

# For any experiment still in_progress, read its latest state:
synapse_get_experiment({ experimentUuid })

# Once all have completed, synthesize and propose follow-ups:
synapse_save_project_synthesis({ researchProjectUuid, title, content })
synapse_propose_experiment({ researchProjectUuid, title, description })
```

### Sequential multi-experiment sub-agent

One sub-agent can also handle multiple experiments in order when dependencies matter:

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

---

## Project-Level MCP For Sub-Agents

Sub-agents only inherit Synapse MCP access if the MCP server is configured at the project level. Put `.mcp.json` at the project root (the plugin bundle ships the template at `public/synapse-plugin/.mcp.json`). User-level-only MCP configs will not reach Task sub-agents.

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_xxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Tips

- **Descriptive sub-agent names** — use `training-worker`, `eval-worker`, `exp-ablation-3` rather than `agent-1`. The name becomes the Synapse session name and is reused on respawn.
- **Session reuse is automatic** — respawn with the same name and `on-subagent-start.sh` will reuse/reopen the existing session rather than create a duplicate.
- **Heartbeats are automatic** — `TeammateIdle` sends them. You do not need to call `synapse_session_heartbeat` manually.
- **Main agent never SSHs** — it orchestrates and monitors. All remote work belongs in sub-agents.
- **Pass UUIDs, not workflow** — the `SubagentStart` hook already injects the experiment workflow. The main agent's sub-agent prompt only needs the experiment UUID plus a one-line intent.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Sub-agent cannot see Synapse tools | MCP is user-level only. Move `.mcp.json` to the project root. |
| Sub-agent session shown as `inactive` | Heartbeat has not fired for 1 h; sub-agent probably crashed. Respawn with the same name — `SubagentStart` will reopen the existing session. |
| Duplicate sessions appear with similar names | A previous sub-agent stopped without the `SubagentStop` hook firing (hard crash). Close stale sessions with `synapse_close_session`, then respawn. |
| Main agent did not receive checkin context | `SessionStart` hook failed; check `SYNAPSE_URL` and `SYNAPSE_API_KEY` in the environment. Recover by calling `synapse_checkin()` manually. |
| Experiment stuck in `in_progress` | Sub-agent died before `synapse_submit_experiment_results`. Either respawn the sub-agent with the same experiment UUID (it will resume), or close it out with `synapse_submit_experiment_results({ outcome: "failure", experimentResults: { error: "..." } })`. |
| `.synapse/` not cleaned up at session end | Deliberate — cleanup only happens when all sessions are closed and `state.json` is empty. Preserves state across resumed sessions. |

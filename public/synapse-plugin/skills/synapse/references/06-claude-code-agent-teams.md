# Claude Code Agent Teams + Synapse Integration

## Overview

This guide explains how to run **Claude Code Agent Teams** (swarm mode) with Synapse for full work observability. In this setup, a Team Lead agent orchestrates multiple sub-agents, each working on Synapse experiment runs in parallel, with every action tracked through Synapse Sessions.

The Synapse Plugin **fully automates** session lifecycle — sessions are created/reused on sub-agent spawn, heartbeats sent on idle, and sessions closed on sub-agent exit. The Team Lead focuses on work assignment, not session management.

### Two-Layer Architecture

Claude Code Agent Teams and Synapse serve different purposes:

| Layer | System | Purpose |
|-------|--------|---------|
| **Orchestration** | Claude Code Agent Teams | Spawning sub-agents, internal work-item dispatch, inter-agent messaging |
| **Work Tracking** | Synapse | Experiment-run lifecycle (claim → in_progress → to_verify → done), session observability, activity stream |

```
┌─────────────────────────────────────────────────────────┐
│ Claude Code Agent Teams (Orchestration)                 │
│                                                         │
│  Team Lead ──spawn──> Sub-Agent A ──spawn──> Sub-Agent B│
│     │                    │                      │       │
│  TeamCreate           Task tool              Task tool  │
│  TaskCreate           SendMessage            SendMessage│
│  TaskList/Update                                        │
└───────┬──────────────────┬──────────────────────┬───────┘
        │                  │                      │
        ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│ Synapse (Work Tracking & Observability)                  │
│                                                         │
│  Session: "lead"    Session: "fe-worker"  Session: "be" │
│    │                  │                     │           │
│    │                  ├─ checkin → Task A    ├─ checkin  │
│    │                  ├─ update_task         │  → Task B │
│    │                  ├─ report_work         ├─ update   │
│    │                  └─ submit_for_verify   └─ report   │
│                                                         │
│  UI: Kanban badges, Run Detail workers, Activity stream │
└─────────────────────────────────────────────────────────┘
```

### Key Principle: One Session Per Worker

Every agent that works on Synapse experiment runs **must have its own separate Synapse Session**. This is a hard requirement — the UI relies on session checkins to show which worker is active on which run.

---

## MCP Access for Sub-Agents

Sub-agents spawned via Claude Code's `Task` tool can access Synapse MCP tools **if the MCP server is configured at the project level** (in `.claude/settings.json` or `.mcp.json`). This is the recommended setup.

If MCP is configured at the user level (`~/.claude/settings.json`), sub-agents may not have access. In that case, move the Synapse MCP config to the project level:

```json
// .mcp.json (project root)
{
  "mcpServers": {
    "synapse": {
      "type": "streamable-http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_xxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Complete Workflow

Session lifecycle is fully automated by the Synapse Plugin. The Team Lead should focus on work assignment, not session management.

### Phase 1: Team Lead — Plan & Prepare

```
# 1. Check in to Synapse
synapse_checkin()

# 2. Understand the project and available experiment runs
synapse_get_project({ projectUuid: "<project-uuid>" })
synapse_list_experiment_runs({ projectUuid: "<project-uuid>", status: "assigned" })

# 3. Read experiment-run details to plan work distribution
synapse_get_experiment_run({ runUuid: "<run-A-uuid>" })
synapse_get_experiment_run({ runUuid: "<run-B-uuid>" })

# The main agent (Team Lead) does NOT need a session.
# Sessions are only for sub-agents — the plugin auto-creates them when sub-agents spawn.
```

### Phase 2: Team Lead — Create Claude Code Team & Spawn Sub-Agents

The plugin auto-injects session UUID and workflow instructions directly into each sub-agent's context via the SubagentStart hook. The Team Lead only needs to pass the Synapse experiment-run UUID(s) — no session files, no workflow boilerplate.

```python
# 1. Create a Claude Code team
TeamCreate({ team_name: "feature-x", description: "Implementing feature X" })

# 2. Create internal work items for tracking
TaskCreate({ subject: "Frontend: build user form", description: "synapse:experiment_run:<run-A-uuid>" })
TaskCreate({ subject: "Backend: create API endpoints", description: "synapse:experiment_run:<run-B-uuid>" })

# 3. Spawn sub-agents — just pass experiment-run UUIDs, plugin injects session workflow automatically
Task({
  subagent_type: "general-purpose",
  team_name: "feature-x",
  name: "frontend-worker",
  prompt: """
    Your Synapse experiment-run UUID: run-A-uuid
    Project UUID: project-uuid

    Implement the frontend user form component...
  """
})

Task({
  subagent_type: "general-purpose",
  team_name: "feature-x",
  name: "backend-worker",
  prompt: """
    Your Synapse experiment-run UUID: run-B-uuid
    Project UUID: project-uuid

    Implement the backend API endpoints...
  """
})
```

**What the Team Lead prompt needs:**
- **Experiment-run UUID(s)** — which Synapse experiment runs this sub-agent should work on
- **NO session UUID, NO workflow boilerplate** — the plugin auto-injects everything via SubagentStart hook

### Phase 3: Sub-Agent — Execute Work

The plugin injects the session UUID and workflow instructions directly into the sub-agent's context via the SubagentStart hook. The sub-agent sees these as additional context when it starts.

```
# === Session Auto-Injected by Plugin (sub-agent sees this automatically) ===
# Session UUID, workflow steps, and MCP call examples are injected into context.
# No file reading needed.

# === Synapse Setup (FIRST, before any coding) ===

# 2. Check in to the experiment run — makes you visible in the UI
synapse_session_checkin_experiment_run({
  sessionUuid: "<my-session-uuid>",
  runUuid: "<my-run-uuid>"
})

# 3. Move the experiment run to in_progress
synapse_update_experiment_run({
  runUuid: "<my-run-uuid>",
  status: "in_progress",
  sessionUuid: "<my-session-uuid>"
})

# === Do the actual work (coding, testing, etc.) ===
# ...write code, run tests, create commits...

# === Progress reporting (periodically during work) ===

# 4. Report progress (auto-heartbeats the session)
synapse_report_work({
  runUuid: "<my-run-uuid>",
  report: "Completed user form component.\n- Files: src/components/UserForm.tsx\n- Commit: abc123",
  sessionUuid: "<my-session-uuid>"
})

# === Completion ===

# 5. Check out from the experiment run
synapse_session_checkout_experiment_run({
  sessionUuid: "<my-session-uuid>",
  runUuid: "<my-run-uuid>"
})

# 6. Submit for verification
synapse_submit_for_verify({
  runUuid: "<my-run-uuid>",
  summary: "Implemented user form with validation.\nFiles: ...\nAll tests passing."
})

# 7. Notify team lead via Claude Code messaging
SendMessage({ type: "message", recipient: "team-lead", content: "Experiment run complete", summary: "Frontend run done" })

# DO NOT close your session — the plugin closes it automatically when you exit.
```

### Phase 4: Team Lead — Verify, Unblock & Close

The Team Lead monitors until all Synapse experiment runs reach `to_verify` or `done`. Sessions are auto-closed by the plugin when sub-agents exit.

> **Automatic reminders:** The plugin's TaskCompleted hook will notify you each time a sub-agent finishes — showing the experiment run's AC status and any blocked downstream runs. You don't need to poll; just act on the reminders as they arrive.

> **Critical: If the Team Lead has admin role, it MUST verify experiment runs between waves.** Sub-agents submit runs to `to_verify`, but `to_verify` does NOT resolve dependencies — only `done` or `closed` does. Without verification, downstream runs will be permanently blocked.

```
# 1. Check which experiment runs are ready for verification
synapse_list_experiment_runs({ projectUuid: "<project-uuid>", status: "to_verify" })

# 2. Verify each completed experiment run (moves to_verify → done, unblocks dependents)
synapse_pi_verify_experiment_run({ runUuid: "<run-A-uuid>" })
synapse_pi_verify_experiment_run({ runUuid: "<run-B-uuid>" })

# 3. Check what's now unblocked for the next wave
synapse_get_unblocked_experiment_runs({ projectUuid: "<project-uuid>" })

# 4. Spawn the next wave of sub-agents for newly unblocked experiment runs
# ... (repeat Phase 2-4 until all experiment runs are done)

# 5. Sessions are closed automatically by the plugin (SubagentStop hook).

# 6. Clean up Claude Code team
# Send shutdown requests to sub-agents, then TeamDelete
```

If the Team Lead does NOT have admin role, it should notify the human admin to verify experiment runs so downstream work can proceed.

---

## Handling Experiment-Run Dependencies (DAG)

When Synapse experiment runs have dependencies (Run B depends on Run A), the Team Lead must coordinate the execution order.

> **Server-side enforcement**: `synapse_update_experiment_run(status: "in_progress")` will automatically reject if any `dependsOn` experiment run is not `done` or `closed`. The error includes detailed blocker info (title, status, assignee, active session). Sub-agents do NOT need to manually poll dependency status — the server enforces it.

**Recommended: Wave-based sequential spawning with verification**

> **Key rule**: `to_verify` does NOT count as resolved. Only `done` or `closed` resolves a dependency. The Team Lead must verify experiment runs between waves to unblock the next wave.

1. Use `synapse_get_unblocked_experiment_runs` to find experiment runs ready to start (all deps resolved)
2. Spawn sub-agents only for unblocked experiment runs (Wave 1)
3. Wait for Wave 1 experiment runs to reach `to_verify`
4. **Verify each experiment run**: `synapse_pi_verify_experiment_run()` → moves to `done` (requires admin role)
5. Check `synapse_get_unblocked_experiment_runs()` for newly unblocked experiment runs (Wave 2)
6. Spawn Wave 2 sub-agents
7. Repeat until all experiment runs are done

**Alternative: Spawn all, server rejects blocked ones**
- Spawn all sub-agents immediately
- Sub-agents that try to move blocked experiment runs to `in_progress` will receive a clear error with blocker details
- Those sub-agents can then use `synapse_get_unblocked_experiment_runs` to find other work, or wait and retry
- **Note**: Even in this mode, the Team Lead must still verify completed experiment runs to unblock dependents

---

## Multiple Experiment Runs Per Sub-Agent

A single sub-agent can work on multiple Synapse experiment runs sequentially. The Team Lead passes multiple run UUIDs, and the sub-agent processes them in order:

```python
Task({
  name: "full-stack-worker",
  prompt: """
    Your Synapse experiment runs (work in order):
    1. run-schema-uuid — Create database schema
    2. run-api-uuid — Implement API endpoints (depends on #1)
    3. run-tests-uuid — Write integration tests (depends on #2)

    For EACH experiment run, follow the Synapse workflow steps (auto-injected by plugin):
    checkin → in_progress → work → report → checkout → submit_for_verify
  """
})
```

The sub-agent checks in and out of each experiment run as it progresses, making each transition visible in the UI.

---

## Session Reuse Across Multiple Runs

If the Team Lead spawns sub-agents multiple times (e.g., after an experiment run is reopened by Admin), the plugin handles reuse automatically — if a session named "frontend-worker" already exists, the plugin reuses (if active) or reopens (if closed) it instead of creating a new one.

This keeps session history clean and makes it easier to trace work across multiple runs in the UI.

---

## Troubleshooting

### Sub-agent can't access Synapse MCP tools
- Verify MCP is configured at project level (`.mcp.json` or `.claude/settings.json`), not just user level
- Verify the API key in the MCP config has `developer_agent` role

### UI doesn't show active workers on an experiment run
- The sub-agent likely forgot to call `synapse_session_checkin_experiment_run`
- Check: `synapse_get_session({ sessionUuid })` to see active checkins
- Manual fix: call `synapse_session_checkin_experiment_run` for the sub-agent's session

### Session shows as "inactive" (yellow dot)
- The sub-agent hasn't sent a heartbeat in over 1 hour
- The TeammateIdle hook sends heartbeats automatically — if still inactive, the agent may have crashed

### Experiment run stuck in wrong status
- If a sub-agent crashed before completing, the experiment run may be stuck in `in_progress`
- Team Lead can: spawn a new sub-agent with the same name (plugin auto-reopens the session), or use `synapse_update_experiment_run` to reset status

### Duplicate sessions created
- This happens if someone manually calls `synapse_create_session` while the plugin also creates sessions
- **Fix**: Never call `synapse_create_session` — the plugin handles all session creation automatically
- If duplicates already exist, an Admin can close extras via the Settings page

### Sub-agent didn't receive session instructions
- The SubagentStart hook auto-injects session UUID and workflow into the sub-agent's context
- If missing, check that the plugin is loaded (`/plugin list`) and `SYNAPSE_URL` is set
- Ensure the `name` parameter is set when spawning (e.g., `name: "frontend-worker"`)

---

## Quick Reference

| Step | Who | Claude Code Tool | Synapse Tool |
|------|-----|-----------------|-------------|
| Plan work | Team Lead | — | `synapse_checkin`, `synapse_list_experiment_runs` |
| Create team | Team Lead | `TeamCreate` | — |
| Spawn workers | Team Lead | `Task` (pass experiment-run UUIDs only) | — |
| *(auto)* Create sessions + inject workflow | Plugin (SubagentStart) | — | *(automatic)* |
| *(auto)* Receive session + workflow | Sub-Agent | (injected into context) | — |
| Check in to experiment run | Sub-Agent | — | `synapse_session_checkin_experiment_run` |
| Start work | Sub-Agent | — | `synapse_update_experiment_run(in_progress, sessionUuid)` |
| Report progress | Sub-Agent | — | `synapse_report_work(sessionUuid)` |
| Complete experiment run | Sub-Agent | — | `synapse_session_checkout_experiment_run` + `synapse_submit_for_verify` |
| Notify lead | Sub-Agent | `SendMessage` | — |
| *(auto)* Heartbeat | Plugin | — | `synapse_session_heartbeat` |
| Monitor | Team Lead | `TaskList` | `synapse_list_experiment_runs` |
| *(auto)* Close sessions | Plugin | — | *(automatic)* |
| Shutdown | Team Lead | `SendMessage(shutdown_request)` + `TeamDelete` | — |

# Session & Agent Observability

## Overview

The Synapse Session mechanism tracks **which agent is currently working on which experiment run**. Session data powers the UI observability features: Kanban board worker badges, Run Detail panel active workers, Settings page session list.

**Sessions are exclusively for sub-agents.** The main agent (Team Lead) does NOT need a session — it works with Synapse tools directly without `sessionUuid`. The Synapse Plugin fully automates sub-agent session lifecycle — you never need to manually create, close, or reopen sessions.

### Core Concepts

```
Main Agent (no session needed):
  Agent ──> synapse_claim_experiment_run, synapse_update_experiment_run, synapse_report_work (no sessionUuid)

Multi-Agent / Swarm Mode (sub-agents get sessions):
  Main Agent (Team Lead) — no session
    ├── Sub-Agent A ──> Session (auto) ──checkin──> Run A
    ├── Sub-Agent B ──> Session (auto) ──checkin──> Run B
    └── Sub-Agent C ──> Session (auto) ──checkin──> Run A, Run B
```

- **Agent** = A Synapse identity (has API Key, role, persona)
- **Session** = A work unit for a **sub-agent** (one session per worker, auto-created by plugin)
- **Checkin** = Session declares it is working on a specific Experiment Run (sub-agents only)
- **Heartbeat** = Periodic signal indicating the worker is still active (auto-sent by plugin's TeammateIdle hook)

### Plugin Automation

| Event | Plugin Hook | What Happens |
|-------|------------|--------------|
| Sub-agent spawned | `SubagentStart` | Creates (or reuses) a Synapse Session, injects session UUID + workflow into sub-agent context |
| Sub-agent idle | `TeammateIdle` | Sends `synapse_session_heartbeat` to keep session active |
| Sub-agent exits | `SubagentStop` | Checks out all tasks + closes the session |

**What sub-agents still do manually:**
- `synapse_session_checkin_experiment_run` — before starting work on an experiment run
- `synapse_session_checkout_experiment_run` — when done with an experiment run
- Pass `sessionUuid` to `synapse_update_experiment_run` and `synapse_report_work` for attribution

**Main agent / Team Lead:** No session tools needed. Call `synapse_update_experiment_run` and `synapse_report_work` without `sessionUuid`.

### Mapping to Claude Code Agent Teams

| Claude Code Concept | Synapse Concept | Description |
|---------------------|----------------|-------------|
| Single Agent (main) | Agent, no session | Works directly with Synapse tools, no sessionUuid needed |
| Team Lead Agent | Main Agent | Assigns work to sub-agents; does NOT manage sessions |
| Spawned Sub-Agent | Session (auto-created) | Each sub-agent gets its own session automatically |
| Sub-Agent's Experiment Run | Session Checkin | Sub-agent checks in to the experiment run it is working on |
| Sub-Agent exits | Session Close (auto) | Plugin closes session, auto-checks out all experiment runs |

---

## Session Status Lifecycle

```
active ──(1h no heartbeat)──> inactive ──(heartbeat)──> active
  \                              \
   \── (exit) ──>                 \── (exit) ──> closed ──(respawn)──> active
```

| Status | Meaning | UI Indicator |
|--------|---------|-------------|
| `active` | Worker is actively working | Green dot |
| `inactive` | No heartbeat for over 1 hour | Yellow dot |
| `closed` | Session has ended (auto-reopened if sub-agent respawns with same name) | Gray dot |

---

## Session-Enhanced Tools

The following tools accept an optional `sessionUuid` parameter — **sub-agents should always pass it** for proper attribution (main agent can omit it):

| Tool | Session Behavior |
|------|-----------------|
| `synapse_update_experiment_run` | Activity record includes session attribution, auto-heartbeat |
| `synapse_report_work` | Activity record includes session attribution, auto-heartbeat |

---

## UI Observability

Session data is visible in the following UI locations:

1. **Settings page** — Expand "Sessions" under an Agent card to see all session statuses, task counts
2. **Kanban board** — In Progress cards display a worker count badge (e.g., "2 workers")
3. **Task Detail panel** — "Active Workers" section shows the currently checked-in session names and Agents
4. **Activity stream** — Operations with sessions display "AgentName / SessionName" attribution format

---

## Tips

- **Use meaningful sub-agent names** — The sub-agent `name` parameter (e.g., `frontend-worker`, `api-worker`) becomes the Synapse session name. Use descriptive names.
- **Task status ownership** — Only the sub-agent checked into a task should update that task's status. The Team Lead should not move tasks on behalf of sub-agents.
- **report_work includes auto-heartbeat** — Calling `synapse_report_work` with `sessionUuid` automatically updates the heartbeat.
- **A session can check in to multiple tasks** — If a worker handles multiple related tasks simultaneously, it can check in to all of them.
- **Session reuse is automatic** — If a sub-agent with the same name is respawned, the plugin reuses or reopens the existing session instead of creating a new one.

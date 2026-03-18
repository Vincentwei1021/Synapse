# Claude Code Agent Teams + Chorus Integration

## Overview

This guide explains how to run **Claude Code Agent Teams** (swarm mode) with Chorus for full work observability. In this setup, a Team Lead agent orchestrates multiple sub-agents, each working on Chorus tasks in parallel.

### Two-Layer Architecture

Claude Code Agent Teams and Chorus serve different purposes:

| Layer | System | Purpose |
|-------|--------|---------|
| **Orchestration** | Claude Code Agent Teams | Spawning sub-agents, internal task dispatch, inter-agent messaging |
| **Work Tracking** | Chorus | Task lifecycle (claim → in_progress → to_verify → done), activity stream |

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
│ Chorus (Work Tracking & Observability)                  │
│                                                         │
│  Task A ← Sub-Agent A        Task B ← Sub-Agent B      │
│    ├─ update_task(in_progress)  ├─ update_task           │
│    ├─ report_work               ├─ report_work           │
│    └─ submit_for_verify         └─ submit_for_verify     │
│                                                         │
│  UI: Kanban board, Task Detail, Activity stream         │
└─────────────────────────────────────────────────────────┘
```

---

## MCP Access for Sub-Agents

Sub-agents spawned via Claude Code's `Task` tool can access Chorus MCP tools **if the MCP server is configured at the project level** (in `.claude/settings.json` or `.mcp.json`). This is the recommended setup.

If MCP is configured at the user level (`~/.claude/settings.json`), sub-agents may not have access. In that case, move the Chorus MCP config to the project level:

```json
// .mcp.json (project root)
{
  "mcpServers": {
    "chorus": {
      "type": "streamable-http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer cho_xxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Complete Workflow

### Phase 1: Team Lead — Plan & Prepare

```
# 1. Check in to Chorus
chorus_checkin()

# 2. Understand the project and available tasks
chorus_get_project({ projectUuid: "<project-uuid>" })
chorus_list_tasks({ projectUuid: "<project-uuid>", status: "assigned" })

# 3. Read task details to plan work distribution
chorus_get_task({ taskUuid: "<task-A-uuid>" })
chorus_get_task({ taskUuid: "<task-B-uuid>" })
```

### Phase 2: Team Lead — Create Claude Code Team & Spawn Sub-Agents

Pass Chorus task UUIDs in the prompt to each sub-agent.

```python
# 1. Create a Claude Code team
TeamCreate({ team_name: "feature-x", description: "Implementing feature X" })

# 2. Create internal tasks for tracking
TaskCreate({ subject: "Frontend: build user form", description: "chorus:task:<task-A-uuid>" })
TaskCreate({ subject: "Backend: create API endpoints", description: "chorus:task:<task-B-uuid>" })

# 3. Spawn sub-agents — pass task UUIDs in the prompt
Task({
  subagent_type: "general-purpose",
  team_name: "feature-x",
  name: "frontend-worker",
  prompt: """
    You are a Developer Agent working with Chorus.

    Your Chorus task UUID: task-A-uuid
    Project UUID: project-uuid

    Chorus workflow (do this FIRST before any coding):
    1. chorus_update_task({ taskUuid: "task-A-uuid", status: "in_progress" })

    Then implement the frontend user form component...

    When done:
    2. chorus_report_work({ taskUuid: "task-A-uuid", report: "..." })
    3. chorus_submit_for_verify({ taskUuid: "task-A-uuid", summary: "..." })
  """
})
```

### Phase 3: Sub-Agent — Execute Work

Each sub-agent follows this sequence autonomously:

```
# === Chorus Setup (FIRST, before any coding) ===

# 1. Move task to in_progress
chorus_update_task({
  taskUuid: "<my-task-uuid>",
  status: "in_progress"
})

# === Do the actual work (coding, testing, etc.) ===
# ...write code, run tests, create commits...

# === Progress reporting (periodically during work) ===

# 2. Report progress
chorus_report_work({
  taskUuid: "<my-task-uuid>",
  report: "Completed user form component.\n- Files: src/components/UserForm.tsx\n- Commit: abc123"
})

# === Completion ===

# 3. Submit for verification
chorus_submit_for_verify({
  taskUuid: "<my-task-uuid>",
  summary: "Implemented user form with validation.\nFiles: ...\nAll tests passing."
})

# 4. Notify team lead via Claude Code messaging
SendMessage({ type: "message", recipient: "team-lead", content: "Task complete", summary: "Frontend task done" })
```

### Phase 4: Team Lead — Verify, Unblock & Close

The Team Lead monitors until all Chorus tasks reach `to_verify` or `done`. **Task verification (to_verify → done) is an Admin responsibility** — if you have admin role, verify tasks promptly to unblock downstream dependencies. `to_verify` does NOT resolve dependencies — only `done` does.

> **Note:** If you are using the Chorus Plugin for Claude Code, the TaskCompleted hook will automatically remind you each time a sub-agent finishes — showing the task's acceptance criteria status and any blocked downstream tasks.

```
# 1. Periodically check Chorus task status
chorus_list_tasks({ projectUuid: "<project-uuid>" })

# 2. Clean up Claude Code team
# Send shutdown requests to sub-agents, then TeamDelete
```

---

## Handling Task Dependencies (DAG)

When Chorus tasks have dependencies (Task B depends on Task A), the Team Lead must coordinate the execution order.

> **Server-side enforcement**: `chorus_update_task(status: "in_progress")` will automatically reject if any `dependsOn` task is not `done` or `closed`. The error includes detailed blocker info (title, status, assignee). Sub-agents do NOT need to manually poll dependency status — the server enforces it.

**Recommended: Wave-based sequential spawning**
- Use `chorus_get_unblocked_tasks` to find tasks ready to start (all deps resolved)
- Spawn sub-agents only for unblocked tasks (Wave 1)
- When Wave 1 tasks complete, check for newly unblocked tasks (Wave 2)
- Repeat until all tasks are done

**Alternative: Spawn all, server rejects blocked ones**
- Spawn all sub-agents immediately
- Sub-agents that try to move blocked tasks to `in_progress` will receive a clear error with blocker details
- Those sub-agents can then use `chorus_get_unblocked_tasks` to find other work, or wait and retry

---

## Multiple Tasks Per Sub-Agent

A single sub-agent can work on multiple Chorus tasks sequentially. The Team Lead passes multiple task UUIDs, and the sub-agent processes them in order:

```python
Task({
  name: "full-stack-worker",
  prompt: """
    Your Chorus tasks (work in order):
    1. task-schema-uuid — Create database schema
    2. task-api-uuid — Implement API endpoints (depends on #1)
    3. task-tests-uuid — Write integration tests (depends on #2)

    For EACH task:
    - chorus_update_task(in_progress) → work → chorus_report_work → chorus_submit_for_verify
  """
})
```

---

## Troubleshooting

### Sub-agent can't access Chorus MCP tools
- Verify MCP is configured at project level (`.mcp.json` or `.claude/settings.json`), not just user level
- Verify the API key in the MCP config has `developer_agent` role

### Task stuck in wrong status
- If a sub-agent crashed before completing, the task may be stuck in `in_progress`
- Team Lead can spawn a new sub-agent to continue, or use `chorus_update_task` to reset status

---

## Quick Reference

| Step | Who | Claude Code Tool | Chorus Tool |
|------|-----|-----------------|-------------|
| Plan work | Team Lead | — | `chorus_checkin`, `chorus_list_tasks` |
| Create team | Team Lead | `TeamCreate` | — |
| Spawn workers | Team Lead | `Task` (with task UUIDs in prompt) | — |
| Start work | Sub-Agent | — | `chorus_update_task(in_progress)` |
| Report progress | Sub-Agent | — | `chorus_report_work` |
| Complete task | Sub-Agent | — | `chorus_submit_for_verify` |
| Notify lead | Sub-Agent | `SendMessage` | — |
| Monitor | Team Lead | `TaskList` | `chorus_list_tasks` |
| Shutdown | Team Lead | `SendMessage(shutdown_request)` + `TeamDelete` | — |

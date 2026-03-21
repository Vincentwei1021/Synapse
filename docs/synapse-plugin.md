# Synapse Plugin for Claude Code

## Overview

The Synapse Plugin packages the Synapse Skill with **Hooks** for automatic session lifecycle management. Hooks guarantee execution at specific Claude Code lifecycle events, removing the dependency on Claude "remembering" to manage sessions.

### Architecture: Hook + Skill Division

```
Hooks (automatic, no intelligence needed):
  SessionStart  → synapse checkin + session discovery (inject context)
  SubagentStart → create Synapse session + write session file (SYNC)
  TeammateIdle  → session heartbeat
  SubagentStop  → auto-checkout all tasks + close Synapse session
  TaskCompleted → checkout via metadata bridge

Skill + MCP (requires LLM judgment):
  Task claiming, checkin_task, status updates, report_work, proposals
```

### Sub-agent Session Discovery (Plan A)

Sub-agents discover their Synapse session UUID without Team Lead intervention:

```
Team Lead spawns sub-agent "frontend-worker"
  │
  ├─ [Hook: SubagentStart] fires SYNCHRONOUSLY before sub-agent runs
  │   ├─ Creates Synapse session via MCP
  │   ├─ Writes .synapse/sessions/frontend-worker.json
  │   └─ Output to Team Lead: "Session UUID: xxx"
  │
  └─ Sub-agent starts
      ├─ [Hook: SessionStart] fires (if applicable)
      │   └─ Scans .synapse/sessions/ → outputs "Your session: xxx"
      │
      └─ OR: Sub-agent reads .synapse/sessions/frontend-worker.json
          (instructed by skill docs or Team Lead prompt)
```

The sub-agent gets its session UUID via **two redundant paths**:
1. **SessionStart hook** scans session files and outputs them as context
2. **File read** — the sub-agent reads `.synapse/sessions/<my-name>.json` directly

### Auto-cleanup on Sub-agent Exit (Plan D)

When a sub-agent exits, the SubagentStop hook automatically:
1. Queries the Synapse session for active task checkins
2. Checks out from every checked-in task
3. Closes the Synapse session
4. Removes the session file and state entries

This means sub-agents **never leave behind dangling checkins or open sessions**.

## Installation

### 1. Configure Environment

Set the following environment variables (e.g., in `.env` or your shell profile):

```bash
export SYNAPSE_URL="https://synapse.example.com"   # or http://localhost:3000
export SYNAPSE_API_KEY="syn_your_api_key_here"
```

### 2. Install Skill + Plugin

See the install instructions in `public/synapse-plugin/skills/synapse/SKILL.md` for skill details. The skill is bundled with the plugin and delivered automatically with plugin updates.

For **local development** within this repo, the skill is already symlinked:
```
.claude/skills/synapse → ../../public/synapse-plugin/skills/synapse
```

### 3. Load the Plugin

For external users who downloaded via the install script:
```bash
SYNAPSE_URL=<url> SYNAPSE_API_KEY=syn_xxx claude --plugin-dir .synapse-plugin
```

For local development within this repo:
```bash
SYNAPSE_URL=http://localhost:3000 SYNAPSE_API_KEY=syn_xxx claude --plugin-dir public/synapse-plugin
```

### 4. MCP Server

The plugin includes a `.mcp.json` template that configures the Synapse MCP server. It uses `$SYNAPSE_URL` and `$SYNAPSE_API_KEY` from the environment.

## File Layout

```
public/synapse-plugin/                # Plugin root
├── .claude-plugin/plugin.json
├── hooks/hooks.json
├── bin/                             # Hook scripts
│   ├── synapse-api.sh               # Shared API + state + session file helpers
│   ├── on-session-start.sh         # SessionStart: checkin + session discovery
│   ├── on-subagent-start.sh        # SubagentStart: create session + write file (SYNC)
│   ├── on-subagent-stop.sh         # SubagentStop: checkout tasks + close + cleanup
│   ├── on-teammate-idle.sh         # TeammateIdle: heartbeat
│   └── on-task-completed.sh        # TaskCompleted: checkout via metadata bridge
├── skills/synapse/                   # Skill files
│   ├── SKILL.md
│   ├── package.json
│   └── references/                  # Role-specific workflow docs
└── .mcp.json

.claude/skills/
└── synapse → ../../public/synapse-plugin/skills/synapse  (symlink, local dev)

Runtime state (gitignored):
.synapse/
├── state.json                       # Hook state: agent→session mappings
└── sessions/                        # Per-agent session files (Plan A)
    ├── frontend-worker.json
    └── backend-worker.json
```

## Hooks

### SessionStart

**Trigger:** Claude Code session starts or resumes.

**Behavior:**
1. Checks if `SYNAPSE_URL` and `SYNAPSE_API_KEY` are set
2. Calls `synapse_checkin` via MCP to verify connectivity and inject agent context
3. Outputs hook status and usage hints
4. If resuming with existing state, sends a heartbeat
5. **Session discovery (Plan A):** Scans `.synapse/sessions/` for pre-created session files and outputs them. If the current agent is a sub-agent, it can identify its own session by name.

### SubagentStart

**Trigger:** A sub-agent (teammate) is spawned via the Task tool.

**SYNCHRONOUS** — completes before the sub-agent starts executing.

**Behavior:**
1. Reads `agent_id`, `agent_name`, and `agent_type` from the event
2. Skips non-worker types (Explore, Plan, haiku, etc.)
3. Creates a Synapse session via MCP (`synapse_create_session`)
4. Stores mappings in `state.json` (by agent_id and agent_name)
5. **Writes session file** to `.synapse/sessions/<agent_name>.json` with full session info
6. Outputs session UUID and file path to Team Lead's context

### SubagentStop

**Trigger:** A sub-agent exits.

**Behavior:**
1. Reads `agent_id` and `agent_name` from the event
2. Looks up the session UUID from state
3. **Auto-checkout (Plan D):** Queries `synapse_get_session` for active task checkins, then calls `synapse_session_checkout_task` for each
4. Closes the Synapse session via MCP
5. Cleans up state entries and session file

### TeammateIdle

**Trigger:** A teammate goes idle (between turns).

**Behavior:**
1. Reads `agent_id` or `teammate_name` from the event
2. Looks up the session UUID from state (by agent_id or name)
3. Sends a heartbeat via `synapse_session_heartbeat`

This prevents Synapse sessions from being marked inactive during long-running agent team operations.

### TaskCompleted

**Trigger:** A Claude Code task is marked completed.

**Behavior:**
1. Reads task info from the event
2. Searches for `synapse:task:<uuid>` pattern in the task description/subject
3. If found, checks out the corresponding session from that Synapse task

## State File

The plugin stores session mapping state in `$CLAUDE_PROJECT_DIR/.synapse/state.json`. This file is automatically created and should be gitignored.

**Format:**
```json
{
  "main_session_uuid": "abc-123-...",
  "session_<agent_id>": "<synapse-session-uuid>",
  "session_<agent_name>": "<synapse-session-uuid>",
  "agent_for_session_<session-uuid>": "<agent-id>"
}
```

## Session Files (Plan A)

Per-agent session files live in `$CLAUDE_PROJECT_DIR/.synapse/sessions/<agent_name>.json`:

```json
{
  "sessionUuid": "abc-123-def-456",
  "agentId": "agent_abc123",
  "agentName": "frontend-worker",
  "agentType": "general-purpose",
  "synapseUrl": "http://localhost:3000",
  "createdAt": "2026-02-16T01:00:00Z"
}
```

These files are:
- **Created** by SubagentStart hook (synchronously, before sub-agent runs)
- **Read** by SessionStart hook (output as context) and by sub-agents directly
- **Deleted** by SubagentStop hook (cleanup on exit)

## Metadata Bridge

To link a Claude Code task with a Synapse task, include the pattern `synapse:task:<uuid>` in the Claude Code task description. For example:

```
TaskCreate:
  subject: "Implement login API"
  description: "Build the /api/login endpoint. synapse:task:a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

When the Claude Code task is completed, the `TaskCompleted` hook will automatically check out from the linked Synapse task.

## synapse-api.sh Commands

| Command | Description |
|---------|-------------|
| `checkin` | Check connectivity with Synapse backend |
| `mcp-tool <name> [args_json]` | Call any MCP tool via JSON-RPC |
| `state-get <key>` | Read a value from state.json |
| `state-set <key> <value>` | Write a value to state.json |
| `state-delete <key>` | Delete a key from state.json |
| `session-read <name>` | Read a session file for a named agent |
| `session-list` | List all pre-created session files as JSON |

## What Hooks Automate vs. What LLM Still Does

| Operation | Who | How |
|-----------|-----|-----|
| Create Synapse session | **Hook** (SubagentStart) | Automatic, sync |
| Session heartbeat | **Hook** (TeammateIdle) | Automatic, async |
| Close Synapse session | **Hook** (SubagentStop) | Automatic, async |
| Checkout all tasks on exit | **Hook** (SubagentStop) | Automatic, async |
| Checkout on CC task done | **Hook** (TaskCompleted) | Automatic, needs `synapse:task:<uuid>` |
| Discover session UUID | **Hook** (SessionStart) + **file** | Automatic via session files |
| Checkin to a task | **LLM** | `synapse_session_checkin_task` |
| Move task status | **LLM** | `synapse_update_task` |
| Report work | **LLM** | `synapse_report_work` (needs LLM to summarize) |
| Submit for verify | **LLM** | `synapse_submit_for_verify` (needs judgment) |
| Claim/release tasks | **LLM** | `synapse_claim_task` / `synapse_release_task` |

## Prerequisites

- `curl` — for REST API calls
- `jq` — for JSON parsing (recommended; basic fallback available without it)
- `SYNAPSE_URL` and `SYNAPSE_API_KEY` environment variables

## Troubleshooting

### Hook not firing

1. Verify the plugin is loaded: `claude --plugin-dir public/synapse-plugin` (or `.synapse-plugin` for external installs)
2. Check that `hooks.json` is valid JSON
3. Ensure hook scripts are executable (`chmod +x bin/*.sh`)

### "SYNAPSE_URL is not set"

Set the environment variables before starting Claude Code:
```bash
export SYNAPSE_URL="http://localhost:3000"
export SYNAPSE_API_KEY="syn_your_key"
```

### Session not created for sub-agent

The hook skips read-only agent types (Explore, Plan, haiku). Only worker agents (general-purpose, Bash) get Synapse sessions.

### Sub-agent can't find its session

1. Check that `.synapse/sessions/<agent-name>.json` exists
2. Verify SubagentStart hook ran (check Team Lead's context for "Synapse session auto-created" message)
3. Ensure the sub-agent name matches the filename

### State file not updating

Check that `$CLAUDE_PROJECT_DIR` is set and writable. The state file is at `$CLAUDE_PROJECT_DIR/.synapse/state.json`.

### Heartbeat failures

If heartbeats fail silently, check:
1. Network connectivity to Synapse
2. API key validity (keys expire if rotated)
3. Session may have been manually closed

# Building a Claude Code Plugin for Research Agent Teams: Design Patterns from Synapse

> This article explores the design and implementation of a Claude Code plugin for multi-agent research orchestration. Drawing from real production experience with the Synapse project, it covers the full plugin system -- Marketplace, MCP, Skills, Hooks -- with a focus on solving the context injection challenge in Agent Teams (Swarm mode).

## TL;DR

Claude Code's Agent Teams allow a Team Lead to orchestrate multiple Sub-Agents working in parallel. When you have an external research orchestration system, the central question becomes: **how do you automatically connect each Sub-Agent to the correct research workflow without the Team Lead hand-writing boilerplate in every spawn prompt?**

This article covers:

1. **The Claude Code plugin ecosystem** -- Marketplace, Plugin Manifest, Hooks, Skills, and MCP configuration form a complete extension mechanism
2. **Synapse as a case study** -- how a research orchestration platform integrates with Claude Code's multi-agent workflow through 10 lifecycle hooks
3. **Sub-Agent context injection via `SubagentStart`** -- the single most important pattern for seamless multi-agent automation, where the hook injects session UUID and workflow instructions directly into the Sub-Agent's context
4. **Cross-hook state management** -- using the filesystem as a state bridge between independent shell processes, with `flock` for concurrent write protection and atomic `mv` for ownership transfer

If you are building a Claude Code plugin for your own toolchain -- whether that is CI/CD, experiment tracking, monitoring, or anything else that needs to wire into multi-agent workflows -- this article should provide useful patterns.

---

## 1. Claude Code Agent Teams: A Quick Look at Swarm Mode

Agent Teams is Claude Code's multi-agent collaboration mode. The core concept:

```
Team Lead (main Agent)
  |-- Task tool --> Sub-Agent A (literature-reviewer)
  |-- Task tool --> Sub-Agent B (experiment-runner)
  +-- Task tool --> Sub-Agent C (report-writer)
```

The Team Lead uses the `Task` tool to spawn multiple Sub-Agents, each being an independent Agent process with its own context window, tool access, and lifecycle. Sub-Agents communicate via `SendMessage` and collaborate through a shared filesystem.

Key lifecycle events:

| Event | When Triggered | `additionalContext` Target |
|-------|---------------|--------------------------|
| `PreToolUse:Task` | **Before** Team Lead calls the Task tool | Team Lead |
| `SubagentStart` | When Sub-Agent process starts (synchronous) | **Sub-Agent** |
| `TeammateIdle` | When Sub-Agent goes idle (between turns) | Team Lead |
| `TaskCompleted` | When a Claude Code internal Task is marked complete | Team Lead |
| `SubagentStop` | When Sub-Agent process exits | Team Lead |

Note a critical distinction about where hook output goes:

- Most hooks (`PreToolUse:Task`, `TeammateIdle`, `TaskCompleted`, `SubagentStop`) inject `additionalContext` into the **Team Lead's** context
- **`SubagentStart` is the exception** -- its `additionalContext` is injected directly into the **Sub-Agent's** context

This means `SubagentStart` is the ideal hook for automatically providing Sub-Agents with working context (session IDs, workflow instructions, permissions) without relying on the Team Lead to hand-write boilerplate or the Sub-Agent to read files.

---

## 2. What Is Synapse

[Synapse](https://github.com/Vincentwei1021/Synapse) is a research orchestration platform where human researchers and AI agents collaborate throughout the research lifecycle. The core workflow:

```
Research Project --> Research Questions --> Experiments --> Reports
       ^                   ^                    ^              ^
     Human             Human/Agent          Agent          Agent
```

A typical Synapse research cycle looks like this:

1. A human researcher creates a **Research Project** with a description, datasets, and evaluation methods
2. The researcher (or an AI agent with `research` permission) frames **Research Questions** that define the problem space
3. **Experiments** are created -- either by humans or proposed by agents through the autonomous loop -- and assigned to agents for execution
4. Agents use **MCP tools** to check context, allocate compute (GPUs), start experiments, report progress, and submit results
5. Synapse updates **experiment result documents** and a **rolling project synthesis** that tracks cumulative findings

Agents in Synapse have 4 composable permissions:

| Permission | What It Covers |
|-----------|---------------|
| `pre_research` | Literature search, research project context reading, paper collection |
| `research` | Research question CRUD, hypothesis formulation |
| `experiment` | Experiment start/complete/submit, compute tools, GPU reservation |
| `report` | Document CRUD, synthesis tools, literature review generation |

An agent can hold any combination of these permissions. A fully autonomous agent might have all four; a specialized literature agent might only have `pre_research` and `report`.

Experiments flow through a five-column board:

```
draft --> pending_review --> pending_start --> in_progress --> completed
```

Each experiment card shows a live status badge (`sent`, `ack`, `checking_resources`, `queuing`, `running`) and a live progress message from the agent. When all experiment queues are empty and the autonomous loop is enabled, completing an experiment triggers the assigned agent to analyze results and propose new experiments -- creating a self-sustaining research cycle.

In multi-agent team scenarios, Synapse needs to solve **observability**: when 5 Sub-Agents are running experiments simultaneously, you need to know which agent owns which experiment run session, what progress each one is making, and whether sessions are healthy. Synapse tracks all of this through **Sessions** -- each working agent owns a Session, Sessions check in to experiment runs, and the UI shows real-time status.

---

## 3. Why Build a Plugin

Before the plugin, the Team Lead had to hand-write extensive boilerplate in every Sub-Agent's spawn prompt:

```python
Task({
  name: "experiment-runner",
  prompt: """
    Your Synapse session UUID: ??? (Team Lead doesn't know yet -- session hasn't been created)
    Your experiment run UUID: run-A-uuid

    Before work:
    1. Create session: synapse_create_session(...)
    2. Checkin: synapse_session_checkin_experiment_run(sessionUuid, runUuid)
    3. Start work: synapse_update_experiment_run(runUuid, "in_progress", sessionUuid)

    During work:
    4. Report progress: synapse_report_work(runUuid, report, sessionUuid)

    After completion:
    5. Self-check acceptance criteria: synapse_report_criteria_self_check(...)
    6. Checkout: synapse_session_checkout_experiment_run(sessionUuid, runUuid)
    7. Submit: synapse_submit_for_verify(runUuid, summary)
    8. Close session: synapse_close_session(sessionUuid)
  """
})
```

The problems:

1. **Session UUID cannot be known in advance** -- Sessions require MCP calls to create, but the prompt must be written before spawn
2. **Every Sub-Agent's prompt repeats the same boilerplate** -- 7-8 workflow steps consuming significant context
3. **The Team Lead must remember all the steps** -- Forgot checkout? Forgot heartbeat? The Session will go stale
4. **Session lifecycle management is complex** -- Create, reuse, reopen, heartbeat, close -- all manual

With the plugin, all of this is automated:

```python
Task({
  name: "experiment-runner",
  prompt: """
    Your experiment run UUID: run-A-uuid
    Run the hyperparameter sweep on the transformer model...
  """
})
```

From 15+ lines of boilerplate to 2 lines. The Team Lead only passes the experiment run UUID -- the plugin's `SubagentStart` hook automatically injects the session UUID and complete workflow instructions directly into the Sub-Agent's context. No session files to read, no workflow boilerplate to copy.

---

## 4. Claude Code Plugin System Overview

A Claude Code plugin is a directory containing these components:

```
my-plugin/
|-- .claude-plugin/
|   +-- plugin.json          # Plugin manifest (metadata)
|-- .mcp.json                # MCP server configuration
|-- hooks/
|   +-- hooks.json           # Hook configuration
|-- bin/                     # Hook scripts
|   |-- on-session-start.sh
|   +-- on-subagent-start.sh
+-- skills/
    +-- my-skill/
        |-- SKILL.md         # Skill entry file
        +-- references/      # Reference documents
```

### 4.1 Plugin Manifest (plugin.json)

Located at `.claude-plugin/plugin.json`, it is the plugin's identity card. Here is the Synapse plugin's current manifest:

```json
{
  "name": "synapse",
  "description": "Synapse research orchestration plugin for Claude Code. Connects AI agents to Synapse for experiment execution, literature search, progress reporting, and autonomous research loops.",
  "version": "0.5.0",
  "author": { "name": "Vincentwei1021" },
  "homepage": "https://github.com/Vincentwei1021/Synapse",
  "repository": "https://github.com/Vincentwei1021/Synapse",
  "license": "AGPL-3.0",
  "keywords": [
    "synapse", "research", "orchestration", "mcp",
    "experiments", "ai-agents", "literature-search"
  ]
}
```

`plugin.json` is optional -- if omitted, Claude Code infers the plugin name from the directory name and auto-discovers components. But providing one is recommended for version management and distribution.

### 4.2 Marketplace

Plugins are distributed through Marketplaces. A Marketplace is a JSON manifest file (`.claude-plugin/marketplace.json`) hosted in a public GitHub repo. Synapse uses its own repository as a Marketplace:

```json
{
  "name": "synapse-plugins",
  "owner": { "name": "Vincentwei1021" },
  "plugins": [
    {
      "name": "synapse",
      "source": "./public/synapse-plugin",
      "description": "Synapse research orchestration plugin...",
      "version": "0.5.0",
      "category": "research",
      "tags": ["research", "orchestration", "mcp", "experiments", "multi-agent"]
    }
  ]
}
```

Installation flow:

```bash
# 1. Add marketplace -- points to the GitHub repo
/plugin marketplace add Vincentwei1021/Synapse

# 2. Install plugin -- format: plugin-name@marketplace-name
/plugin install synapse@synapse-plugins

# 3. Optionally specify scope
/plugin install synapse@synapse-plugins --scope project  # Project-level (shared with team)
/plugin install synapse@synapse-plugins --scope local    # Local-level (just for you)
```

The `source` field points to the plugin's relative path within the repo. Besides local paths, it supports pointing to other GitHub repos (`"source": {"source": "github", "repo": "owner/repo"}`) or Git URLs.

### 4.3 MCP Configuration (.mcp.json)

Plugins can bundle MCP server configuration that takes effect automatically after installation:

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "${SYNAPSE_URL}/api/mcp",
      "headers": {
        "Authorization": "Bearer ${SYNAPSE_API_KEY}"
      }
    }
  }
}
```

`${SYNAPSE_URL}` and `${SYNAPSE_API_KEY}` are environment variables -- Claude Code substitutes them at runtime. Users set these once, and the plugin connects to the right Synapse instance.

After plugin installation, all MCP tools are automatically available. Sub-Agents can access them too (provided the MCP config is at the project level, not user level).

Synapse exposes its MCP tools via **HTTP Streamable Transport** -- the same protocol used by the hook scripts to call tools programmatically. API keys start with the `syn_` prefix and carry the agent's permission information. The server determines which tools are visible based on the key's permissions.

### 4.4 Skills

Skills are plugin-bundled instruction sets that Claude can invoke automatically when needed, or users can trigger manually via `/skill-name`.

A Skill consists of a `SKILL.md` entry file and optional `references/` documents:

```markdown
---
name: synapse
description: Synapse research orchestration platform Skill...
metadata:
  author: synapse
  version: "0.5.0"
  category: research
  mcp_server: synapse
---

# Synapse Skill

This Skill guides AI Agents on how to use Synapse MCP tools
for the full research lifecycle.

## Skill Files

| File | Description |
|------|-------------|
| **references/01-research-workflow.md** | Research agent workflow |
| **references/02-experiment-workflow.md** | Experiment execution workflow |
| **references/03-literature-tools.md** | Literature search and paper management |
| **references/04-agent-teams.md** | Agent Teams integration |
```

When an Agent invokes `/synapse` or Claude determines Synapse knowledge is needed, Skill docs are automatically loaded into context. This gives every Agent -- whether Team Lead or Sub-Agent -- a portable operations manual.

Skill frontmatter supports configuration options:

```yaml
---
name: my-skill
description: "When to use this skill"
allowed-tools: Read, Grep, Glob     # Tools allowed without permission prompts
model: claude-opus-4-6              # Specify model
context: fork                       # Run in subagent
disable-model-invocation: true      # Only user can trigger
---
```

### 4.5 Hooks

Hooks are the core of plugins -- they execute custom logic at key points in Claude Code's lifecycle.

Configured in `hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|compact",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/on-session-start.sh"
      }]
    }],
    "SubagentStart": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/on-subagent-start.sh"
      }]
    }],
    "SubagentStop": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/on-subagent-stop.sh"
      }]
    }]
  }
}
```

#### Hook Types

Claude Code supports three hook execution methods:

| Type | Description | Use Case |
|------|------------|----------|
| `command` | Execute a shell command, receiving event JSON via stdin, outputting results via stdout | Most scenarios |
| `prompt` | Use an LLM to evaluate decisions, model returns `{ok: true/false}` | When intelligent judgment is needed (e.g., code review) |
| `agent` | Spawn a subagent with tool access for verification | When complex multi-step verification is needed |

All of Synapse's hooks use the `command` type -- because the hook logic is deterministic (calling APIs, reading/writing files, managing state) and does not require LLM judgment. `prompt` and `agent` are better suited for scenarios that require "understanding" code content to make decisions, such as using an `agent` type in the `Stop` event to automatically run tests.

#### Hook Event Reference

| Event | When Triggered | Can Block |
|-------|---------------|-----------|
| `SessionStart` | Session start/resume/compact | No |
| `UserPromptSubmit` | User submits input | Yes |
| `PreToolUse` | Before tool execution | Yes |
| `PostToolUse` | After tool execution | No |
| `SubagentStart` | Sub-Agent starts | No |
| `SubagentStop` | Sub-Agent exits | Yes |
| `TeammateIdle` | Sub-Agent goes idle | Yes |
| `TaskCompleted` | CC Task completed | Yes |
| `SessionEnd` | Session ends | No |

#### Hook Output Format

Hooks output JSON via stdout:

```json
{
  "systemMessage": "User-visible notification message",
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "This text is injected into Claude's context",
    "permissionDecision": "allow"
  }
}
```

Key fields:

- **`systemMessage`**: Displayed in the Claude Code UI as a notification, visible to users
- **`additionalContext`**: Injected into the LLM's system context -- **this is the primary mechanism for hooks to influence Claude's behavior**
- **`permissionDecision`**: `allow` / `deny` / `ask`, used by `PreToolUse` to control tool execution permissions
- **`suppressOutput`**: Set to `true` to silence output -- used by heartbeat hooks to avoid noisy notifications

#### Synchronous vs Asynchronous

- **Synchronous hooks** (default): Block Claude until completion. Required when the hook's output must be available before the agent acts -- `SubagentStart` must be synchronous because the session UUID needs to exist before the Sub-Agent starts working
- **Asynchronous hooks** (`"async": true`): Run in background, non-blocking. Suited for operations that do not affect the flow -- heartbeats and cleanup

---

## 5. Implementation Deep Dive: The Synapse Plugin

The Synapse plugin lives at `public/synapse-plugin/` in the [Synapse repository](https://github.com/Vincentwei1021/Synapse). It registers **10 hooks** across 8 lifecycle events. Let us walk through each one and then examine the cross-cutting architectural patterns.

### 5.1 Architecture Overview

```
Team Lead calls Task tool to spawn Sub-Agent
  |
  |-- [PreToolUse:Task] on-pre-spawn-agent.sh
  |    Write .synapse/pending/<name> file (capture agent name)
  |
  |-- [SubagentStart] on-subagent-start.sh              <-- Core
  |    Claim pending file (atomic mv, handles concurrency)
  |    Create/reuse/reopen Synapse Session (MCP call)
  |    Inject session UUID + workflow into Sub-Agent via additionalContext
  |    Write minimal session file (metadata for other hooks)
  |    Store state mappings (agent_id <-> session_uuid)
  |
  |-- Sub-Agent starts executing
  |    Session UUID + workflow already in context (auto-injected)
  |    Autonomously execute: checkin -> in_progress -> report -> checkout -> submit
  |
  |-- [TeammateIdle] on-teammate-idle.sh (async)
  |    Send session heartbeat, keep session active
  |
  |-- [TaskCompleted] on-task-completed.sh
  |    Detect synapse:experiment_run:<uuid> tag, auto checkout
  |
  +-- [SubagentStop] on-subagent-stop.sh
       Batch checkout all experiment runs
       Close Synapse Session
       Clean up local state
       Query and display newly unblocked experiment runs
```

### 5.2 Hook 1: SessionStart -- Checkin + Context Injection

**Script**: `on-session-start.sh`
**Matcher**: `startup|resume|compact`
**Sync**: Yes (default)

This is the plugin's "startup self-check". The `compact` matcher is important -- when a long conversation triggers automatic context compaction, previously injected Synapse context is lost along with the compressed messages. Re-firing after compaction ensures the Agent never "forgets" its Synapse context.

The hook does three things:

1. **Calls `synapse_checkin()` via MCP** to get the current Agent's identity (permissions, name), assigned experiments, and unread notifications
2. **Caches owner info and roles** in `state.json` -- the owner's name, email, and UUID are stored so that `SubagentStart` can later inject them into Sub-Agent contexts (enabling agents to @mention their owner in comments)
3. **Scans `.synapse/sessions/`** to list existing Sub-Agent session metadata -- this handles session recovery when a Claude Code session is interrupted and resumed

```bash
# Core logic
CHECKIN_RESULT=$("$API" mcp-tool "synapse_checkin" '{}')

# Cache owner info for SubagentStart to inject into sub-agents
_OWNER_UUID=$(echo "$CHECKIN_RESULT" | jq -r '.agent.owner.uuid // empty')
"$API" state-set "owner_uuid" "$_OWNER_UUID"

# Cache agent roles for Stop hook (e.g. "experiment,report")
_ROLES=$(echo "$CHECKIN_RESULT" | jq -r '.agent.roles | join(",") // empty')
"$API" state-set "agent_roles" "$_ROLES"

CONTEXT="# Synapse Plugin -- Active
Synapse is connected at ${SYNAPSE_URL}.
## Checkin Result
${CHECKIN_RESULT}
## Session Management -- IMPORTANT
The Synapse Plugin fully automates session lifecycle...
Do NOT call synapse_create_session for sub-agents."

"$API" hook-output "$USER_MSG" "$CONTEXT" "SessionStart"
```

Result: The Agent has complete research context and behavioral guidelines from its very first conversation turn.

### 5.3 Hook 2: UserPromptSubmit -- Lightweight Status Reminder

**Script**: `on-user-prompt.sh`
**Sync**: Yes (default)

Triggered on every user input, so it must be extremely fast (<100ms). The hook makes **no network calls** -- only local file checks:

```bash
# Count json files in .synapse/sessions/
SESSION_COUNT=0
for f in "$SESSIONS_DIR"/*.json; do
  [ -f "$f" ] || continue
  SESSION_COUNT=$((SESSION_COUNT + 1))
  NAME=$(basename "$f" .json)
  SESSION_NAMES="${SESSION_NAMES}, ${NAME}"
done

CONTEXT="[Synapse Plugin Active]
- Sub-agent sessions are auto-managed by hooks.
- Active sub-agent sessions (${SESSION_COUNT}): ${SESSION_NAMES}"
```

This gives the Team Lead persistent status awareness of how many Sub-Agent sessions are running. No `systemMessage` is emitted -- that would be too noisy on every turn.

### 5.4 Hook 3: PreToolUse:Task -- Capture Agent Name Before Spawn

**Script**: `on-pre-spawn-agent.sh`
**Matcher**: `Task`
**Sync**: Yes (default)

The `SubagentStart` event only provides `agent_id` and `agent_type` -- **not the name** the Team Lead gave the Sub-Agent. But sessions need to be named (so the Sub-Agent can find its session file). This hook solves the problem by capturing the name early.

It extracts the `name` parameter from the `Task` tool input and writes a per-agent pending file:

```bash
# Extract name from tool_input
AGENT_NAME=$(echo "$EVENT" | jq -r '.tool_input.name // .input.name // empty')

# Write pending file for SubagentStart to claim
PENDING_DIR="${CLAUDE_PROJECT_DIR:-.}/.synapse/pending"
mkdir -p "$PENDING_DIR"

printf '{"name":"%s","type":"%s","ts":"%s"}\n' \
  "$AGENT_NAME" "$AGENT_TYPE" "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
  > "${PENDING_DIR}/${AGENT_NAME}"
```

Each spawn gets its own file -- no shared state, no concurrency issues between parallel spawns. The hook also skips non-worker agent types (`explore`, `plan`, `haiku`) that do not need Synapse sessions.

### 5.5 Hook 4: PreToolUse:EnterPlanMode -- Research Planning Guidance

**Script**: `on-pre-enter-plan.sh`
**Matcher**: `EnterPlanMode`
**Sync**: Yes (default)

When the Agent enters Plan Mode, the hook injects research workflow guidance:

```bash
CONTEXT="[Synapse Planning Workflow]
When planning implementation, follow the Synapse research lifecycle:
1. Identify or create a Synapse Research Question for this requirement
2. Create an Experiment Design with experiment-run drafts
3. Set up the experiment-run dependency DAG
4. Submit for PI approval
5. After approval, experiment runs can be claimed or assigned
Do NOT start coding without an approved Experiment Design..."
```

This demonstrates **soft guidance via hooks**: the hook does not block the operation (`permissionDecision` remains `allow`), but uses `additionalContext` to steer the Agent toward the correct research workflow. In research collaboration, suggestions are better than hard blocks.

### 5.6 Hook 5: PreToolUse:ExitPlanMode -- Reminder Check

**Script**: `on-pre-exit-plan.sh`
**Matcher**: `ExitPlanMode`
**Sync**: Yes (default)

When the Agent exits Plan Mode, a quick reminder to verify that an Experiment Design exists before proceeding to implementation. Again, soft guidance -- no blocking.

### 5.7 Hook 6: SubagentStart -- Session Creation + Direct Context Injection (Core)

**Script**: `on-subagent-start.sh`
**Sync**: Yes (default) -- **must be synchronous**

This is the plugin's most critical hook. It runs synchronously at spawn time and injects its output directly into the Sub-Agent's context (not the Team Lead's). The full flow:

**Step 1: Claim pending file (atomic ownership transfer)**

```bash
CLAIMED_FILE=""

# Strategy 1: exact match by agent_type (CC often uses name as agent_type)
if [ -f "${PENDING_DIR}/${AGENT_TYPE}" ]; then
  if mv "${PENDING_DIR}/${AGENT_TYPE}" "${CLAIMED_DIR}/${AGENT_ID}" 2>/dev/null; then
    CLAIMED_FILE="${CLAIMED_DIR}/${AGENT_ID}"
    AGENT_NAME="$AGENT_TYPE"
  fi
fi

# Strategy 2: FIFO -- claim oldest pending file
if [ -z "$CLAIMED_FILE" ] && [ -d "$PENDING_DIR" ]; then
  for candidate in $(ls -tr "$PENDING_DIR" 2>/dev/null); do
    if mv "${PENDING_DIR}/${candidate}" "${CLAIMED_DIR}/${AGENT_ID}" 2>/dev/null; then
      CLAIMED_FILE="${CLAIMED_DIR}/${AGENT_ID}"
      AGENT_NAME="${FILE_NAME:-$candidate}"
      break
    fi
  done
fi

# No pending file claimed --> internal/cleanup agent --> skip session creation
if [ -z "$CLAIMED_FILE" ]; then
  exit 0
fi
```

`mv` is atomic on the same filesystem -- only one process can successfully move a given file. This is lighter than `flock`, well-suited for "first come, first served" scenarios.

**Step 2: Session reuse logic**

```bash
SESSIONS_LIST=$("$API" mcp-tool "synapse_list_sessions" '{}')

MATCH=$(echo "$SESSIONS_LIST" | jq -r --arg name "$SESSION_NAME" '
  (if type == "array" then . else (.sessions // []) end)
  | map(select(.name == $name))
  | sort_by(.updatedAt // .createdAt)
  | last // empty
')

if [ "$MATCH_STATUS" = "active" ]; then
    SESSION_UUID="$MATCH_UUID"           # Reuse directly
    SESSION_ACTION="reused"
elif [ "$MATCH_STATUS" = "closed" ] || [ "$MATCH_STATUS" = "inactive" ]; then
    # Reopen closed session
    "$API" mcp-tool "synapse_reopen_session" "$(printf '{"sessionUuid":"%s"}' "$MATCH_UUID")"
    SESSION_ACTION="reopened"
else
    # Create new session
    "$API" mcp-tool "synapse_create_session" "$(printf '{"name":"%s",...}' "$SESSION_NAME")"
    SESSION_ACTION="created"
fi
```

Three-way logic: active sessions are reused directly, closed/inactive sessions are reopened, and only when nothing matches is a new session created. This handles the common case where the Team Lead spawns a Sub-Agent with the same name multiple times (e.g., after an experiment is reopened for revision).

**Step 3: Store state mappings + write session metadata file**

```bash
# State: 4 bidirectional mappings for any hook to look up
"$API" state-set "session_${AGENT_ID}" "$SESSION_UUID"
"$API" state-set "agent_for_session_${SESSION_UUID}" "$AGENT_ID"
"$API" state-set "session_${SESSION_NAME}" "$SESSION_UUID"
"$API" state-set "name_for_agent_${AGENT_ID}" "$SESSION_NAME"

# Session file: minimal metadata for TeammateIdle and SubagentStop
cat > "${SESSIONS_DIR}/${SESSION_NAME}.json" <<SESSIONEOF
{
  "sessionUuid": "${SESSION_UUID}",
  "agentId": "${AGENT_ID}",
  "agentName": "${SESSION_NAME}",
  "agentType": "${AGENT_TYPE:-unknown}",
  "sessionAction": "${SESSION_ACTION}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
SESSIONEOF
```

**Step 4: Inject workflow directly into Sub-Agent context**

```bash
WORKFLOW="## Synapse Session (Auto-injected by plugin)

Your Synapse session UUID is: ${SESSION_UUID}
Your session name is: ${SESSION_NAME}
The plugin manages session lifecycle. Do NOT call synapse_create_session or synapse_close_session.

### Workflow -- follow these steps for each experiment run:

**Before starting:**
1. Check in: synapse_session_checkin_experiment_run({ sessionUuid: \"${SESSION_UUID}\", runUuid: \"<RUN_UUID>\" })
2. Start work: synapse_update_experiment_run({ runUuid: \"<RUN_UUID>\", status: \"in_progress\", sessionUuid: \"${SESSION_UUID}\" })

**While working:**
3. Report progress: synapse_report_work({ runUuid: \"<RUN_UUID>\", report: \"...\", sessionUuid: \"${SESSION_UUID}\" })

**After completing:**
4. Self-check acceptance criteria (if structured criteria exist)
5. Check out: synapse_session_checkout_experiment_run(...)
6. Submit: synapse_submit_for_verify({ runUuid: \"<RUN_UUID>\", summary: \"...\" })"

"$API" hook-output \
  "Synapse session ${SESSION_ACTION}: '${SESSION_NAME}'" \
  "$WORKFLOW" \
  "SubagentStart"
```

The Sub-Agent sees the workflow as a `<system-reminder>` in its context from the very first turn. The session UUID is pre-filled in every tool call template. The Sub-Agent does not need to read any files, call any setup tools, or even know the plugin exists.

If owner info was cached by `SessionStart`, it is also injected -- enabling the Sub-Agent to @mention its human owner in comments when it has questions or findings to report.

### 5.8 Hook 7: SubagentStop -- Cleanup + Experiment Run Discovery

**Script**: `on-subagent-stop.sh`
**Sync**: Yes (SubagentStop runs in Team Lead context)

When a Sub-Agent exits, this hook performs four operations:

1. **Batch checkout** all unclosed experiment run checkins via `synapse_session_checkout_experiment_run`
2. **Close the Synapse session** via `synapse_close_session`
3. **Clean up local state** -- delete state entries, session file, and claimed file
4. **Query unblocked experiment runs** and notify the Team Lead via `additionalContext`

The fourth step is particularly valuable -- it implements **automatic experiment run dispatch discovery**:

```bash
UNBLOCKED_RESULT=$("$API" mcp-tool "synapse_get_unblocked_experiment_runs" \
  "$(printf '{"researchProjectUuid":"%s"}' "$PROJECT_UUID")")

UNBLOCKED_COUNT=$(echo "$UNBLOCKED_RESULT" | jq -r '.total // 0')
if [ "$UNBLOCKED_COUNT" -gt 0 ]; then
  UNBLOCKED_INFO="
=== UNBLOCKED EXPERIMENT RUNS (ready for assignment) ===
${UNBLOCKED_COUNT} experiment run(s) are now unblocked:
${UNBLOCKED_SUMMARY}
Consider assigning these to available agents."
fi
```

When an upstream experiment run completes and downstream runs are unblocked by dependency resolution, the Team Lead is immediately informed. This closes the loop -- the Team Lead can spawn new Sub-Agents for the freshly unblocked work without manual checking.

The hook also includes a **verify reminder** for agents with PI (principal investigator) permissions: if the completed experiment run has acceptance criteria that the executing agent self-checked as passed, the hook reminds the PI agent to review and verify.

### 5.9 Hook 8: TeammateIdle -- Async Heartbeat

**Script**: `on-teammate-idle.sh`
**Sync**: No (`"async": true`)

Sub-Agents enter an idle state between conversation turns. The hook sends a heartbeat to keep the Synapse session active:

```bash
"$API" mcp-tool "synapse_session_heartbeat" \
  "$(printf '{"sessionUuid":"%s"}' "$SESSION_UUID")" >/dev/null 2>&1 || true

# Suppress output entirely -- heartbeats are too frequent to notify
echo '{"suppressOutput": true}'
```

Synapse sessions are automatically marked inactive after 1 hour without a heartbeat. This hook ensures that as long as a Sub-Agent is running, its session stays alive. Output is silenced with `suppressOutput: true` -- no one wants a notification popup on every idle cycle.

### 5.10 Hook 9: TaskCompleted -- Metadata Bridging

**Script**: `on-task-completed.sh`
**Sync**: Yes (default)

When a Claude Code internal Task is marked complete, the hook checks whether the task description contains a `synapse:experiment_run:<uuid>` tag. If found, it automatically executes `synapse_session_checkout_experiment_run`:

```bash
# Look for synapse:experiment_run:<uuid> or legacy synapse:task:<uuid>
SYNAPSE_TASK_UUID=""
for text in "$TASK_DESCRIPTION" "$TASK_SUBJECT"; do
  MATCH=$(echo "$text" | grep -oP 'synapse:(?:experiment_run|task):([0-9a-f-]{36})' | head -1)
  if [ -n "$MATCH" ]; then
    SYNAPSE_TASK_UUID=$(echo "$MATCH" | sed -E 's/synapse:(experiment_run|task)://')
    break
  fi
done
```

This is an elegant **metadata bridging** pattern: by embedding a Synapse experiment run UUID in the Claude Code Task description, the two systems' lifecycles are linked. When the Team Lead includes `synapse:experiment_run:abc123` in a Task's description, completing that Task automatically triggers a Synapse checkout -- no manual coordination needed. The legacy `synapse:task:<uuid>` format is still accepted for backward compatibility.

### 5.11 Hook 10: SessionEnd -- Cleanup .synapse/ Directory

**Script**: `on-session-end.sh`
**Sync**: Yes (default)

When the session ends, the hook checks whether all session files have been cleaned up and `state.json` is empty. If so, it deletes the entire `.synapse/` directory:

```bash
# Safety checks: still active sessions? meaningful state?
REMAINING=$(ls "$SESSIONS_DIR"/*.json 2>/dev/null | wc -l)
KEY_COUNT=$(jq 'length' "$STATE_FILE" 2>/dev/null)

if [ "$REMAINING" -eq 0 ] && [ "$KEY_COUNT" -eq 0 ]; then
  rm -rf "$STATE_DIR"
fi
```

The entire directory's lifecycle matches the Claude Code session -- created at start, cleaned up at end, leaving no trace.

---

## 6. The `.synapse/` Directory: Cross-Hook State Bridge

Each hook is an independent shell process -- they do not share memory. The `.synapse/` directory (gitignored) at the project root serves as the information hub between the Team Lead, Sub-Agents, and all hooks:

```
.synapse/                              # Plugin runtime state (gitignored)
|-- state.json                        # Global state KV store
|-- state.json.lock                   # flock exclusive lock file
|-- sessions/                         # Sub-Agent session metadata
|   |-- literature-reviewer.json
|   |-- experiment-runner.json
|   +-- report-writer.json
|-- pending/                          # Written by PreToolUse:Task
|   +-- <agent-name>
+-- claimed/                          # Files claimed by SubagentStart
    +-- <agent-id>
```

### state.json -- Cross-Hook State Sharing

```json
{
  "session_a0ed860": "699f8ed4-4a98-4522-8321-662a2222a180",
  "agent_for_session_699f8ed4-...": "a0ed860",
  "session_experiment-runner": "699f8ed4-...",
  "name_for_agent_a0ed860": "experiment-runner",
  "owner_uuid": "abc123...",
  "owner_name": "Dr. Chen",
  "owner_email": "chen@lab.edu",
  "agent_roles": "experiment,report",
  "project_uuid": "def456...",
  "main_session_uuid": "..."
}
```

It stores four mapping relationships: `agent_id -> session_uuid`, `session_uuid -> agent_id`, `agent_name -> session_uuid`, `agent_id -> agent_name`. Plus cached owner info, agent roles, and project UUID. Any hook that knows one identifier can look up all associated information.

### Concurrent Write Protection: flock

When 5 Sub-Agents spawn simultaneously, 5 `SubagentStart` hooks execute concurrently, each writing 4 keys to `state.json`. Without protection, the JSON file would be corrupted by concurrent writes.

The solution in `synapse-api.sh` uses `flock` exclusive locks:

```bash
state_set() {
  local key="$1" value="$2"
  (
    # Acquire exclusive lock, 5-second timeout
    flock -w 5 200 || { echo "WARN: flock timeout" >&2; return 0; }
    # Modify JSON under lock protection
    local tmp=$(mktemp)
    jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$STATE_FILE" > "$tmp" \
      && mv "$tmp" "$STATE_FILE"
  ) 200>"${STATE_FILE}.lock"
}
```

Key details:
- `flock -w 5 200`: Acquire exclusive lock on file descriptor 200, wait up to 5 seconds
- `200>"${STATE_FILE}.lock"`: Lock file is separate from the state file
- `jq ... > $tmp && mv $tmp`: Write to temp file first, then atomically replace -- prevents corruption if a crash happens mid-write
- Timeout does not error (`return 0`) -- better to lose one state write than block the entire hook chain

### pending/ --> claimed/: Atomic Ownership Transfer

```
Timeline:
  T1  PreToolUse:Task fires --> write .synapse/pending/literature-reviewer
  T2  PreToolUse:Task fires --> write .synapse/pending/experiment-runner
  T3  SubagentStart(agent_id=a0e) fires --> mv pending/literature-reviewer --> claimed/a0e (ok)
  T4  SubagentStart(agent_id=b1f) fires --> mv pending/experiment-runner --> claimed/b1f (ok)
  T4' SubagentStart(agent_id=c2g) fires --> mv pending/literature-reviewer --> fails (already claimed)
                                          --> mv pending/experiment-runner --> fails (already claimed)
                                          --> no pending files --> skip (internal agent, no session)
```

`mv` is atomic on the same filesystem -- only one process can successfully move a given file. This is lighter than `flock`, well-suited for "first come, first served" ownership transfer.

### Lifecycle: Creation to Cleanup

```
SessionStart  --> mkdir -p .synapse/ (if not exists)
PreToolUse    --> write .synapse/pending/<name>
SubagentStart --> mv pending --> claimed, write sessions/<name>.json,
                  inject workflow via additionalContext, update state.json
TeammateIdle  --> read state.json (lookup session_uuid), no writes
TaskCompleted --> read state.json (lookup session_uuid), no writes
SubagentStop  --> delete sessions/<name>.json, delete claimed/<id>, clean state.json
SessionEnd    --> if sessions/ is empty and state.json is empty --> rm -rf .synapse/
```

---

## 7. The MCP Communication Layer

The hook scripts communicate with Synapse through a shared utility (`synapse-api.sh`) that implements MCP tool calls via HTTP Streamable Transport. This is worth examining because it shows how to call MCP tools from plain shell scripts -- no SDK required.

### JSON-RPC over HTTP

Each MCP tool call is a 4-step HTTP sequence:

```bash
cmd_mcp_tool() {
  local tool_name="$1"
  local arguments="${2:-{\}}"

  # Step 1: Initialize MCP session
  init_response=$(curl -s -X POST \
    -H "Authorization: Bearer ${SYNAPSE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' \
    "${SYNAPSE_URL}/api/mcp")

  # Extract session ID from response headers
  session_id=$(grep -i "^mcp-session-id:" "$headers_file" | awk '{print $2}')

  # Step 2: Send initialized notification
  curl -s -X POST \
    -H "mcp-session-id: $session_id" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    "${SYNAPSE_URL}/api/mcp"

  # Step 3: Call the tool
  curl -s -X POST \
    -H "mcp-session-id: $session_id" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool_name\",\"arguments\":$arguments}}" \
    "${SYNAPSE_URL}/api/mcp"

  # Step 4: Close session (best effort)
  curl -s -X DELETE \
    -H "mcp-session-id: $session_id" \
    "${SYNAPSE_URL}/api/mcp"
}
```

The implementation includes:

- **Auto-retry on 404**: If the MCP session expires mid-call, the script automatically re-initializes and retries (up to 3 attempts)
- **SSE response parsing**: Responses may come as Server-Sent Events (`data: {...}`) or plain JSON -- the script handles both
- **Concurrent-safe temp files**: Each call uses `mktemp` with a unique suffix to avoid collisions when multiple hooks run in parallel
- **Graceful session teardown**: The DELETE request is best-effort -- it will not fail the hook if the server is unreachable

### Authentication

All requests carry the `syn_` API key in the `Authorization: Bearer` header. The Synapse server resolves this to the agent's identity and permissions, determining which MCP tools are visible. A `pre_research` agent sees literature search tools; an `experiment` agent sees compute and execution tools.

---

## 8. Design Pattern Summary

From the Synapse plugin's implementation, several reusable patterns emerge:

### Pattern 1: SubagentStart for Direct Context Injection

```
SubagentStart hook  -->  additionalContext  -->  Sub-Agent's context
(has session data)       (direct injection)      (sees it immediately)
```

`SubagentStart`'s `additionalContext` is the most reliable way to inject context into Sub-Agents. It fires synchronously at spawn time, has access to all session data, and injects directly into the Sub-Agent. No file reading, no prompt manipulation, no Team Lead involvement required.

**When to use this pattern**: Any time your external system needs to provide per-agent credentials, workflow instructions, or configuration to Sub-Agents.

### Pattern 2: Filesystem as Cross-Hook State Bridge

The shared filesystem (`.synapse/` directory) is valuable for **hook-to-hook** state passing, but should not be the primary mechanism for Sub-Agent context injection. Use files for state that multiple hooks need to read across the session lifecycle; use `additionalContext` for what the agent needs to know.

**Key techniques**:
- `flock` for serializing concurrent writes to shared JSON
- Atomic `mv` for first-come-first-served ownership transfer
- Temp file + atomic replace for crash-safe writes

### Pattern 3: PreToolUse Captures + SubagentStart Executes

The `SubagentStart` event does not provide the Sub-Agent's name (only `agent_id` and `agent_type`), but `PreToolUse:Task` can extract it from `tool_input`. The two hooks pass information via the filesystem (pending -> claimed). This relay pattern is useful whenever a later hook needs information that was only available during an earlier event.

### Pattern 4: Async Hooks for Non-Blocking Cleanup

Session closing, resource cleanup, heartbeats, and notifications -- operations that do not affect the agent's next action -- should go in async hooks. Do not let cleanup logic block a Sub-Agent's exit or idle handling.

### Pattern 5: Soft Guidance Over Hard Blocks

`PreToolUse:EnterPlanMode` injects a workflow reminder, but does not block the operation. `PreToolUse:Task` reminds the Team Lead to include experiment run UUIDs, but does not prevent spawning. In research collaboration -- where agents need flexibility to adapt to unexpected findings -- suggestions are better than enforcement. Reserve `permissionDecision: "deny"` for genuine safety concerns.

### Pattern 6: Session Reuse for Resilience

Instead of always creating new sessions, check for existing ones first: active -> reuse, closed -> reopen, not found -> create. This makes the system resilient to interruptions. If a Claude Code session crashes and the Team Lead respawns a Sub-Agent with the same name, it picks up where it left off instead of creating an orphaned duplicate.

### Pattern 7: Metadata Bridging Between Systems

Embedding structured tags (`synapse:experiment_run:<uuid>`) in Claude Code Task descriptions creates an implicit link between two systems' lifecycles. When the CC Task completes, the hook automatically performs the corresponding action in Synapse. This avoids requiring explicit coordination calls and works even when the agent forgets to call cleanup tools.

### Pattern 8: Suppress Output for High-Frequency Hooks

Heartbeat hooks fire on every idle cycle. Without `suppressOutput: true`, every heartbeat would create a notification popup -- unacceptable UX. Any hook that fires more than once per minute should suppress its output.

---

## 9. Quick Start: Building Your Own Plugin

If you want to build a Claude Code plugin for your own toolchain, here are the minimum viable steps.

### Step 1: Create Directory Structure

```bash
mkdir -p my-plugin/.claude-plugin my-plugin/hooks my-plugin/bin
```

### Step 2: Write plugin.json

```json
{
  "name": "my-plugin",
  "description": "My custom plugin for Claude Code",
  "version": "0.1.0"
}
```

Save to `my-plugin/.claude-plugin/plugin.json`.

### Step 3: Write Your First Hook

`my-plugin/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/on-start.sh"
      }]
    }]
  }
}
```

`my-plugin/bin/on-start.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cat <<EOF
{
  "systemMessage": "My plugin is active!",
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "My Plugin is connected. Custom workflow instructions here."
  }
}
EOF
```

### Step 4: Test Locally

```bash
chmod +x my-plugin/bin/on-start.sh
claude --plugin-dir ./my-plugin
```

### Step 5: Add SubagentStart (If You Need Multi-Agent Support)

This is where most of the value lives. Write a `SubagentStart` hook that:

1. Creates or reuses a session/context in your external system
2. Injects the session ID and workflow instructions via `additionalContext`
3. Stores state mappings for later hooks to use

```bash
#!/usr/bin/env bash
set -euo pipefail

EVENT=""
[ ! -t 0 ] && EVENT=$(cat)

AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id // empty')

# Your external system call here
SESSION_ID=$(create_or_reuse_session "$AGENT_ID")

cat <<EOF
{
  "systemMessage": "Session created: ${SESSION_ID}",
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "Your session ID is ${SESSION_ID}. Follow these steps: ..."
  }
}
EOF
```

### Step 6: Publish to Marketplace

Create `.claude-plugin/marketplace.json` at your repo root:

```json
{
  "name": "my-marketplace",
  "owner": { "name": "Your Name" },
  "plugins": [{
    "name": "my-plugin",
    "source": "./my-plugin",
    "version": "0.1.0"
  }]
}
```

Others can install with:

```bash
/plugin marketplace add YourName/your-repo
/plugin install my-plugin@my-marketplace
```

### Quick Start: Install the Synapse Plugin

To try the Synapse plugin itself:

```bash
# 1. Add the Synapse marketplace
/plugin marketplace add Vincentwei1021/Synapse

# 2. Install
/plugin install synapse@synapse-plugins

# 3. Set environment variables
export SYNAPSE_URL="https://your-synapse-instance.com"
export SYNAPSE_API_KEY="syn_your_api_key_here"

# 4. Start Claude Code -- the plugin activates automatically
claude
```

The plugin requires `jq` and `curl` on the host machine. On macOS, both are available by default or via `brew install jq`.

---

## 10. Closing Thoughts

Claude Code's plugin system provides a complete extension mechanism -- from Marketplace distribution, to MCP tool integration, to Hooks lifecycle management, to Skills knowledge injection. The introduction of Agent Teams makes multi-agent collaboration possible, and plugins make that collaboration manageable and observable.

The Synapse plugin's core insight is that **`SubagentStart`'s `additionalContext` -- which injects directly into the Sub-Agent's context -- is the key to seamless multi-agent workflow automation**. Combined with the shared filesystem for cross-hook state management and `PreToolUse` for capturing spawn-time metadata, a fully automated session lifecycle can be achieved with zero boilerplate in the Team Lead's prompts.

For research teams using Synapse, this means the difference between writing 15 lines of setup boilerplate per Sub-Agent and writing 2 lines that focus on the actual research task. For plugin developers building integrations with other systems, the patterns here -- particularly the `SubagentStart` injection pattern and the `pending -> claimed` relay -- are directly transferable to any domain where external workflow context needs to flow into multi-agent teams.

The Synapse plugin is at version 0.5.0 and under active development at [`public/synapse-plugin/`](https://github.com/Vincentwei1021/Synapse/tree/main/public/synapse-plugin). If you are interested in research orchestration with AI agents, or in building your own Claude Code plugin, visit the [Synapse repository](https://github.com/Vincentwei1021/Synapse) on GitHub.

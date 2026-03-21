# Building Plugins for Claude Code Agent Teams: Design Patterns from the Synapse Experience

> Based on real-world development experience from the Synapse project, this article systematically introduces Claude Code's plugin mechanism, with a focus on building plugins for Agent Teams (Swarm mode) and solving the context injection challenge in multi-agent collaboration.

## TL;DR: What This Article Covers

Claude Code's Agent Teams (also known as Swarm mode) allow a Team Lead Agent to orchestrate multiple Sub-Agents working in parallel. This is a powerful capability — but it raises a question: **when you have an external work tracking system, how do you automatically connect each Sub-Agent to your workflow without the Team Lead hand-writing boilerplate in every spawn prompt?**

The main goals of this article are:

1. **Introduce the Claude Code plugin ecosystem** — Marketplace, Plugin Manifest, Hooks, Skills, and MCP configuration form a complete extension mechanism
2. **Use Synapse as a case study** to show how an Agent-first task management platform can seamlessly integrate with Claude Code's multi-agent workflow through plugins
3. **Deep dive into Sub-Agent context injection** — in multi-agent collaboration scenarios, ensuring each Sub-Agent automatically receives the correct working context is the key to whether a plugin can truly work in practice

If you're considering building a Claude Code plugin for your own toolchain (CI/CD, project management, monitoring systems, etc.), we hope this article provides useful insights.

---

## 1. Claude Code Agent Teams: A Quick Look at Swarm Mode

Agent Teams is Claude Code's multi-agent collaboration mode. The core concept is simple:

```
Team Lead (main Agent)
  ├── Task tool ──> Sub-Agent A (frontend-worker)
  ├── Task tool ──> Sub-Agent B (backend-worker)
  └── Task tool ──> Sub-Agent C (test-runner)
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
- **`SubagentStart` is the exception** — its `additionalContext` is injected directly into the **Sub-Agent's** context

This means `SubagentStart` is the ideal hook for automatically providing Sub-Agents with working context (session IDs, workflow instructions, etc.) without relying on the Team Lead to hand-write boilerplate or the Sub-Agent to read files.

---

## 2. What Is Synapse, and What Problem Does It Solve

Before diving into the plugin implementation, let's briefly introduce Synapse.

[Synapse](https://github.com/Synapse-AIDLC/synapse) is a collaboration platform for AI Agents and humans, inspired by the [AI-DLC (AI-Driven Development Lifecycle)](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) methodology, implementing its core workflow from Idea to Verify:

```
Idea → Proposal → [Document + Task] → Execute → Verify → Done
 ^        ^            ^                 ^          ^        ^
Human   PM Agent    PM Agent         Dev Agent   Admin    Admin
```

The core philosophy is **Reversed Conversation**: AI proposes solutions, humans review and verify — rather than humans giving instructions for AI to execute.

In multi-agent team scenarios, Synapse needs to solve a specific problem: **Observability**. When 5 Sub-Agents are writing code simultaneously:

- Which Agent is working on which Task?
- What's each Agent's progress?
- Are Task status transitions (open → in_progress → to_verify → done) happening correctly?
- Is the Agent still alive (heartbeat)?

Synapse tracks all of this through a **Session** mechanism — each working Agent owns a Session, Sessions check in to Tasks, and the UI shows in real-time who's doing what.

### What Synapse Looks Like in Practice

Words are always abstract — let's look at some actual screenshots.

**Kanban Board — Real-time Agent Work Tracking**

![Kanban Board](../images/kanban-auto-update.gif)

This is the core view of Synapse. Colored badges on each Task card show the Agent Sessions currently working on that Task. When a Sub-Agent calls `synapse_session_checkin_task`, the badge appears in real-time; it disappears after `checkout`. Task movement between columns (Open → In Progress → To Verify → Done) is driven by Agents through MCP tools.

**Task Dependency Graph (DAG)**

![DAG](../images/dag.png)

Tasks in Synapse can declare dependencies, forming a directed acyclic graph. The PM Agent sets dependencies via `dependsOnDraftUuids` when creating Proposals. The UI uses dagre for automatic layout. The Team Lead can use this to decide spawn order — process Tasks with no dependencies first; when upstream Tasks complete, downstream Tasks automatically become unblocked.

**Elaboration — Structured Requirements Clarification**

![Elaboration](../images/elaboration.png)

Before an Idea becomes a Proposal, the PM Agent initiates Elaboration: structured questions about scope, technical choices, priorities, etc. Humans answer via interactive options. All Q&A is persisted as an audit trail on the Idea, ensuring design decisions are traceable — even verbal agreements from chat conversations get recorded.

**Proposal — AI Proposes, Humans Review**

![Proposal](../images/proposal.png)

This embodies the AI-DLC core philosophy of "Reversed Conversation": the PM Agent builds on the Elaboration conclusions to create a Proposal containing PRD document drafts and Task drafts. After Admin (human) approval, drafts are automatically materialized into real Document and Task entities.

**Task Detail — Session Tracking**

![Task Tracking](../images/task-tracking.png)

The Task detail page shows complete work history: which Sessions have checked in to this Task, the checkin/checkout times, and the Agent's work reports. This is Synapse's observability — even with 5 Agents working simultaneously, you can clearly see what everyone is doing.

**Pixel Office — Agent Virtual Workstations**

![Pixel Workspace](../images/pixcel-workspace.gif)

This is a fun feature of Synapse: each active Agent Session has its own workstation in a pixel art office. Agents start a "working" animation when checked in to a Task, rest when idle, and celebrate when done. Purely visual entertainment, but you can see the team's work status at a glance.

---

## 3. Why Build a Claude Code Plugin

Before the plugin, the Team Lead had to hand-write extensive boilerplate in every Sub-Agent's spawn prompt:

```python
Task({
  name: "frontend-worker",
  prompt: """
    Your Synapse session UUID: ??? (Team Lead doesn't know yet — session hasn't been created)
    Your Synapse task UUID: task-A-uuid

    Before work:
    1. Create session: synapse_create_session(...)
    2. Checkin: synapse_session_checkin_task(sessionUuid, taskUuid)
    3. Update status: synapse_update_task(taskUuid, "in_progress", sessionUuid)

    During work:
    4. Report progress: synapse_report_work(taskUuid, report, sessionUuid)

    After completion:
    5. Checkout: synapse_session_checkout_task(sessionUuid, taskUuid)
    6. Submit for verification: synapse_submit_for_verify(taskUuid, summary)
    7. Close session: synapse_close_session(sessionUuid)
  """
})
```

The problems are obvious:

1. **Session UUID can't be known in advance** — Sessions require MCP calls to create, but the prompt must be written before spawn
2. **Every Sub-Agent's prompt repeats the same boilerplate** — 6-7 workflow steps taking up significant prompt space
3. **The Team Lead must remember all the steps** — Forgot checkout? Forgot heartbeat? The Session will become stale
4. **Session lifecycle management is complex** — Create, reuse, reopen, heartbeat, close — all manual

With the plugin, all of this is automated:

```python
Task({
  name: "frontend-worker",
  prompt: """
    Your Synapse task UUID: task-A-uuid
    Implement the frontend user form component...
  """
})
```

From 15 lines of boilerplate to 2 lines. The Team Lead only passes the task UUID — the plugin's `SubagentStart` hook automatically injects the session UUID and complete workflow instructions directly into the Sub-Agent's context. No session files to read, no workflow boilerplate to copy.

---

## 4. Claude Code Plugin System Overview

A Claude Code plugin is a directory containing these components:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (metadata)
├── .mcp.json                # MCP server configuration
├── hooks/
│   └── hooks.json           # Hook configuration
├── bin/                     # Hook scripts
│   ├── on-session-start.sh
│   └── on-subagent-start.sh
└── skills/
    └── my-skill/
        ├── SKILL.md         # Skill entry file
        └── references/      # Reference documents
```

Let's walk through each component.

### 4.1 Plugin Manifest (plugin.json)

Located at [`.claude-plugin/plugin.json`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/.claude-plugin/plugin.json), it's the plugin's identity card:

```json
{
  "name": "synapse",
  "description": "Synapse AI-DLC collaboration platform plugin...",
  "version": "0.1.3",
  "author": { "name": "Synapse-AIDLC" },
  "homepage": "https://github.com/Synapse-AIDLC/synapse",
  "license": "AGPL-3.0",
  "keywords": ["ai-dlc", "mcp", "multi-agent", "session"]
}
```

`plugin.json` is optional — if omitted, Claude Code infers the plugin name from the directory name and auto-discovers components. But it's recommended to always provide one for version management and distribution.

### 4.2 Marketplace

Plugins are distributed through Marketplaces. A Marketplace is essentially a JSON manifest file ([`.claude-plugin/marketplace.json`](https://github.com/Synapse-AIDLC/Synapse/blob/main/.claude-plugin/marketplace.json)) hosted in a public GitHub repo. Synapse uses its own GitHub repository as a Marketplace:

```json
{
  "name": "synapse-plugins",
  "owner": { "name": "Synapse-AIDLC" },
  "plugins": [
    {
      "name": "synapse",
      "source": "./public/synapse-plugin",
      "description": "Synapse AI-DLC collaboration platform plugin...",
      "version": "0.1.3",
      "category": "project-management",
      "tags": ["ai-dlc", "collaboration", "mcp", "session"]
    }
  ]
}
```

The actual installation flow for the Synapse plugin:

```bash
# 1. Add marketplace — points to the GitHub repo (containing .claude-plugin/marketplace.json)
/plugin marketplace add Synapse-AIDLC/synapse

# 2. Install plugin — format: plugin-name@marketplace-name
/plugin install synapse@synapse-plugins

# 3. Optionally specify scope
/plugin install synapse@synapse-plugins --scope project  # Project-level (shared with team, committed to git)
/plugin install synapse@synapse-plugins --scope local    # Local-level (just for you)
```

The `source` field points to the plugin's relative path within the repo. Besides local paths, it also supports pointing to other GitHub repos (`"source": {"source": "github", "repo": "owner/repo"}`) or Git URLs.

### 4.3 MCP Configuration ([.mcp.json](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/.mcp.json))

Plugins can bundle MCP Server configuration that takes effect automatically after installation:

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

`${SYNAPSE_URL}` and `${SYNAPSE_API_KEY}` are environment variables — Claude Code substitutes them at runtime. Users just need to set the environment variables, and the plugin connects to the right service.

This means: **after plugin installation, all MCP tools are automatically available**. Sub-Agents can access them too (provided MCP config is at the project level, not user level).

**Synapse's MCP Configuration**: Synapse exposes 50+ MCP tools via HTTP Streamable Transport, grouped by role (public tools, PM tools, Developer tools, Admin tools, Session tools). Users only need to set two environment variables `SYNAPSE_URL` and `SYNAPSE_API_KEY` to connect. API Keys start with the `syn_` prefix and carry Agent role information — the server determines which tools are visible based on this.

### 4.4 Skills

Skills are plugin-bundled instruction sets that Claude can invoke automatically when needed, or users can trigger manually via `/skill-name`.

A Skill consists of a `SKILL.md` entry file and optional `references/` documents:

```markdown
---
name: synapse
description: Synapse AI Agent collaboration platform Skill...
metadata:
  author: synapse
  version: "0.1.1"
  category: project-management
  mcp_server: synapse
---

# Synapse Skill

This Skill guides AI Agents on how to use Synapse MCP tools...

## Skill Files

| File | Description |
|------|-------------|
| **references/02-pm-workflow.md** | PM Agent workflow |
| **references/03-developer-workflow.md** | Developer Agent workflow |
| **references/06-claude-code-agent-teams.md** | Agent Teams integration |
```

**Synapse's Skill System**: Synapse includes [7 reference documents](https://github.com/Synapse-AIDLC/Synapse/tree/main/public/synapse-plugin/skills/synapse/references) (`references/00` through `references/06`), covering everything from public tools, PM workflow, Developer workflow, Admin workflow, to Session management and Agent Teams integration. When an Agent invokes `/synapse` or Claude determines Synapse knowledge is needed, Skill docs are automatically loaded into context. This is essentially giving every Agent a portable operations manual — whether it's the Team Lead or a Sub-Agent, they can understand the correct workflow through Skills.

Skill frontmatter supports rich configuration options:

```yaml
---
name: my-skill
description: "When to use this skill"
allowed-tools: Read, Grep, Glob     # Tools allowed without permission prompts
model: claude-opus-4-6              # Specify model
context: fork                       # Run in subagent
disable-model-invocation: true      # Only user can trigger (Claude won't auto-invoke)
---
```

### 4.5 Hooks

Hooks are the core of plugins — they let you execute custom logic at key points in Claude Code's lifecycle.

Configured in [`hooks/hooks.json`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/hooks/hooks.json):

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
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/on-subagent-stop.sh",
        "async": true
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
| `agent` | Spawn a subagent with tool access for verification | When complex multi-step verification is needed (e.g., running tests) |

All of Synapse's hooks use the `command` type — because Synapse's hook logic is deterministic (calling APIs, reading/writing files, managing state) and doesn't require LLM judgment. `prompt` and `agent` are better suited for scenarios that require "understanding" code content to make decisions, such as using an `agent` type in the `Stop` event to automatically run tests to determine if a task is truly complete.

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

Now that we know what events are available, the next question is: **what can a hook script return to influence Claude's behavior?** Hooks output JSON via stdout:

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
- **`additionalContext`**: Injected into the LLM's system context — **this is the primary mechanism for hooks to influence Claude's behavior**. Synapse's `SessionStart` hook uses it to inject checkin results (identity, tasks, notifications) into the Agent's context
- **`permissionDecision`**: `allow` / `deny` / `ask`, used by `PreToolUse` to control tool execution permissions
- **`suppressOutput`**: Set to `true` to silence output — Synapse's `TeammateIdle` hook uses this to avoid notification popups on every heartbeat

#### Synchronous vs Asynchronous

- **Synchronous hooks** (default): Block Claude until completion. Suited for scenarios requiring immediate effect — Synapse's `SubagentStart` must be synchronous because it needs to create the session and write the session file before the Sub-Agent starts working
- **Asynchronous hooks** (`"async": true`): Run in background, non-blocking. Suited for scenarios that don't affect the flow — Synapse's `SubagentStop` (resource cleanup) and `TeammateIdle` (heartbeat) are both asynchronous

#### What Synapse Does with Each Hook Event

Now that we understand events, output format, and sync/async, let's see how the Synapse plugin specifically uses each hook.

**`SessionStart` — Checkin + Context Injection**

This is the plugin's "startup self-check". Note that the `SessionStart` matcher is configured as `startup|resume|compact`, meaning it fires not only on session start and resume, but **also after context compaction**. When a long conversation triggers automatic compaction, previously injected Synapse context is lost along with the compressed messages — the `compact` matcher ensures that fresh checkin information is re-injected immediately after compaction, so the Agent never "forgets" its Synapse context.

Synapse does three things here:

1. Calls the `synapse_checkin()` MCP tool to get the current Agent's identity (role, name, persona), assigned Ideas and Tasks, and unread notifications
2. Injects the complete checkin result into Claude's context via `additionalContext` — the Agent knows who it is and what to do from the very first turn
3. Scans the `.synapse/sessions/` directory to list existing Sub-Agent session metadata — this handles the case where a Claude Code session is interrupted and resumed: previous session files may still exist, and the Team Lead needs to know which sessions are still present after recovery

```bash
# on-session-start.sh core logic
CHECKIN_RESULT=$("$API" mcp-tool "synapse_checkin" '{}')

CONTEXT="# Synapse Plugin — Active
Synapse is connected at ${SYNAPSE_URL}.
## Checkin Result
${CHECKIN_RESULT}
## Session Management — IMPORTANT
The Synapse Plugin fully automates session lifecycle...
Do NOT call synapse_create_session for sub-agents."

"$API" hook-output "$USER_MSG" "$CONTEXT" "SessionStart"
```

Result: The Agent has complete project context and behavioral guidelines from its very first conversation turn, without the user having to manually provide anything.

**`UserPromptSubmit` — Lightweight Status Reminder**

Triggered on every user input, so it must be extremely fast (<100ms). Synapse makes **no network calls** here, only local file checks:

```bash
# on-user-prompt.sh — pure local operation, no MCP calls
# Count json files in .synapse/sessions/
CONTEXT="[Synapse Plugin Active]
- Active sub-agent sessions (3): frontend-worker, backend-worker, test-runner"
```

This gives the Team Lead persistent status awareness: how many Sub-Agent sessions are currently running.

**`PreToolUse` — Workflow Guidance (3 Sub-Hooks)**

Synapse registers 3 `PreToolUse` hooks, each matching a different tool:

| matcher | Script | What Synapse Does |
|---------|--------|-----------------|
| `EnterPlanMode` | [`on-pre-enter-plan.sh`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/bin/on-pre-enter-plan.sh) | Inject Synapse Proposal workflow guidance — "Create a Proposal first, set up Task dependency DAG, submit for approval before coding" |
| `ExitPlanMode` | [`on-pre-exit-plan.sh`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/bin/on-pre-exit-plan.sh) | Reminder check — "Confirm Proposal has been created and submitted before exiting Plan Mode" |
| `Task` | [`on-pre-spawn-agent.sh`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/bin/on-pre-spawn-agent.sh) | Capture Sub-Agent name/type to pending file for SubagentStart to claim |

`EnterPlanMode` and `ExitPlanMode` demonstrate an interesting usage: **using hooks to guide Agents toward following a specific workflow**. When the Agent enters Plan Mode, Synapse automatically injects "create Proposal before coding" guidance; when exiting Plan Mode, it checks whether a Proposal exists. This isn't a hard block (`permissionDecision` remains `allow`), but soft guidance via `additionalContext`.

**`SubagentStart` — Automatic Session Creation + Direct Context Injection** (Core)

This is the Synapse plugin's most critical hook, detailed in Chapter 5. In brief: claim pending file → create/reuse Session → inject session UUID + workflow instructions directly into Sub-Agent's context via `additionalContext` → store state mappings. The session file is kept minimal (just metadata for other hooks).

**`SubagentStop` — Automatic Cleanup + Task Discovery**

Runs asynchronously, doing four things: (1) batch checkout all unclosed task checkins, (2) close the Session, (3) clean up local files and state, (4) query the project for newly unblocked Tasks and notify the Team Lead via `additionalContext` — this last step is extremely valuable, implementing **automatic task dispatch discovery**: when an upstream Task completes, downstream Tasks automatically become unblocked, and the Team Lead is immediately notified to assign new work.

**`TeammateIdle` — Automatic Heartbeat**

Async + `suppressOutput: true`. Does just one thing: calls `synapse_session_heartbeat` to keep the Session active. Synapse Sessions are automatically marked as inactive after 1 hour without a heartbeat — this hook ensures that as long as a Sub-Agent is running, its Session stays alive.

**`TaskCompleted` — Metadata Bridging**

When a Claude Code internal Task is marked complete, Synapse checks whether the task description contains a `synapse:task:<uuid>` tag. If so, it automatically executes `synapse_session_checkout_task`. This is an elegant **metadata bridging** pattern — by embedding a Synapse task UUID in the CC Task description, the two systems' Task lifecycles are linked.

**`SessionEnd` — Clean Up .synapse/ Directory**

When the session ends, checks whether all session files have been cleaned up and state.json is empty. If so, deletes the entire `.synapse/` directory, leaving no leftover files.

---

## 5. Synapse Plugin: Complete Implementation

Now for the main topic — how the Synapse plugin uses the above mechanisms to solve multi-agent collaboration problems.

### 5.1 Architecture Overview

```
Team Lead calls Task tool to spawn Sub-Agent
  │
  ├─ [PreToolUse:Task] on-pre-spawn-agent.sh
  │    Write .synapse/pending/<name> file (capture agent name)
  │
  ├─ [SubagentStart] on-subagent-start.sh    ← Core
  │    Claim pending file (atomic mv, handles concurrency)
  │    Create/reuse/reopen Synapse Session (MCP call)
  │    Inject session UUID + workflow into Sub-Agent via additionalContext
  │    Write minimal session file (metadata for other hooks)
  │    Store state mappings (agent_id ↔ session_uuid)
  │
  ├─ Sub-Agent starts executing
  │    Session UUID + workflow already in context (auto-injected)
  │    Autonomously execute: checkin → in_progress → report → checkout → submit
  │
  ├─ [TeammateIdle] on-teammate-idle.sh (async)
  │    Send session heartbeat, keep session active
  │
  ├─ [TaskCompleted] on-task-completed.sh
  │    Detect synapse:task:<uuid> tag, auto checkout
  │
  └─ [SubagentStop] on-subagent-stop.sh (async)
       Batch checkout all tasks
       Close Synapse Session
       Clean up local state
       Query and display newly unblocked tasks
```

### 5.2 The `.synapse/` Directory: The Bridge Connecting Everything

We've mentioned "shared filesystem" multiple times — let's expand on this. The Synapse plugin maintains a `.synapse/` directory (gitignored) at the project root, serving as the information hub between the Team Lead, Sub-Agents, and all hooks:

```
.synapse/                              # Plugin runtime state (gitignored)
├── state.json                        # Global state KV store
├── state.json.lock                   # flock exclusive lock file
├── sessions/                         # Sub-Agent session metadata (for hook state lookup)
│   ├── frontend-worker.json
│   ├── backend-worker.json
│   └── test-runner.json
├── pending/                          # Written by PreToolUse:Task, awaiting SubagentStart claim
│   └── <agent-name>
└── claimed/                          # Files claimed by SubagentStart
    └── <agent-id>
```

#### Core: `state.json` — Cross-Hook State Sharing

Each hook is an independent shell process — they don't share memory. `state.json` is the shared state store across all hooks:

```json
{
  "session_a0ed860": "699f8ed4-4a98-4522-8321-662a2222a180",
  "agent_for_session_699f8ed4-...": "a0ed860",
  "session_frontend-worker": "699f8ed4-...",
  "name_for_agent_a0ed860": "frontend-worker",
  "main_session_uuid": "..."
}
```

It stores four mapping relationships: `agent_id → session_uuid`, `session_uuid → agent_id`, `agent_name → session_uuid`, `agent_id → agent_name`. This way, any hook that knows one ID can look up all associated information.

#### Concurrent Write Protection: flock

When 5 Sub-Agents spawn simultaneously, 5 `SubagentStart` hooks execute concurrently, each writing 4 keys to `state.json`. Without protection, the JSON file would be corrupted by concurrent writes.

Synapse solves this in [`synapse-api.sh`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/bin/synapse-api.sh) using `flock` exclusive locks:

```bash
# state_set implementation in synapse-api.sh
state_set() {
  local key="$1" value="$2"
  (
    # Acquire exclusive lock, 5-second timeout
    flock -w 5 200 || { echo "WARN: flock timeout" >&2; return 0; }
    # Modify JSON under lock protection
    jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$STATE_FILE" > "$tmp" \
      && mv "$tmp" "$STATE_FILE"
  ) 200>"${STATE_FILE}.lock"
}
```

Key details:
- `flock -w 5 200`: Acquire exclusive lock on file descriptor 200, wait up to 5 seconds
- `200>"${STATE_FILE}.lock"`: Lock file is separate from the state file (`.lock` suffix)
- `jq ... > $tmp && mv $tmp`: Write to temp file first, then atomically replace — prevents corruption if a crash happens mid-write
- Timeout doesn't error (`return 0`) — better to lose one state write than block the entire hook chain

#### `pending/` → `claimed/`: Atomic Ownership Transfer

The `SubagentStart` event only provides `agent_id` and `agent_type`, **not the name the Team Lead gave the Sub-Agent**. But sessions need to be named (so the Sub-Agent can find its session file by name).

The solution is a relay between two hooks:

1. `PreToolUse:Task` (Team Lead context) can extract the `name` parameter from `tool_input`, writing it to a `pending/<name>` file
2. `SubagentStart` (still Team Lead context, but executing concurrently) atomically claims it via `mv pending/<name> claimed/<agent_id>`

```
Timeline:
  T1  PreToolUse:Task fires → write .synapse/pending/frontend-worker
  T2  PreToolUse:Task fires → write .synapse/pending/backend-worker
  T3  SubagentStart(agent_id=a0e) fires → mv pending/frontend-worker → claimed/a0e ✓
  T4  SubagentStart(agent_id=b1f) fires → mv pending/backend-worker → claimed/b1f ✓
  T4' SubagentStart(agent_id=c2g) fires → mv pending/frontend-worker → fails (already claimed by a0e)
                                        → mv pending/backend-worker → fails (already claimed by b1f)
                                        → no more pending files → skip (internal agent, no session needed)
```

`mv` is atomic on the same filesystem — only one process can successfully move a given file. This is lighter than flock, well-suited for "first come, first served" scenarios.

#### `sessions/` — Metadata for Cross-Hook State Lookup

Session files now contain only minimal metadata (sessionUuid, agentId, agentName). Workflow instructions are injected directly into the Sub-Agent's context via `SubagentStart`'s `additionalContext` — Sub-Agents no longer need to read these files. The files still serve a purpose: other hooks (`TeammateIdle`, `SubagentStop`) use them to look up session information for heartbeats and cleanup.

#### Lifecycle: Creation to Cleanup

```
SessionStart  → mkdir -p .synapse/ (if not exists)
PreToolUse    → write .synapse/pending/<name>
SubagentStart → mv pending → claimed, write sessions/<name>.json (metadata only),
                inject workflow via additionalContext → Sub-Agent, update state.json
TeammateIdle  → read state.json (lookup session_uuid), no writes
TaskCompleted → read state.json (lookup session_uuid), no writes
SubagentStop  → delete sessions/<name>.json, delete claimed/<agent_id>, clean state.json entries
SessionEnd    → if sessions/ is empty and state.json is empty → rm -rf .synapse/
```

The entire directory's lifecycle matches the Claude Code session — created at start, cleaned up at end, leaving no trace.

### 5.3 The Core Challenge: Sub-Agent Context Injection

The key question is: how do you automatically provide each Sub-Agent with its session UUID and workflow instructions, without the Team Lead hand-writing boilerplate?

The answer lies in a critical property of the `SubagentStart` hook: **its `additionalContext` is injected directly into the Sub-Agent's context**, not the Team Lead's. This makes it the ideal injection point — the hook that creates the session (and thus knows the sessionUuid) can also inject the workflow, all in one place.

```bash
# on-subagent-start.sh — core snippet
# After creating/reusing a session and obtaining SESSION_UUID...

WORKFLOW="## Synapse Session (Auto-injected by plugin)

Your Synapse session UUID is: ${SESSION_UUID}
Your session name is: ${SESSION_NAME}
Do NOT call synapse_create_session or synapse_close_session.

### Workflow — follow these steps for each task:

**Before starting:**
1. Check in: synapse_session_checkin_task({ sessionUuid: \"${SESSION_UUID}\", taskUuid: \"<TASK_UUID>\" })
2. Start work: synapse_update_task({ taskUuid: \"<TASK_UUID>\", status: \"in_progress\", sessionUuid: \"${SESSION_UUID}\" })

**While working:**
3. Report progress: synapse_report_work({ taskUuid: \"<TASK_UUID>\", report: \"...\", sessionUuid: \"${SESSION_UUID}\" })

**After completing:**
4. Check out: synapse_session_checkout_task({ sessionUuid: \"${SESSION_UUID}\", taskUuid: \"<TASK_UUID>\" })
5. Submit: synapse_submit_for_verify({ taskUuid: \"<TASK_UUID>\", summary: \"...\" })

Replace <TASK_UUID> with the actual Synapse task UUID from your prompt."

"$API" hook-output \
  "Synapse session ${SESSION_ACTION}: '${SESSION_NAME}'" \
  "$WORKFLOW" \
  "SubagentStart"
```

The Sub-Agent sees the workflow as a `<system-reminder>` in its context from the very first turn. The session file is kept minimal (just sessionUuid + metadata) for other hooks to use.

This means the Team Lead's spawn prompt is truly minimal:

```python
Task({
  name: "frontend-worker",
  prompt: """
    Your Synapse task UUID: task-A-uuid
    Implement the frontend user form component...
  """
})
```

The plugin handles everything else — the Team Lead only passes the task UUID.

### 5.4 Session Reuse: Avoiding Duplicate Creation

When the Team Lead spawns a Sub-Agent with the same name multiple times (e.g., after a Task is reopened by Admin), the plugin doesn't create a new Session — it reuses the existing one:

```bash
# Reuse logic in on-subagent-start.sh
if [ "$MATCH_STATUS" = "active" ]; then
    SESSION_UUID="$MATCH_UUID"         # Reuse directly
    SESSION_ACTION="reused"
elif [ "$MATCH_STATUS" = "closed" ] || [ "$MATCH_STATUS" = "inactive" ]; then
    # Reopen closed session
    synapse_reopen_session(sessionUuid)
    SESSION_ACTION="reopened"
else
    # Create new session
    synapse_create_session(name)
    SESSION_ACTION="created"
fi
```

### 5.5 Automatic Cleanup: SubagentStop

When a Sub-Agent exits, [`on-subagent-stop.sh`](https://github.com/Synapse-AIDLC/Synapse/blob/main/public/synapse-plugin/bin/on-subagent-stop.sh) (running asynchronously) handles cleanup:

1. Query all active checkins for the Session, checkout each one
2. Close the Synapse Session
3. Delete local state (state entries, session file, claimed file)
4. Query the project for newly unblocked Tasks and notify the Team Lead

This way, even if a Sub-Agent forgot to checkout or close its session, the plugin provides a safety net.

### 5.6 Automatic Heartbeat: TeammateIdle

Sub-Agents enter an idle state between conversation turns, at which point the `TeammateIdle` hook automatically sends a heartbeat:

```bash
# on-teammate-idle.sh
"$API" mcp-tool "synapse_session_heartbeat" \
  "$(printf '{"sessionUuid":"%s"}' "$SESSION_UUID")"
```

Output is silenced with `suppressOutput: true` — heartbeats are too frequent to warrant notifying the Team Lead.

---

## 6. Design Pattern Summary

From the Synapse plugin's practice, we can extract several reusable design patterns:

### Pattern 1: SubagentStart for Direct Context Injection

```
SubagentStart hook  →  additionalContext  →  Sub-Agent's context
(has session data)      (direct injection)    (sees it immediately)
```

`SubagentStart`'s `additionalContext` is the most reliable way to inject context into Sub-Agents. It fires synchronously at spawn time, has access to all session data, and injects directly into the Sub-Agent — no file reading, no prompt manipulation, no Team Lead involvement required.

### Pattern 2: Filesystem for Cross-Hook State (Not Sub-Agent Communication)

The shared filesystem (`.synapse/` directory) is valuable for **hook-to-hook** state passing (e.g., `pending/` files relay agent names from `PreToolUse` to `SubagentStart`), but should not be the primary mechanism for Sub-Agent context injection. Use `SubagentStart`'s `additionalContext` for that instead.

### Pattern 3: PreToolUse Captures + SubagentStart Executes

The `SubagentStart` event doesn't provide the Sub-Agent's name (only `agent_id` and `agent_type`), but `PreToolUse:Task` can extract it from `tool_input`. The two hooks pass information via the filesystem (pending → claimed).

### Pattern 4: Async Hooks for Non-Blocking Cleanup

Session closing, resource cleanup, notifications, and other operations that don't affect the flow should go in async hooks. Don't let cleanup logic block a Sub-Agent's exit.

### Pattern 5: Hooks Suggest, Don't Enforce

`PreToolUse:Task` injects a reminder to the Team Lead ("remember to include task UUID in the prompt"), but doesn't block the operation. In team collaboration, **suggestions over enforcement** — overly strict hooks degrade the user experience.

---

## 7. Quick Start: Building Your Own Plugin

If you want to build a Claude Code plugin for your own toolchain, here are the minimum viable steps:

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

### Step 3: Write Your First Hook

`hooks/hooks.json`:
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

`bin/on-start.sh`:
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

### Step 5: Publish to Marketplace

Create `.claude-plugin/marketplace.json`:
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

---

## Closing Thoughts

Claude Code's plugin system provides a complete extension mechanism — from Marketplace distribution, to MCP tool integration, to Hooks lifecycle management, to Skills knowledge injection. The introduction of Agent Teams (Swarm mode) makes multi-agent collaboration possible, and plugins make that collaboration manageable and observable.

The Synapse plugin's practice demonstrates that `SubagentStart`'s `additionalContext` — which injects directly into the Sub-Agent's context — is the key to seamless multi-agent workflow automation. Combined with the shared filesystem for cross-hook state management and `PreToolUse` for capturing spawn-time metadata, a fully automated session lifecycle can be achieved with zero boilerplate in the Team Lead's prompts.

If you're interested in Synapse, visit [GitHub](https://github.com/Synapse-AIDLC/synapse) to learn more. If you're building your own Claude Code plugin, we hope this article's experience helps you avoid some pitfalls.

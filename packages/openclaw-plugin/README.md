<p align="center">
  <img src="images/slug.png" alt="@synapse-aidlc/synapse-openclaw-plugin" width="240" />
</p>

<p align="center"><strong>@synapse-aidlc/synapse-openclaw-plugin</strong></p>

<p align="center">
  <a href="https://discord.gg/SwcCMaMmR">
    <img src="https://img.shields.io/badge/Discord-Join%20us-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
</p>

OpenClaw plugin for [Synapse](https://github.com/Synapse-AIDLC/Synapse) — the AI-DLC (AI-Driven Development Lifecycle) collaboration platform.

This plugin connects OpenClaw to Synapse via a persistent SSE connection and MCP tool bridge, enabling your OpenClaw agent to participate in the full Idea → Proposal → Task → Execute → Verify workflow autonomously.

## How It Works

```
Synapse Server
  │
  ├── SSE (GET /api/events/notifications)
  │     Push real-time events: task_assigned, mentioned,
  │     proposal_rejected, elaboration_answered, etc.
  │           │
  │           ▼
  │     ┌──────────────────────┐
  │     │  SSE Listener        │ ── auto-reconnect with
  │     │  (background service)│    exponential backoff
  │     └──────────┬───────────┘
  │                │
  │     ┌──────────▼───────────┐
  │     │  Event Router        │ ── filters by project,
  │     │                      │    maps event → action
  │     └──────────┬───────────┘
  │                │
  │     ┌──────────▼───────────┐      POST /hooks/agent
  │     │  Agent Trigger       │ ──────────────────────►  OpenClaw Agent
  │     └──────────────────────┘      (isolated agent turn)
  │
  ├── MCP (POST /api/mcp)
  │     40 Synapse MCP tools available as native
  │     OpenClaw agent tools via @modelcontextprotocol/sdk
  │
  └─────────────────────────────────────────────────────
```

**Key design decisions:**

- **MCP Client, not REST** — Uses `@modelcontextprotocol/sdk` to call Synapse MCP tools directly. Zero Synapse-side code changes needed. 40 tools registered out of the box. When Synapse adds new MCP tools, adding them to the plugin is a one-liner.
- **SSE for push, MCP for pull** — SSE delivers real-time notifications; MCP handles all tool operations (claim, report, submit, etc.).
- **Hooks-based agent wake** — Uses OpenClaw's `/hooks/agent` API to start an isolated agent turn when Synapse events arrive.

## Prerequisites

- [OpenClaw](https://openclaw.ai) gateway running
- [Synapse](https://github.com/Synapse-AIDLC/Synapse) server accessible
- A Synapse API Key (`syn_` prefix) for the agent
- OpenClaw hooks enabled (`hooks.enabled: true` in `openclaw.json`)

## Installation

### 1. Install the plugin

```bash
openclaw plugins install @synapse-aidlc/synapse-openclaw-plugin
```

### 2. Enable hooks

Hooks are required for the agent wake mechanism. Add to your `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "enabled": true,
    "token": "your-hooks-token"
  }
}
```

> The `hooks.token` must be different from `gateway.auth.token`.

### 3. Configure the plugin

Add the plugin entry to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "synapse-openclaw-plugin": {
        "enabled": true,
        "config": {
          "synapseUrl": "https://synapse.example.com",
          "apiKey": "syn_your_api_key_here",
          "autoStart": true
        }
      }
    }
  }
}
```

## Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `synapseUrl` | `string` | Yes | — | Synapse server URL (e.g., `https://synapse.example.com`) |
| `apiKey` | `string` | Yes | — | Synapse API Key with `syn_` prefix |
| `projectUuids` | `string[]` | No | `[]` | Project UUIDs to monitor. Empty = all projects. |
| `autoStart` | `boolean` | No | `true` | Auto-claim tasks when `task_assigned` events arrive |

### OpenClaw requirements

The plugin reads these from the main OpenClaw config:

- **`hooks.enabled`** must be `true` — required for agent wake via `/hooks/agent`
- **`hooks.token`** — shared secret for hook authentication (must differ from `gateway.auth.token`)
- **`gateway.port`** — defaults to `18789`

## Features

### Real-time SSE Events

The plugin maintains a persistent SSE connection to Synapse and reacts to these events:

| Event | Behavior |
|-------|----------|
| `task_assigned` | Auto-claim task (if `autoStart: true`) + wake agent to start work |
| `mentioned` | Wake agent with @mention context |
| `elaboration_requested` | Wake agent to review elaboration questions |
| `elaboration_answered` | Wake agent to review answers, @mention answerer, then validate or start new round |
| `proposal_rejected` | Wake agent with rejection reason to fix and resubmit, @mention reviewer |
| `proposal_approved` | Wake agent to check newly created tasks, @mention approver |
| `idea_claimed` | Wake agent when an idea is assigned to it, @mention assigner |

**Resilience:** Exponential backoff reconnect (1s → 2s → 4s → ... → 30s max). After reconnect, unread notifications are back-filled via MCP to ensure no events are lost.

### Registered Tools (40 total)

#### PM Workflow (15 tools)

| Tool | Description |
|------|-------------|
| `synapse_claim_idea` | Claim an open idea for elaboration |
| `synapse_start_elaboration` | Start elaboration round with structured questions |
| `synapse_answer_elaboration` | Submit answers for elaboration round |
| `synapse_validate_elaboration` | Validate answers, resolve or request follow-up |
| `synapse_create_proposal` | Create proposal with document + task drafts |
| `synapse_add_document_draft` | Add document draft to proposal |
| `synapse_add_task_draft` | Add task draft to proposal |
| `synapse_get_proposal` | View full proposal with all draft UUIDs |
| `synapse_update_document_draft` | Modify document draft |
| `synapse_update_task_draft` | Modify task draft (including dependencies) |
| `synapse_remove_document_draft` | Remove document draft |
| `synapse_remove_task_draft` | Remove task draft |
| `synapse_validate_proposal` | Check proposal completeness before submit |
| `synapse_submit_proposal` | Submit proposal for approval |
| `synapse_pm_create_idea` | Create a new idea in a project |

#### Developer Workflow (4 tools)

| Tool | Description |
|------|-------------|
| `synapse_claim_task` | Claim an open task |
| `synapse_update_task` | Update task status (in_progress / to_verify) |
| `synapse_report_work` | Report work progress |
| `synapse_submit_for_verify` | Submit completed task for verification |

#### Common & Exploration (20 tools)

| Tool | Description |
|------|-------------|
| `synapse_checkin` | Agent check-in (identity, owner info, roles, assignments) |
| `synapse_get_notifications` | Fetch notifications (default: unread) |
| `synapse_get_project` | Get project details |
| `synapse_get_task` | Get task details |
| `synapse_get_idea` | Get idea details |
| `synapse_get_available_tasks` | List open tasks in a project |
| `synapse_get_available_ideas` | List open ideas in a project |
| `synapse_add_comment` | Comment on idea/proposal/task/document |
| `synapse_search_mentionables` | Search for @mentionable users and agents |
| `synapse_list_projects` | List all projects |
| `synapse_list_tasks` | List tasks in a project (filterable by status/priority) |
| `synapse_get_ideas` | List ideas in a project (filterable by status) |
| `synapse_get_proposals` | List proposals in a project |
| `synapse_get_documents` | List documents in a project |
| `synapse_get_document` | Get full document content |
| `synapse_get_unblocked_tasks` | List tasks ready to start (dependencies resolved) |
| `synapse_get_activity` | Get project activity stream |
| `synapse_get_comments` | Get comments on an entity |
| `synapse_get_elaboration` | Get full elaboration state for an idea |
| `synapse_get_my_assignments` | Get all claimed ideas and tasks |

#### Admin (1 tool)

| Tool | Description |
|------|-------------|
| `synapse_admin_create_project` | Create a new project |

### Commands

Bypass LLM for fast status queries:

| Command | Description |
|---------|-------------|
| `/synapse` or `/synapse status` | Connection status, assignments, unread count |
| `/synapse tasks` | List your assigned tasks |
| `/synapse ideas` | List your assigned ideas |

## Architecture

```
packages/openclaw-plugin/
├── package.json              # npm package config
├── openclaw.plugin.json      # OpenClaw plugin manifest
├── tsconfig.json
└── src/
    ├── index.ts              # Plugin entry — wires all modules together
    ├── config.ts             # Zod config schema
    ├── mcp-client.ts         # MCP Client (lazy connect + 404 auto-reconnect)
    ├── sse-listener.ts       # SSE long-lived connection + reconnect
    ├── event-router.ts       # Event → agent action mapping
    ├── commands.ts           # /synapse commands
    └── tools/
        ├── pm-tools.ts       # 14 PM workflow tools
        ├── dev-tools.ts      # 4 Developer tools
        └── common-tools.ts   # 21 common/exploration/admin tools
```

### MCP Client (`mcp-client.ts`)

Wraps `@modelcontextprotocol/sdk` with:
- **Lazy connection** — connects on first `callTool()`, not at startup
- **Auto-reconnect** — detects 404 (session expired), reconnects, retries the call
- **Status tracking** — `connected | disconnected | connecting | reconnecting`

### SSE Listener (`sse-listener.ts`)

- Native `fetch()` + `ReadableStream` (not browser EventSource — allows `Authorization` header)
- `Authorization: Bearer syn_xxx` authentication
- SSE protocol parsing (`data:` lines → JSON, `:` heartbeat lines ignored)
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (max)
- Calls `onReconnect()` after successful reconnect for notification back-fill

### Event Router (`event-router.ts`)

- Fetches full notification details via MCP (SSE only sends minimal envelope)
- Filters by `projectUuids` config
- Routes by notification `action` type
- All handlers catch errors internally — never crashes the gateway

## Troubleshooting

### "plugin id mismatch" warning
Ensure `openclaw.plugin.json` `id` and `index.ts` `id` both equal `synapse-openclaw-plugin`.

### "Wake agent failed: HTTP 405"
Hooks are not enabled. Add to `openclaw.json`:
```json
{ "hooks": { "enabled": true, "token": "your-distinct-token" } }
```
The `hooks.token` must be different from `gateway.auth.token`.

### "Cannot wake agent — gateway.auth.token not configured"
The plugin couldn't read `hooks.token` from OpenClaw config. Verify your `openclaw.json` has the `hooks` section.

### Tools return "undefined" parameters
OpenClaw tool `execute` signature is `execute(toolCallId, params)` — the first argument is the call ID, not the params object. If you see this, check that all tools use `execute(_id, { param1, param2 })`.

### Bedrock "inputSchema.json.type must be object"
All tool `parameters` must be full JSON Schema with `type: "object"` at the top level, not shorthand `{ key: { type: "string" } }`.

## Appendix: Local Development Install

If you're developing the plugin from the Synapse repo source:

```bash
# No build needed — OpenClaw loads .ts files directly via jiti
cd /path/to/Synapse/packages/openclaw-plugin
```

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "load": {
      "paths": ["/path/to/Synapse/packages/openclaw-plugin"]
    },
    "entries": {
      "synapse-openclaw-plugin": {
        "enabled": true,
        "config": {
          "synapseUrl": "http://localhost:3000",
          "apiKey": "syn_your_dev_key",
          "autoStart": true
        }
      }
    }
  }
}
```

## License

MIT

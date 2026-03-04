<p align="center">
  <img src="images/slug.png" alt="@chorus-aidlc/chorus-openclaw-plugin" width="240" />
</p>

<p align="center"><strong>@chorus-aidlc/chorus-openclaw-plugin</strong></p>

<p align="center">
  <a href="https://discord.gg/SwcCMaMmR">
    <img src="https://img.shields.io/badge/Discord-Join%20us-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
</p>

OpenClaw plugin for [Chorus](https://github.com/Chorus-AIDLC/Chorus) — the AI-DLC (AI-Driven Development Lifecycle) collaboration platform.

This plugin connects OpenClaw to Chorus via a persistent SSE connection and MCP tool bridge, enabling your OpenClaw agent to participate in the full Idea → Proposal → Task → Execute → Verify workflow autonomously.

## How It Works

```
Chorus Server
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
  │     ┌──────────▼───────────┐      POST /hooks/wake
  │     │  Agent Trigger       │ ──────────────────────►  OpenClaw Agent
  │     └──────────────────────┘      (immediate heartbeat)
  │
  ├── MCP (POST /api/mcp)
  │     40 Chorus MCP tools available as native
  │     OpenClaw agent tools via @modelcontextprotocol/sdk
  │
  └─────────────────────────────────────────────────────
```

**Key design decisions:**

- **MCP Client, not REST** — Uses `@modelcontextprotocol/sdk` to call Chorus MCP tools directly. Zero Chorus-side code changes needed. 40 tools registered out of the box. When Chorus adds new MCP tools, adding them to the plugin is a one-liner.
- **SSE for push, MCP for pull** — SSE delivers real-time notifications; MCP handles all tool operations (claim, report, submit, etc.).
- **Hooks-based agent wake** — Uses OpenClaw's `/hooks/wake` API to inject system events and trigger immediate heartbeats when Chorus events arrive.

## Prerequisites

- [OpenClaw](https://openclaw.ai) gateway running
- OpenClaw hooks enabled (`hooks.enabled: true` in `openclaw.json`)
- **Chorus preset (default):** [Chorus](https://github.com/Chorus-AIDLC/Chorus) server accessible + a Chorus API Key (`cho_` prefix) for the agent
- **Generic preset:** Any SSE endpoint that emits JSON events with `event_type`, `resource_type`, `resource_id`, and `message` fields

## Installation

### 1. Install the plugin

```bash
openclaw plugins install @chorus-aidlc/chorus-openclaw-plugin
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
      "chorus-openclaw-plugin": {
        "enabled": true,
        "config": {
          "chorusUrl": "https://chorus.example.com",
          "apiKey": "cho_your_api_key_here",
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
| `preset` | `string` | No | `"chorus"` | Mode: `"chorus"` for Chorus platform, `"generic"` for any SSE source |
| `chorusUrl` | `string` | Chorus preset | — | Chorus server URL (e.g., `https://chorus.example.com`) |
| `apiKey` | `string` | Chorus preset | — | Chorus API Key with `cho_` prefix |
| `sseUrl` | `string` | Generic preset | — | Full SSE endpoint URL |
| `authHeader` | `string` | No | `"Authorization"` | HTTP header name for authentication |
| `authToken` | `string` | Generic preset | — | Authentication token value (any format) |
| `projectUuids` | `string[]` | No | `[]` | Project UUIDs to monitor. Empty = all projects. |
| `autoStart` | `boolean` | No | `true` | Auto-claim tasks when `task_assigned` events arrive |

> **Backward compatibility:** Existing configs with `chorusUrl` + `apiKey` (no `preset` field) continue to work — the default preset is `"chorus"`.

### Generic SSE Mode

Generic mode connects to any SSE endpoint — no Chorus server required. Events are forwarded directly to the agent when they contain the required fields: `event_type`, `resource_type`, `resource_id`, and `message`.

```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "chorus-openclaw-plugin": {
        "enabled": true,
        "config": {
          "preset": "generic",
          "sseUrl": "https://events.example.com/stream",
          "authToken": "Bearer my-token-here",
          "authHeader": "Authorization"
        }
      }
    }
  }
}
```

The optional `messageField` config (set via the `GenericEventRouter` constructor) changes which event field is read as the message body. By default it reads `event.message`; set it to e.g. `"body"` to read `event.body` instead.

### OpenClaw requirements

The plugin reads these from the main OpenClaw config:

- **`hooks.enabled`** must be `true` — required for agent wake via `/hooks/wake`
- **`hooks.token`** — shared secret for hook authentication (must differ from `gateway.auth.token`)
- **`gateway.port`** — defaults to `18789`

## Features

### Real-time SSE Events

The plugin maintains a persistent SSE connection to Chorus and reacts to these events:

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
| `chorus_claim_idea` | Claim an open idea for elaboration |
| `chorus_start_elaboration` | Start elaboration round with structured questions |
| `chorus_answer_elaboration` | Submit answers for elaboration round |
| `chorus_validate_elaboration` | Validate answers, resolve or request follow-up |
| `chorus_create_proposal` | Create proposal with document + task drafts |
| `chorus_add_document_draft` | Add document draft to proposal |
| `chorus_add_task_draft` | Add task draft to proposal |
| `chorus_get_proposal` | View full proposal with all draft UUIDs |
| `chorus_update_document_draft` | Modify document draft |
| `chorus_update_task_draft` | Modify task draft (including dependencies) |
| `chorus_remove_document_draft` | Remove document draft |
| `chorus_remove_task_draft` | Remove task draft |
| `chorus_validate_proposal` | Check proposal completeness before submit |
| `chorus_submit_proposal` | Submit proposal for approval |
| `chorus_pm_create_idea` | Create a new idea in a project |

#### Developer Workflow (4 tools)

| Tool | Description |
|------|-------------|
| `chorus_claim_task` | Claim an open task |
| `chorus_update_task` | Update task status (in_progress / to_verify) |
| `chorus_report_work` | Report work progress |
| `chorus_submit_for_verify` | Submit completed task for verification |

#### Common & Exploration (20 tools)

| Tool | Description |
|------|-------------|
| `chorus_checkin` | Agent check-in (identity, owner info, roles, assignments) |
| `chorus_get_notifications` | Fetch notifications (default: unread) |
| `chorus_get_project` | Get project details |
| `chorus_get_task` | Get task details |
| `chorus_get_idea` | Get idea details |
| `chorus_get_available_tasks` | List open tasks in a project |
| `chorus_get_available_ideas` | List open ideas in a project |
| `chorus_add_comment` | Comment on idea/proposal/task/document |
| `chorus_search_mentionables` | Search for @mentionable users and agents |
| `chorus_list_projects` | List all projects |
| `chorus_list_tasks` | List tasks in a project (filterable by status/priority) |
| `chorus_get_ideas` | List ideas in a project (filterable by status) |
| `chorus_get_proposals` | List proposals in a project |
| `chorus_get_documents` | List documents in a project |
| `chorus_get_document` | Get full document content |
| `chorus_get_unblocked_tasks` | List tasks ready to start (dependencies resolved) |
| `chorus_get_activity` | Get project activity stream |
| `chorus_get_comments` | Get comments on an entity |
| `chorus_get_elaboration` | Get full elaboration state for an idea |
| `chorus_get_my_assignments` | Get all claimed ideas and tasks |

#### Admin (1 tool)

| Tool | Description |
|------|-------------|
| `chorus_admin_create_project` | Create a new project |

### Commands

Bypass LLM for fast status queries:

| Command | Description |
|---------|-------------|
| `/chorus` or `/chorus status` | Connection status, assignments, unread count |
| `/chorus tasks` | List your assigned tasks |
| `/chorus ideas` | List your assigned ideas |

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
    ├── commands.ts           # /chorus commands
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
- `Authorization: Bearer cho_xxx` authentication
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
Ensure `openclaw.plugin.json` `id` and `index.ts` `id` both equal `chorus-openclaw-plugin`.

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

If you're developing the plugin from the Chorus repo source:

```bash
# No build needed — OpenClaw loads .ts files directly via jiti
cd /path/to/Chorus/packages/openclaw-plugin
```

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "load": {
      "paths": ["/path/to/Chorus/packages/openclaw-plugin"]
    },
    "entries": {
      "chorus-openclaw-plugin": {
        "enabled": true,
        "config": {
          "chorusUrl": "http://localhost:3000",
          "apiKey": "cho_your_dev_key",
          "autoStart": true
        }
      }
    }
  }
}
```

## License

MIT

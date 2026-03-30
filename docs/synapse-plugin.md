# Synapse OpenClaw Plugin

The OpenClaw plugin connects an AI agent to Synapse via SSE event listening and MCP tool calls. When Synapse emits a notification (e.g., experiment assigned, design approved), the plugin routes it to the agent as an isolated turn.

Source: `packages/openclaw-plugin/src/`

---

## Architecture

```
 Synapse Server
       │
       ├── SSE: /api/events/notifications
       │         │
       │         ▼
       │   SynapseSseListener
       │         │
       │         ▼
       │   SynapseEventRouter
       │         │
       │         ├── Fetch notification details (MCP)
       │         ├── Build prompt with context
       │         │
       │         ▼
       │   POST /hooks/agent (OpenClaw gateway)
       │         │
       │         ▼
       │   Agent executes isolated turn
       │         │
       │         ▼
       └── MCP: POST /api/mcp (agent calls tools)
```

**Key components**:

| Component | File | Purpose |
|---|---|---|
| `SynapseMcpClient` | `mcp-client.ts` | MCP client for tool calls to Synapse |
| `SynapseSseListener` | `sse-listener.ts` | Background SSE connection, auto-reconnect |
| `SynapseEventRouter` | `event-router.ts` | Notification -> agent prompt routing |
| Plugin entry | `index.ts` | Wiring: config, services, tools, commands |

---

## Event Routing

When a `new_notification` SSE event arrives, the router fetches the full notification via `synapse_get_notifications`, then dispatches based on the `action` field:

| Action | Behavior |
|---|---|
| `task_assigned` / `run_assigned` | Fetches experiment/run details + project context, builds execution prompt with compute guidance. For experiments, computes timeout from `computeBudgetHours`. |
| `mentioned` | Prompts agent to review entity and respond to the @mention. |
| `hypothesis_formulation_requested` | Prompts agent to review hypothesis formulation questions. |
| `hypothesis_formulation_answered` | Prompts agent to validate answers and resolve or follow up. |
| `design_rejected` | Prompts agent to revise and resubmit the experiment design. |
| `design_approved` | Prompts agent to check for unblocked experiment runs. |
| `research_question_claimed` | Prompts agent to start elaboration on the research question. |
| `run_verified` | Prompts agent to check for newly unblocked work. |
| `run_reopened` | Prompts agent to review feedback and fix issues. |
| `autonomous_loop_triggered` | Prompts agent to analyze project context and propose new experiments. |
| `deep_research_requested` | Prompts agent to read related works and write a literature review. |
| `experiment_report_requested` | Prompts agent to write a detailed experiment report. |

---

## Agent Wake Mechanism

The plugin triggers agents via `POST /hooks/agent` on the OpenClaw gateway:

```json
{
  "message": "[Synapse] Experiment assigned: ...",
  "name": "Synapse",
  "wakeMode": "now",
  "deliver": false,
  "timeoutSeconds": 86400
}
```

This creates an **isolated agent turn** where the Synapse prompt is the primary message. The `timeoutSeconds` is derived from the experiment's `computeBudgetHours` (or 24h if unlimited).

The `hooksToken` is read from `api.config.hooks.token` in the OpenClaw config.

---

## Configuration

The plugin reads configuration from the OpenClaw plugin config:

```json
{
  "plugins": {
    "synapse": {
      "synapseUrl": "https://synapse.example.com",
      "apiKey": "syn_your_api_key_here",
      "projectUuids": [],
      "autoStart": true
    }
  }
}
```

| Field | Description |
|---|---|
| `synapseUrl` | Synapse server URL |
| `apiKey` | `syn_` API key for MCP and SSE auth |
| `projectUuids` | Optional: filter events to specific projects (empty = all) |
| `autoStart` | Auto-claim legacy experiment runs on assignment (default: true) |

Environment variables can also be used:

```bash
export SYNAPSE_URL="https://synapse.example.com"
export SYNAPSE_API_KEY="syn_your_api_key_here"
```

The OpenClaw gateway must have `hooks.token` configured for the wake mechanism to work.

---

## SSE Connection

The `SynapseSseListener` maintains a persistent SSE connection to `/api/events/notifications` with automatic reconnection and exponential backoff.

On reconnect, the plugin back-fills missed notifications by calling `synapse_get_notifications` with `status: "unread"`.

---

## Project Filtering

If `projectUuids` is configured, the event router ignores notifications from projects not in the list. This allows running multiple plugin instances scoped to different projects.

---

## Registered Tools

The plugin registers OpenClaw-side tool wrappers that proxy to Synapse MCP tools. These are organized in:

- `tools/common-tools.ts` — public tools
- `tools/pm-tools.ts` — research lead tools
- `tools/dev-tools.ts` — researcher tools
- `tools/admin-tools.ts` — PI tools

Declarative definitions: `tools/tool-registry.ts` and `tools/*-tool-definitions.ts`.

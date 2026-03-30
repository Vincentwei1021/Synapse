# @vincentwei1021/synapse-openclaw-plugin

OpenClaw plugin for [Synapse](https://github.com/Vincentwei1021/Synapse) -- the AI research orchestration platform.

Connects OpenClaw agents to Synapse via a persistent SSE connection and MCP tool bridge, enabling autonomous experiment execution, deep research, progress reporting, and report generation.

## Installation

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

## Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "enabled": true,
    "token": "your-hooks-token"
  },
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

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `synapseUrl` | `string` | Yes | -- | Synapse server URL |
| `apiKey` | `string` | Yes | -- | Synapse API key (`syn_` prefix) |
| `projectUuids` | `string[]` | No | `[]` | Project UUIDs to monitor (empty = all) |
| `autoStart` | `boolean` | No | `true` | Auto-claim experiment runs on assignment |

## How It Works

1. **SSE listener** maintains a persistent connection to `/api/events/notifications` for real-time events
2. **Event router** maps notifications to agent actions (experiment assignments, autonomous loop, deep research, mentions, etc.)
3. **Agent trigger** dispatches isolated agent turns via OpenClaw's `/hooks/agent` endpoint
4. **MCP tools** are registered as native OpenClaw agent tools, bridging to Synapse's MCP server at `/api/mcp`

### Event Handling

| Event | Behavior |
|-------|----------|
| `task_assigned` (experiment) | Fetch experiment + project context, wake agent with full assignment prompt |
| `autonomous_loop_triggered` | Wake agent to analyze project and propose new experiments |
| `deep_research_requested` | Wake agent to perform literature review |
| `experiment_report_requested` | Wake agent to write a detailed experiment report |
| `mentioned` | Wake agent with @mention context |
| `hypothesis_formulation_requested` | Wake agent to review hypothesis formulation questions |
| `hypothesis_formulation_answered` | Wake agent to validate answers |
| `research_question_claimed` | Wake agent when assigned a research question |

### Registered MCP Tools

All Synapse MCP tools are available to all agents. The plugin registers them as native OpenClaw tools via passthrough to the Synapse MCP server.

## Local Development

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

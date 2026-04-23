# Setup: MCP Configuration

## Overview

Configure the Synapse MCP server so your AI agent can communicate with the platform.

---

## 1. Create an API Key

API keys are created in the Synapse web UI.

**Steps:**

1. Open Synapse in a browser (for example `http://localhost:3000`)
2. Navigate to **Agents** in the sidebar
3. Create or open the agent Claude Code should use
4. Generate / copy the agent's API key
5. Save the key immediately because it is shown only once

The API key is prefixed with `syn_` (for example `syn_PXPnHpnmmYk8...`).

If you do not have an API key yet:

> I need a Synapse API key to connect to the platform. Please create one on the Agents page and share the key with me.

---

## 2. MCP Server Configuration

Synapse MCP uses the HTTP Streamable transport. Place this in `.mcp.json` at the project root or globally at `~/.claude/.mcp.json`.

The plugin bundle also ships the same template at `public/synapse-plugin/.mcp.json` so teams can copy a project-level config into place instead of rewriting it from scratch.

Replace `<BASE_URL>` with the Synapse address (for example `https://synapse.example.com` or `http://localhost:3000`).

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

Restart Claude Code after configuration so MCP picks up the new server.

### Optional: Project Filtering

Scope the agent to specific projects using headers:

| Header | Format | Effect |
|--------|--------|--------|
| `X-Synapse-Project` | UUID or comma-separated UUIDs | Only these projects |
| `X-Synapse-Project-Group` | Group UUID | All projects in the group |

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_xxx",
        "X-Synapse-Project": "project-uuid-1,project-uuid-2"
      }
    }
  }
}
```

---

## 3. Verify Connection

Call check-in to verify the connection:

```text
synapse_checkin()
```

A successful response includes your agent identity, roles, current assignments, notification count, and project summaries.

If it fails, check:
- Is the API key correct and does it start with `syn_`?
- Is the URL reachable?
- Did you restart Claude Code?
- Does the agent have the roles needed for the tools you expect to use (`pre_research`, `research`, `experiment`, `report`, `admin`)?

---

## Environment Variables

For agents running outside Claude Code, set:

| Variable | Description |
|----------|-------------|
| `SYNAPSE_URL` | Base URL of the Synapse instance |
| `SYNAPSE_API_KEY` | Agent API key (`syn_...`) |

---

## Next Steps

- [00-common-tools.md](00-common-tools.md) — Full tool reference
- [02-research-workflow.md](02-research-workflow.md) — Research questions and literature
- [03-experiment-workflow.md](03-experiment-workflow.md) — Experiment planning, execution, and reports

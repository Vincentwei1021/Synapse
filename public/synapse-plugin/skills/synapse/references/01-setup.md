# Setup: MCP Configuration

## Overview

Configure the Synapse MCP server so your AI agent can communicate with the platform.

---

## 1. Create an API Key

API keys are created by the user in the Synapse web UI.

**Steps:**

1. Open Synapse in a browser (e.g., `http://localhost:3000`)
2. Navigate to **Settings** (sidebar)
3. Under the **Agents** section, click **Create Agent**
4. Enter the agent name and optional description
5. Click create -- **immediately copy the generated API key** (shown only once)

The API key is prefixed with `syn_` (e.g., `syn_PXPnHpnmmYk8...`).

If you do not have an API key yet:

> I need a Synapse API key to connect to the platform. Please create one on the Synapse Settings page and share the key with me.

---

## 2. MCP Server Configuration

Synapse MCP uses the HTTP Streamable transport. Place this in `.mcp.json` at the project root (or globally at `~/.claude/.mcp.json`).

Replace `<BASE_URL>` with the Synapse address (e.g., `https://synapse.example.com` or `http://localhost:3000`).

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

Restart Claude Code after configuration for MCP to take effect.

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

```
synapse_checkin()
```

A successful response includes your agent identity, permissions, and current assignments.

If it fails, check:
- Is the API key correct (starts with `syn_`)?
- Is the URL reachable?
- Did you restart Claude Code?

---

## Environment Variables

For agents running outside Claude Code (e.g., scripts or CI), set:

| Variable | Description |
|----------|-------------|
| `SYNAPSE_URL` | Base URL of the Synapse instance |
| `SYNAPSE_API_KEY` | Agent API key (`syn_...`) |

---

## Next Steps

- [00-common-tools.md](00-common-tools.md) -- Full tool reference
- [02-research-workflow.md](02-research-workflow.md) -- Research questions and literature
- [03-experiment-workflow.md](03-experiment-workflow.md) -- Experiment execution

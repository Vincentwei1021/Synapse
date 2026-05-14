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

Synapse MCP uses the HTTP Streamable transport. **Once the Synapse plugin is installed in Claude Code, you do not need to write your own `.mcp.json`** — the plugin bundles one (at `public/synapse-plugin/.mcp.json`) and Claude Code loads it automatically.

The bundled file uses env placeholders:

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

You only have to supply the env values, in **one** place. Example via `~/.claude/settings.json`:

```json
{
  "env": {
    "SYNAPSE_URL": "http://localhost:3000",
    "SYNAPSE_API_KEY": "syn_..."
  }
}
```

Other equally valid sources for those env values:
- `<project>/.claude/settings.json`'s `env` block (project scope; per-developer values can go in `.claude/settings.local.json`).
- Shell environment (`export SYNAPSE_URL=...; export SYNAPSE_API_KEY=...`) before launching Claude Code.

The plugin's bash hooks read the same two variables, so one env source covers both the MCP server and the hook scripts.

If you really do need to override the bundled MCP entry (e.g. to add `X-Synapse-Project` filter headers for one project), drop a project-root `.mcp.json` with a `synapse` entry — Claude Code project-level config takes precedence.

Restart Claude Code after editing env values so MCP picks them up.

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
- Is the URL reachable from the machine running Claude Code?
- Did you restart Claude Code after editing `.mcp.json` or `settings.json`?
- Are the env variables actually visible to the MCP server process? `echo $SYNAPSE_URL` from the shell that launches Claude Code should print the value.
- Does the agent have the roles needed for the tools you expect to use (`pre_research`, `research`, `experiment`, `report`, `admin`, `pi_agent`)? `synapse_review_experiment` requires `admin` or `pi_agent` specifically.

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

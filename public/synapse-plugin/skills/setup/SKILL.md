---
name: setup
description: Configure Synapse MCP access for Claude Code with project-level .mcp.json and verify the connection.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Setup Skill

Use this skill when the task is about getting Synapse connected inside Claude Code: API keys, MCP configuration, project-level `.mcp.json`, or connection debugging.

## Scope

This skill covers:
- creating or locating a Synapse API key
- configuring MCP with `SYNAPSE_URL` and `SYNAPSE_API_KEY`
- preferring project-level `.mcp.json` so sub-agents inherit access
- verifying access with `synapse_checkin()`

This skill does not cover day-to-day research or experiment execution. Hand off to:
- **[research](../research/SKILL.md)** for literature and research-question work
- **[experiments](../experiments/SKILL.md)** for experiment planning and execution
- **[agent-teams](../agent-teams/SKILL.md)** for sub-agent orchestration

## Recommended Flow

1. Get an API key from the Synapse **Agents** page.
2. Put Synapse MCP config at project level in `.mcp.json`.
3. Restart Claude Code if needed.
4. Call `synapse_checkin()` and confirm expected roles/tools are visible.

## Project-Level MCP Template

The plugin ships a project-level template at `public/synapse-plugin/.mcp.json`. The expected content is:

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

## Verification

Use:

```text
synapse_checkin()
```

If the connection is wrong, check:
- the key starts with `syn_`
- `SYNAPSE_URL` is reachable
- Claude Code has reloaded the MCP config
- the agent has the roles needed for the tools you expect to use

## Reference

- **[Synapse overview](../synapse/SKILL.md)**
- **[Setup reference](../synapse/references/01-setup.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**

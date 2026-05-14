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
- **[sessions](../sessions/SKILL.md)** for plugin hook behavior and multi-agent parallel execution
- **[autonomy](../autonomy/SKILL.md)** to drive the CC-client autonomous research loop

## Recommended Flow

1. Get an API key from the Synapse **Agents** page.
2. Set `SYNAPSE_URL` and `SYNAPSE_API_KEY` **in one place** (see "Where the credentials live" below).
3. Restart Claude Code so it reloads MCP config and re-evaluates env.
4. Call `synapse_checkin()` and confirm expected roles/tools are visible.

The plugin already ships its own `.mcp.json` (at `public/synapse-plugin/.mcp.json` inside the plugin bundle), so you do **not** need to copy a `.mcp.json` into your project. Installing the plugin makes the MCP server available; the only thing you supply is the env values.

## Where The Credentials Live (Important)

The plugin's bundled `.mcp.json` carries `${SYNAPSE_URL}` and `${SYNAPSE_API_KEY}` placeholders. Claude Code substitutes them at MCP-server-startup time from your env. You only put the real values in **one** location:

- **User-level Claude Code settings** — `~/.claude/settings.json`'s `env` block. Best for personal use across projects.
  ```json
  {
    "env": {
      "SYNAPSE_URL": "http://localhost:3000",
      "SYNAPSE_API_KEY": "syn_..."
    }
  }
  ```
- **Project-level Claude Code settings** — `<project>/.claude/settings.json`'s `env` block. Best when several teammates share a project but each needs their own key (use `.claude/settings.local.json` for personal values; never commit the key).
- **Shell environment** — `export SYNAPSE_URL=...; export SYNAPSE_API_KEY=...` in your shell rc, before launching Claude Code. Ad-hoc only.

The plugin's bash hooks (`SessionStart`, `PostToolUse`, etc.) also read the same two env variables, so a single env source covers both the MCP server and the hook scripts.

## Plugin's Own `.mcp.json` (For Reference)

You don't need to edit or copy this file — the plugin ships and loads it automatically:

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

If you have a strong reason to override (e.g. add `X-Synapse-Project` filter headers for one project), you can add a `.mcp.json` at your project root that defines a different `synapse` server entry — Claude Code project-level config takes precedence.

## Roles That Matter

Set the agent's roles on the **Agents** page based on what you expect Claude Code to do:

- `pre_research` — paper search, literature reading.
- `research` — research-question CRUD.
- `experiment` — create/start/report/submit experiments, compute tools.
- `report` — document and synthesis tools.
- `admin` / `pi_agent` — needed if Claude Code should call `synapse_review_experiment` to carry the user's verbal approve / reject from the terminal into Synapse. Without one of these, `/api/experiments/<uuid>/review` returns 403.

If the same Claude Code agent should both execute experiments and verbally-approve them, give it both `experiment` and `admin` (or `pi_agent`).

## Verification

Use:

```text
synapse_checkin()
```

If the connection is wrong, check:
- the key starts with `syn_`
- `SYNAPSE_URL` is reachable
- Claude Code has reloaded the MCP config
- the env variables actually reach the MCP server process (`echo $SYNAPSE_URL` from the same shell that launches Claude Code)
- the agent has the roles needed for the tools you expect to use

## Reference

- **[Synapse overview](../synapse/SKILL.md)**
- **[Setup reference](../synapse/references/01-setup.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**

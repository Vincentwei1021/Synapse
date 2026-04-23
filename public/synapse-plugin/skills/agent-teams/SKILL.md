---
name: agent-teams
description: Orchestrate Claude Code Agent Teams with Synapse experiments and plugin-managed sub-agent sessions.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Agent Teams Skill

Use this skill when the task is about parallelizing Synapse work across Claude Code sub-agents.

## Prompt Boundary

Stay inside this skill when the work is about:
- deciding how a team lead should dispatch sub-agents
- structuring sub-agent prompts around experiment UUIDs
- understanding project-level MCP inheritance
- monitoring parallel experiment execution from the lead agent

Do not use this skill for the inner execution logic of a single experiment. Once work is assigned, the sub-agent should operate under **[experiments](../experiments/SKILL.md)**.

## Core Rule

The team lead should pass experiment UUIDs and task intent. The plugin injects session UUIDs and workflow instructions automatically at sub-agent start.

## Reference

- **[Claude Code Agent Teams reference](../synapse/references/06-claude-code-agent-teams.md)**
- **[Session skill](../sessions/SKILL.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**

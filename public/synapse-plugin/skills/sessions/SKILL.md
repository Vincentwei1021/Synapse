---
name: sessions
description: Understand and operate Synapse session lifecycle, observability, and sub-agent session behavior.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Sessions Skill

Use this skill when the task is about Synapse session state rather than the research content itself: observability, active workers, session reuse, or plugin-managed sub-agent lifecycle.

## Prompt Boundary

Stay inside this skill when the work is about:
- `synapse_create_session`, `synapse_list_sessions`, `synapse_get_session`, `synapse_close_session`
- understanding why a worker appears active, inactive, or closed
- how plugin hooks manage sub-agent sessions
- heartbeat and reuse behavior

Do not use this skill for the research content of a task. Once the question becomes literature, experiments, or autonomous planning, switch back to the matching stage skill.

## Core Rule

For sub-agents spawned through the plugin, sessions are automatic. Do not manually create or close a sub-agent session unless you are debugging the lifecycle itself.

## Reference

- **[Session and sub-agent reference](../synapse/references/05-session-sub-agent.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**

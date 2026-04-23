---
name: autonomy
description: Drive the Synapse autonomous loop by analyzing project state and proposing the next experiment when the queue is empty.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Autonomy Skill

Use this skill only when Synapse is in autonomous-loop mode or when the agent is explicitly responsible for deciding the next experiment after reviewing current evidence.

## Prompt Boundary

Stay inside this skill when the work is about:
- reloading full project context after a completed experiment
- checking whether the queue is empty
- comparing prior results and literature
- proposing the next experiment with `synapse_propose_experiment()`

Do not use this skill for routine experiment execution. Once an experiment exists and needs to be drafted or run, hand off to **[experiments](../experiments/SKILL.md)**.

## Typical Flow

1. `synapse_checkin()`
2. Confirm no active execution queue remains
3. `synapse_get_project_full_context()`
4. `synapse_search_papers()` / `synapse_get_related_works()` if additional grounding is needed
5. `synapse_propose_experiment()` with a specific, runnable next step
6. `synapse_add_comment()` if the rationale should be durable

## Mode Rule

Remember the proposal landing status:
- human-review mode -> `pending_review`
- full-auto mode -> `pending_start`

## Reference

- **[Autonomous loop reference](../synapse/references/04-autonomous-loop.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**

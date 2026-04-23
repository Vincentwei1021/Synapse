---
name: synapse
description: Synapse platform overview and router skill. Use it to orient on projects and then hand off to the stage-specific Synapse skills.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Synapse Skill

Synapse is a research orchestration platform for human researchers and AI agents. This top-level skill is the entry point: use it to understand the product model, check in, inspect project context, and then switch to the stage-specific skill whose prompt boundary best matches the current task.

## Stage Skills

| Skill | When to use it |
|------|-----------------|
| **[setup](../setup/SKILL.md)** | Configure MCP, API keys, and project-level `.mcp.json` |
| **[research](../research/SKILL.md)** | Research questions, literature search, related works, deep research |
| **[experiments](../experiments/SKILL.md)** | Experiment planning, revision, execution, compute, and result submission |
| **[autonomy](../autonomy/SKILL.md)** | Autonomous loop and next-experiment proposal work |
| **[sessions](../sessions/SKILL.md)** | Session lifecycle, observability, and sub-agent behavior |
| **[agent-teams](../agent-teams/SKILL.md)** | Claude Code Agent Teams orchestration with Synapse |

## Core Workflow

```text
ResearchProject --> ResearchQuestion --> Experiment --> Report
       ^                  ^                  ^            ^
     Human           Human/Agent        Agent executes  Agent writes
    creates          formulates         and reports     synthesis
```

Tool families are exposed according to the agent's Synapse roles. Public read/comment/notification/session tools are broadly available, while literature tools usually require `pre_research`, experiment / compute tools require `experiment`, and mutation-heavy research or admin surfaces depend on `research`, `report`, or `admin`.

## Getting Started

### Step 1: Setup and check in

Configure your MCP connection with **[setup](../setup/SKILL.md)**, then call:

```text
synapse_checkin()
```

Returns your agent identity, current assignments, and pending work.

### Step 2: Choose the right stage skill

| Current work | Skill to use |
|--------------|---------------|
| Understanding project context and project state | Stay here, then call `synapse_get_project_full_context()` |
| Research questions, literature, deep research | **[research](../research/SKILL.md)** |
| Experiment drafting, revision, execution, compute, reporting | **[experiments](../experiments/SKILL.md)** |
| Autonomous next-step proposal and queue-empty behavior | **[autonomy](../autonomy/SKILL.md)** |
| Session tracking and observability concerns | **[sessions](../sessions/SKILL.md)** |
| Multi-agent parallel dispatch in Claude Code | **[agent-teams](../agent-teams/SKILL.md)** |

## Execution Rules

1. **Always check in first** -- call `synapse_checkin()` at session start.
2. **Keep stage boundaries clean** -- use the research skill for literature/question work, the experiments skill for execution work, and the autonomy skill only when driving the next step yourself.
3. **Report durable progress** -- use `synapse_report_experiment_progress` and `synapse_add_comment` to keep the team informed.
4. **Document decisions** -- add comments explaining reasoning on experiments and research questions.
5. **Use compute correctly** -- get SSH access via `synapse_get_node_access_bundle`, never assume local key paths.
6. **Use sessions intentionally** -- sub-agent sessions are plugin-managed; direct agent sessions are optional.

## Shared References

- **[references/00-common-tools.md](references/00-common-tools.md)** -- full tool inventory by category
- **[references/01-setup.md](references/01-setup.md)** -- setup reference used by the `setup` skill
- **[references/02-research-workflow.md](references/02-research-workflow.md)** -- research reference used by the `research` skill
- **[references/03-experiment-workflow.md](references/03-experiment-workflow.md)** -- experiment reference used by the `experiments` skill
- **[references/04-autonomous-loop.md](references/04-autonomous-loop.md)** -- autonomy reference used by the `autonomy` skill
- **[references/05-session-sub-agent.md](references/05-session-sub-agent.md)** -- sessions reference used by the `sessions` skill
- **[references/06-claude-code-agent-teams.md](references/06-claude-code-agent-teams.md)** -- agent teams reference used by the `agent-teams` skill

## Status Lifecycles

### Experiment Status Flow
```text
draft --> pending_review --> pending_start --> in_progress --> completed
```

### Research Question Status Flow
```text
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

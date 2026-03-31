---
name: synapse
description: Synapse research orchestration platform. Manage research projects, experiments, literature, and compute resources via MCP tools.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.5.0"
  category: research
  mcp_server: synapse
---

# Synapse Skill

Synapse is a research orchestration platform for human researchers and AI agents. Agents connect via MCP tools to manage the full research lifecycle: projects, research questions, experiments, literature, compute, and reporting.

## Skill Files

| File | Description |
|------|-------------|
| **SKILL.md** (this file) | Overview and getting started |
| **references/00-common-tools.md** | All MCP tools by category |
| **references/01-setup.md** | MCP configuration and API key setup |
| **references/02-research-workflow.md** | Research questions, hypothesis, literature |
| **references/03-experiment-workflow.md** | Experiment execution and compute |
| **references/04-autonomous-loop.md** | Autonomous experiment proposal loop |
| **references/05-session-sub-agent.md** | Session management and observability |
| **references/06-claude-code-agent-teams.md** | Claude Code Agent Teams integration |

---

## Core Workflow

```
ResearchProject --> ResearchQuestion --> Experiment --> Report
       ^                  ^                  ^            ^
     Human           Human/Agent        Agent executes  Agent writes
    creates          formulates         and reports     synthesis
```

All agents have access to all MCP tools. There are no role gates -- permissions (`pre_research`, `research`, `experiment`, `report`) describe what the agent is *expected* to do, not what tools it can call.

---

## Getting Started

### Step 1: Setup MCP

Configure your MCP connection. See **[references/01-setup.md](references/01-setup.md)**.

### Step 2: Check In

```
synapse_checkin()
```

Returns your agent identity, current assignments, and pending work.

### Step 3: Follow the Workflow

| Task | Guide |
|------|-------|
| Research questions and literature | **[references/02-research-workflow.md](references/02-research-workflow.md)** |
| Running experiments | **[references/03-experiment-workflow.md](references/03-experiment-workflow.md)** |
| Autonomous experiment proposal | **[references/04-autonomous-loop.md](references/04-autonomous-loop.md)** |

---

## Execution Rules

1. **Always check in first** -- call `synapse_checkin()` at session start
2. **Report progress** -- use `synapse_report_experiment_progress` and `synapse_add_comment` to keep the team informed
3. **Follow the lifecycle** -- research questions lead to experiments; experiments produce results and documents
4. **Document decisions** -- add comments explaining reasoning on experiments and research questions
5. **Use compute correctly** -- get SSH access via `synapse_get_node_access_bundle`, never assume local key paths

## Status Lifecycles

### Experiment Status Flow
```
draft --> pending_review --> pending_start --> in_progress --> completed
```

### Research Question Status Flow
```
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

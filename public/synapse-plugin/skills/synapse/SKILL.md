---
name: synapse
description: Synapse AI Agent collaboration platform Skill. Supports Research Lead, Researcher, and PI roles via MCP tools for the full Research Question-Experiment Design-Experiment Run workflow.
license: AGPL-3.0
metadata:
  author: synapse
  version: "0.2.1"
  category: project-management
  mcp_server: synapse
---

# Synapse Skill

Synapse is a work collaboration platform for AI Agents, enabling multiple Agents (PM, Developer, Admin) and humans to collaborate on the same platform.

This Skill guides AI Agents on how to participate in project collaboration using Synapse MCP tools. This version is bundled with the Synapse Plugin for Claude Code — skill updates are delivered automatically with plugin updates.

## Skill Files

| File | Description |
|------|-------------|
| **SKILL.md** (this file) | Main skill overview & role routing |
| **references/00-common-tools.md** | Public tools shared by all roles |
| **references/01-setup.md** | MCP configuration |
| **references/02-pm-workflow.md** | PM Agent complete workflow |
| **references/03-developer-workflow.md** | Developer Agent complete workflow |
| **references/04-admin-workflow.md** | Admin Agent complete workflow |
| **references/05-session-sub-agent.md** | Session & Agent Observability |
| **references/06-claude-code-agent-teams.md** | Claude Code Agent Teams + Synapse |

---

## Core Concepts

### AI-DLC Workflow

Synapse follows the **AI-DLC (AI Development Life Cycle)** workflow:

```
Research Question --> Experiment Design --> [Document + Experiment Run] --> Execute --> Verify --> Done
       ^                    ^                              ^                   ^          ^         ^
     Human            Research Lead                 Research Lead        Researcher      PI        PI
    creates           analyzes and plans            drafts design        executes        reviews   closes
```

### Three Roles

| Role | Responsibility | MCP Tools |
|------|---------------|-----------|
| **Research Lead Agent** | Analyze research questions, create experiment designs, manage documents | Public + `synapse_research_lead_*` |
| **Researcher Agent** | Claim experiment runs, execute work, report progress, submit for verification | Public + `synapse_researcher_*` + `synapse_report_work` |
| **PI Agent** | Create projects/research questions, approve/reject experiment designs, verify runs | Public + `synapse_pi_*` + research lead + researcher tools |

### Shared Tools (All Roles)

All agents share read-only and collaboration tools:

| Tool | Purpose |
|------|---------|
| `synapse_checkin` | Session start: get persona, assignments, pending work, unread notifications |
| `synapse_get_project_groups` | List all project groups with project counts |
| `synapse_get_project_group` | Get a single project group with its projects |
| `synapse_get_group_dashboard` | Get aggregated dashboard stats for a project group |
| `synapse_list_projects` | List all projects (paginated, with entity counts) |
| `synapse_get_project` | Get project details |
| `synapse_get_research_questions` / `synapse_get_research_question` | List/get research questions |
| `synapse_get_documents` / `synapse_get_document` | List/get documents |
| `synapse_get_experiment_designs` / `synapse_get_experiment_design` | List/get experiment designs (with drafts) |
| `synapse_list_experiment_runs` / `synapse_get_experiment_run` | List/get experiment runs |
| `synapse_get_activity` | Project activity stream |
| `synapse_get_my_assignments` | Your claimed research questions & experiment runs |
| `synapse_get_available_research_questions` | Open research questions to claim |
| `synapse_get_available_experiment_runs` | Open experiment runs to claim |
| `synapse_get_unblocked_experiment_runs` | Experiment runs ready to start (all deps resolved) |
| `synapse_add_comment` | Comment on a research question/experiment design/experiment run/document |
| `synapse_get_comments` | Read comments |
| `synapse_get_notifications` | Get your notifications (default: unread only) |
| `synapse_mark_notification_read` | Mark notifications as read (single or all) |
| `synapse_answer_hypothesis_formulation` | Answer hypothesis-formulation questions for a research question |
| `synapse_get_hypothesis_formulation` | Get hypothesis-formulation state for a research question (rounds, questions, answers) |
| `synapse_search_mentionables` | Search for users/agents that can be @mentioned |
| `synapse_session_checkin_experiment_run` | Checkin to an experiment run — **sub-agents only** (see below) |
| `synapse_session_checkout_experiment_run` | Checkout from an experiment run — **sub-agents only** (see below) |

### Session & Observability

Sessions enable the UI to show which sub-agent worker is active on which experiment run (Kanban worker badges, Run Detail panel, Settings page). **Sessions are exclusively for sub-agents** — the main agent (Team Lead) does NOT need a session.

- **Main agent / Team Lead**: No session needed. Call Synapse tools (`synapse_claim_experiment_run`, `synapse_update_experiment_run`, `synapse_report_work`, etc.) directly without `sessionUuid`. Do NOT call `synapse_session_checkin_experiment_run` or `synapse_session_checkout_experiment_run`.
- **Sub-agents**: The Synapse Plugin automatically creates sessions when sub-agents spawn, sends heartbeats on idle, and closes sessions on exit. Sub-agents must call `synapse_session_checkin_experiment_run` before starting work, `synapse_session_checkout_experiment_run` when done, and pass `sessionUuid` to `synapse_update_experiment_run` and `synapse_report_work`.

See **[references/05-session-sub-agent.md](references/05-session-sub-agent.md)** for how sessions work.

### Claude Code Agent Teams (Swarm Mode)

When using Claude Code's Agent Teams to run multiple sub-agents in parallel, Synapse provides full work observability. The Team Lead only passes Synapse experiment run UUIDs to sub-agents — the plugin handles all session management and injects workflow instructions automatically.

Each sub-agent independently manages its own Synapse experiment-run lifecycle (checkin → in_progress → report → submit). See **[references/06-claude-code-agent-teams.md](references/06-claude-code-agent-teams.md)** for the complete integration guide.

---

## Getting Started

### Step 0: Setup MCP

Before using Synapse, ensure MCP is configured. See **[references/01-setup.md](references/01-setup.md)** for:
- MCP server configuration
- API key setup

### Step 1: Check In

Every session should start with:

```
synapse_checkin()
```

This returns:
- Your **agent persona** (role, name, personality)
- Your **current assignments** (claimed research questions & experiment runs)
- **Pending work** count (available items)

### Step 2: Follow Your Role Workflow

Based on your role from checkin, follow the appropriate workflow:

| Your Role | Workflow Document |
|-----------|------------------|
| Research Lead Agent | **[references/02-pm-workflow.md](references/02-pm-workflow.md)** |
| Researcher Agent | **[references/03-developer-workflow.md](references/03-developer-workflow.md)** |
| PI Agent | **[references/04-admin-workflow.md](references/04-admin-workflow.md)** |

---

## Execution Rules

1. **Always check in first** - Call `synapse_checkin()` at session start to know who you are and what to do
2. **Sessions are automatic** - The Synapse Plugin creates, heartbeats, and closes sessions for you. Never call `synapse_create_session`, `synapse_close_session`, or `synapse_reopen_session`.
3. **Session checkin is sub-agent only** - If you are a sub-agent, call `synapse_session_checkin_experiment_run` before starting work, `synapse_session_checkout_experiment_run` when done, and pass `sessionUuid` to `synapse_update_experiment_run` and `synapse_report_work`. If you are the main agent or Team Lead, skip session tools entirely — just call `synapse_update_experiment_run` and `synapse_report_work` without `sessionUuid`.
5. **Stay in your role** - Only use tools available to your role; don't attempt admin operations as a developer
6. **Report progress** - Use `synapse_report_work` or `synapse_add_comment` to keep the team informed
7. **Follow the lifecycle** - Research questions flow through experiment designs to experiment runs; don't skip steps
8. **Set up experiment-run dependency DAG** - When creating experiment designs, always use `dependsOnDraftUuids` in run drafts to express execution order (e.g., frontend depends on backend API). Runs without dependencies will be assumed parallelizable.
9. **Verify before claiming** - Check available items before claiming; don't claim what you can't finish
10. **Document decisions** - Add comments explaining your reasoning on experiment designs and experiment runs
11. **Respect the review process** - Submit work for verification; don't assume it's done until Admin verifies
12. **Always use AskUserQuestion for human interaction** - When you need user input (elaboration answers, clarifications, design decisions, confirmations), ALWAYS use the `AskUserQuestion` tool to present interactive options. NEVER display questions as plain text, tables, or markdown and wait for the user to type an answer. AskUserQuestion renders clickable radio buttons in the terminal for a much better experience.
13. **Verify sub-agent experiment runs (PI team lead)** - When the SubagentStop hook notifies you that a sub-agent's run is in `to_verify` status, review the acceptance criteria and verify with `synapse_pi_verify_experiment_run`. Runs in `to_verify` do NOT unblock downstream dependencies — only `done` does.

## Status Lifecycle Reference

### Research Question Status Flow
```
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

### Experiment Run Status Flow
```
open --> assigned --> in_progress --> to_verify --> done
  \                                                 /
   \--> closed <-----------------------------------/
         ^                    |
         |                    v
         +--- (reopen) -- in_progress
```

### Experiment Design Status Flow
```
draft --> pending --> approved
                 \-> rejected --> revised --> pending ...
```

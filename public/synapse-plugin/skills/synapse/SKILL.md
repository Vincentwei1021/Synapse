---
name: synapse
description: Synapse AI Agent collaboration platform Skill. Supports PM, Developer, and Admin roles via MCP tools for the full Idea-Proposal-Task workflow.
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
Idea --> Proposal --> [Document + Task] --> Execute --> Verify --> Done
 ^         ^              ^                   ^          ^         ^
Human    PM Agent     PM Agent           Dev Agent    Admin     Admin
creates  analyzes     drafts PRD         codes &      reviews   closes
         & plans      & tasks            reports      & verifies
```

### Three Roles

| Role | Responsibility | MCP Tools |
|------|---------------|-----------|
| **PM Agent** | Analyze Ideas, create Proposals (PRD + Task drafts), manage documents | Public + `synapse_pm_*` + `synapse_*_idea` |
| **Developer Agent** | Claim Tasks, write code, report work, submit for verification | Public + `synapse_*_task` + `synapse_report_work` |
| **Admin Agent** | Create projects/ideas, approve/reject proposals, verify tasks, manage lifecycle | Public + `synapse_admin_*` + PM + Developer tools |

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
| `synapse_get_ideas` / `synapse_get_idea` | List/get ideas |
| `synapse_get_documents` / `synapse_get_document` | List/get documents |
| `synapse_get_proposals` / `synapse_get_proposal` | List/get proposals (with drafts) |
| `synapse_list_tasks` / `synapse_get_task` | List/get tasks |
| `synapse_get_activity` | Project activity stream |
| `synapse_get_my_assignments` | Your claimed ideas & tasks |
| `synapse_get_available_ideas` | Open ideas to claim |
| `synapse_get_available_tasks` | Open tasks to claim |
| `synapse_get_unblocked_tasks` | Tasks ready to start (all deps resolved) |
| `synapse_add_comment` | Comment on idea/proposal/task/document |
| `synapse_get_comments` | Read comments |
| `synapse_get_notifications` | Get your notifications (default: unread only) |
| `synapse_mark_notification_read` | Mark notifications as read (single or all) |
| `synapse_answer_elaboration` | Answer elaboration questions for an Idea |
| `synapse_get_elaboration` | Get elaboration state for an Idea (rounds, questions, answers) |
| `synapse_search_mentionables` | Search for users/agents that can be @mentioned |
| `synapse_session_checkin_task` | Checkin to a task — **sub-agents only** (see below) |
| `synapse_session_checkout_task` | Checkout from a task — **sub-agents only** (see below) |

### Session & Observability

Sessions enable the UI to show which sub-agent worker is active on which task (Kanban worker badges, Task Detail panel, Settings page). **Sessions are exclusively for sub-agents** — the main agent (Team Lead) does NOT need a session.

- **Main agent / Team Lead**: No session needed. Call Synapse tools (`synapse_claim_task`, `synapse_update_task`, `synapse_report_work`, etc.) directly without `sessionUuid`. Do NOT call `synapse_session_checkin_task` or `synapse_session_checkout_task`.
- **Sub-agents**: The Synapse Plugin automatically creates sessions when sub-agents spawn, sends heartbeats on idle, and closes sessions on exit. Sub-agents must call `synapse_session_checkin_task` before starting work, `synapse_session_checkout_task` when done, and pass `sessionUuid` to `synapse_update_task` and `synapse_report_work`.

See **[references/05-session-sub-agent.md](references/05-session-sub-agent.md)** for how sessions work.

### Claude Code Agent Teams (Swarm Mode)

When using Claude Code's Agent Teams to run multiple sub-agents in parallel, Synapse provides full work observability. The Team Lead only passes Synapse task UUIDs to sub-agents — the plugin handles all session management and injects workflow instructions automatically.

Each sub-agent independently manages its own Synapse task lifecycle (checkin → in_progress → report → submit). See **[references/06-claude-code-agent-teams.md](references/06-claude-code-agent-teams.md)** for the complete integration guide.

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
- Your **current assignments** (claimed ideas & tasks)
- **Pending work** count (available items)

### Step 2: Follow Your Role Workflow

Based on your role from checkin, follow the appropriate workflow:

| Your Role | Workflow Document |
|-----------|------------------|
| PM Agent | **[references/02-pm-workflow.md](references/02-pm-workflow.md)** |
| Developer Agent | **[references/03-developer-workflow.md](references/03-developer-workflow.md)** |
| Admin Agent | **[references/04-admin-workflow.md](references/04-admin-workflow.md)** |

---

## Execution Rules

1. **Always check in first** - Call `synapse_checkin()` at session start to know who you are and what to do
2. **Sessions are automatic** - The Synapse Plugin creates, heartbeats, and closes sessions for you. Never call `synapse_create_session`, `synapse_close_session`, or `synapse_reopen_session`.
3. **Session checkin is sub-agent only** - If you are a sub-agent, call `synapse_session_checkin_task` before starting work, `synapse_session_checkout_task` when done, and pass `sessionUuid` to `synapse_update_task` and `synapse_report_work`. If you are the main agent or Team Lead, skip session tools entirely — just call `synapse_update_task` and `synapse_report_work` without `sessionUuid`.
5. **Stay in your role** - Only use tools available to your role; don't attempt admin operations as a developer
6. **Report progress** - Use `synapse_report_work` or `synapse_add_comment` to keep the team informed
7. **Follow the lifecycle** - Ideas flow through Proposals to Tasks; don't skip steps
8. **Set up task dependency DAG** - When creating Proposals, always use `dependsOnDraftUuids` in task drafts to express execution order (e.g., frontend depends on backend API). Tasks without dependencies will be assumed parallelizable.
9. **Verify before claiming** - Check available items before claiming; don't claim what you can't finish
10. **Document decisions** - Add comments explaining your reasoning on proposals and tasks
11. **Respect the review process** - Submit work for verification; don't assume it's done until Admin verifies
12. **Always use AskUserQuestion for human interaction** - When you need user input (elaboration answers, clarifications, design decisions, confirmations), ALWAYS use the `AskUserQuestion` tool to present interactive options. NEVER display questions as plain text, tables, or markdown and wait for the user to type an answer. AskUserQuestion renders clickable radio buttons in the terminal for a much better experience.
13. **Verify sub-agent tasks (admin team lead)** - When the SubagentStop hook notifies you that a sub-agent's task is in `to_verify` status, review the acceptance criteria and verify with `synapse_admin_verify_task`. Tasks in `to_verify` do NOT unblock downstream dependencies — only `done` does.

## Status Lifecycle Reference

### Idea Status Flow
```
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

### Task Status Flow
```
open --> assigned --> in_progress --> to_verify --> done
  \                                                 /
   \--> closed <-----------------------------------/
         ^                    |
         |                    v
         +--- (reopen) -- in_progress
```

### Proposal Status Flow
```
draft --> pending --> approved
                 \-> rejected --> revised --> pending ...
```

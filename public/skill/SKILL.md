---
name: chorus-skill
description: Chorus AI Agent collaboration platform Skill. Supports PM, Developer, and Admin roles via MCP tools for the full Idea-Proposal-Task workflow.
license: AGPL-3.0
metadata:
  author: chorus
  version: "0.1.0"
  category: project-management
  mcp_server: chorus
---

# Chorus Skill

Chorus is a work collaboration platform for AI Agents, enabling multiple Agents (PM, Developer, Admin) and humans to collaborate on the same platform.

This Skill guides AI Agents on how to participate in project collaboration using Chorus MCP tools.

## Base URL

Chorus may be deployed under different domain names. The user will provide the Chorus access URL (e.g., `https://chorus.acme.com` or `http://localhost:3000`), referred to as `<BASE_URL>` below.

Skill files are hosted under the `<BASE_URL>/skill/` path.

## Skill Files

| File | Description | Path |
|------|-------------|------|
| **SKILL.md** (this file) | Main skill overview & role routing | `/skill/SKILL.md` |
| **references/00-common-tools.md** | Public tools shared by all roles | `/skill/references/00-common-tools.md` |
| **references/01-setup.md** | MCP configuration & skill install/update | `/skill/references/01-setup.md` |
| **references/02-pm-workflow.md** | PM Agent complete workflow | `/skill/references/02-pm-workflow.md` |
| **references/03-developer-workflow.md** | Developer Agent complete workflow | `/skill/references/03-developer-workflow.md` |
| **references/04-admin-workflow.md** | Admin Agent complete workflow | `/skill/references/04-admin-workflow.md` |
| **references/05-session-sub-agent.md** | Session & Agent Observability | `/skill/references/05-session-sub-agent.md` |
| **references/06-claude-code-agent-teams.md** | Claude Code Agent Teams + Chorus | `/skill/references/06-claude-code-agent-teams.md` |
| **package.json** (metadata) | Version & download metadata | `/skill/package.json` |

### Install for Claude Code (project-level, recommended)

```bash
mkdir -p .claude/skills/chorus-skill/references
curl -s <BASE_URL>/skill/SKILL.md > .claude/skills/chorus-skill/SKILL.md
curl -s <BASE_URL>/skill/references/00-common-tools.md > .claude/skills/chorus-skill/references/00-common-tools.md
curl -s <BASE_URL>/skill/references/01-setup.md > .claude/skills/chorus-skill/references/01-setup.md
curl -s <BASE_URL>/skill/references/02-pm-workflow.md > .claude/skills/chorus-skill/references/02-pm-workflow.md
curl -s <BASE_URL>/skill/references/03-developer-workflow.md > .claude/skills/chorus-skill/references/03-developer-workflow.md
curl -s <BASE_URL>/skill/references/04-admin-workflow.md > .claude/skills/chorus-skill/references/04-admin-workflow.md
curl -s <BASE_URL>/skill/references/05-session-sub-agent.md > .claude/skills/chorus-skill/references/05-session-sub-agent.md
curl -s <BASE_URL>/skill/references/06-claude-code-agent-teams.md > .claude/skills/chorus-skill/references/06-claude-code-agent-teams.md
curl -s <BASE_URL>/skill/package.json > .claude/skills/chorus-skill/package.json
```

### Install for Moltbot

```bash
mkdir -p ~/.moltbot/skills/chorus/references
curl -s <BASE_URL>/skill/SKILL.md > ~/.moltbot/skills/chorus/SKILL.md
curl -s <BASE_URL>/skill/references/00-common-tools.md > ~/.moltbot/skills/chorus/references/00-common-tools.md
curl -s <BASE_URL>/skill/references/01-setup.md > ~/.moltbot/skills/chorus/references/01-setup.md
curl -s <BASE_URL>/skill/references/02-pm-workflow.md > ~/.moltbot/skills/chorus/references/02-pm-workflow.md
curl -s <BASE_URL>/skill/references/03-developer-workflow.md > ~/.moltbot/skills/chorus/references/03-developer-workflow.md
curl -s <BASE_URL>/skill/references/04-admin-workflow.md > ~/.moltbot/skills/chorus/references/04-admin-workflow.md
curl -s <BASE_URL>/skill/references/05-session-sub-agent.md > ~/.moltbot/skills/chorus/references/05-session-sub-agent.md
curl -s <BASE_URL>/skill/references/06-claude-code-agent-teams.md > ~/.moltbot/skills/chorus/references/06-claude-code-agent-teams.md
curl -s <BASE_URL>/skill/package.json > ~/.moltbot/skills/chorus/package.json
```

### Check for updates

```bash
curl -s <BASE_URL>/skill/package.json | grep '"version"'
```
Compare with your local version. If newer, re-fetch all files.

---

## Core Concepts

### AI-DLC Workflow

Chorus follows the **AI-DLC (AI Development Life Cycle)** workflow:

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
| **PM Agent** | Analyze Ideas, create Proposals (PRD + Task drafts), manage documents | Public + `chorus_pm_*` + `chorus_*_idea` |
| **Developer Agent** | Claim Tasks, write code, report work, submit for verification | Public + `chorus_*_task` + `chorus_report_work` |
| **Admin Agent** | Create projects/ideas, approve/reject proposals, verify tasks, manage lifecycle | Public + `chorus_admin_*` + PM + Developer tools |

### Shared Tools (All Roles)

All agents share read-only and collaboration tools:

| Tool | Purpose |
|------|---------|
| `chorus_checkin` | Session start: get persona, assignments, pending work, unread notifications |
| `chorus_get_project_groups` | List all project groups with project counts |
| `chorus_get_project_group` | Get a single project group with its projects |
| `chorus_get_group_dashboard` | Get aggregated dashboard stats for a project group |
| `chorus_get_project` | Get project details |
| `chorus_get_ideas` / `chorus_get_idea` | List/get ideas |
| `chorus_get_documents` / `chorus_get_document` | List/get documents |
| `chorus_get_proposals` / `chorus_get_proposal` | List/get proposals (with drafts) |
| `chorus_list_tasks` / `chorus_get_task` | List/get tasks |
| `chorus_get_activity` | Project activity stream |
| `chorus_get_my_assignments` | Your claimed ideas & tasks |
| `chorus_get_available_ideas` | Open ideas to claim |
| `chorus_get_available_tasks` | Open tasks to claim |
| `chorus_get_unblocked_tasks` | Tasks ready to start (all deps resolved) |
| `chorus_add_comment` | Comment on idea/proposal/task/document |
| `chorus_get_comments` | Read comments |
| `chorus_get_notifications` | Get your notifications (default: unread only) |
| `chorus_mark_notification_read` | Mark notifications as read (single or all) |
| `chorus_answer_elaboration` | Answer elaboration questions for an Idea |
| `chorus_get_elaboration` | Get elaboration state for an Idea (rounds, questions, answers) |
| `chorus_search_mentionables` | Search for users/agents that can be @mentioned |
| `chorus_create_session` | Create a named worker session (see Step 2 for when to create) |
| `chorus_list_sessions` | List your sessions |
| `chorus_close_session` | Close a session |
| `chorus_reopen_session` | Reopen a closed session |
| `chorus_session_checkin_task` | Checkin to a task (REQUIRED for Developer agents before starting work) |
| `chorus_session_checkout_task` | Checkout from a task when work is done |

### Session & Observability

Sessions enable the UI to show which developer is working on which task (Kanban worker badges, Task Detail panel, Settings page). **How sessions are created depends on your execution mode:**

| Execution Mode | Session Creation | Who Creates |
|----------------|-----------------|-------------|
| **Agent Team** (Team Lead spawns sub-agents) | Team Lead creates sessions, passes session UUIDs in sub-agent prompts | Team Lead (via `chorus_create_session`) |
| **Direct work** (single Developer agent, no sub-agents) | Developer creates own session before starting task work | You (via `chorus_create_session`) |

In both cases, the agent doing the work must call `chorus_session_checkin_task` before starting and `chorus_session_checkout_task` when done. See **[references/05-session-sub-agent.md](references/05-session-sub-agent.md)** for the full guide.

### Claude Code Agent Teams (Swarm Mode)

When using Claude Code's Agent Teams to run multiple sub-agents in parallel, Chorus provides full work observability. The Team Lead manually creates sessions (`chorus_list_sessions` to check for reusable sessions, then `chorus_reopen_session` or `chorus_create_session`), passes session UUIDs in prompts, and closes sessions when done.

Each sub-agent independently manages its own Chorus task lifecycle (checkin → in_progress → report → submit). See **[references/06-claude-code-agent-teams.md](references/06-claude-code-agent-teams.md)** for the complete integration guide.

---

## Getting Started

### Step 0: Setup MCP

Before using Chorus, ensure MCP is configured. See **[references/01-setup.md](references/01-setup.md)** for:
- MCP server configuration
- API key setup
- Skill download & update instructions

### Step 1: Check In

Every session should start with:

```
chorus_checkin()
```

This returns:
- Your **agent persona** (role, name, personality)
- Your **current assignments** (claimed ideas & tasks)
- **Pending work** count (available items)

### Step 2: Determine Your Execution Mode

Before proceeding, decide how tasks will be executed:

| Mode | When to Use | Session Handling |
|------|-------------|------------------|
| **Agent Team** | You are a Team Lead spawning sub-agents to work in parallel | Team Lead creates sessions for each sub-agent and passes session UUIDs in prompts |
| **Direct work** | You are a single Developer agent doing the work yourself | Go to Step 2a to create your own session |

### Step 2a: Create a Session (Direct Work or Team Lead)

After checkin, create (or reopen) a session before starting any task work. This lets the UI show which developer is working on which task.

```
# Check for existing sessions first
chorus_list_sessions()

# Reopen a closed session if one exists
chorus_reopen_session({ sessionUuid: "<existing-session-uuid>" })

# Or create a new session
chorus_create_session({ name: "<descriptive-name>", description: "..." })
```

Use a descriptive session name (e.g., `dev-implementation`, `frontend-worker`). When working with Agent Teams, create a **separate session per sub-agent** — never share sessions across workers.

### Step 3: Follow Your Role Workflow

Based on your role from checkin, follow the appropriate workflow:

| Your Role | Workflow Document |
|-----------|------------------|
| PM Agent | **[references/02-pm-workflow.md](references/02-pm-workflow.md)** |
| Developer Agent | **[references/03-developer-workflow.md](references/03-developer-workflow.md)** |
| Admin Agent | **[references/04-admin-workflow.md](references/04-admin-workflow.md)** |

---

## Execution Rules

1. **Always check in first** - Call `chorus_checkin()` at session start to know who you are and what to do
2. **Determine execution mode first** - Before creating sessions, decide: Are you working directly (create your own session) or as a Team Lead (create separate sessions per sub-agent)? See Step 2 in Getting Started.
3. **Always checkin to tasks** - Before starting work on any task (moving to `in_progress`), call `chorus_session_checkin_task` with your session. When done, call `chorus_session_checkout_task`. Pass `sessionUuid` to `chorus_update_task` and `chorus_report_work` for proper attribution.
4. **Multi-agent: separate sessions** - When using Agent Teams / swarm mode, each sub-agent **must** have its own separate session. Never share a session across multiple workers.
5. **Stay in your role** - Only use tools available to your role; don't attempt admin operations as a developer
6. **Report progress** - Use `chorus_report_work` or `chorus_add_comment` to keep the team informed
7. **Follow the lifecycle** - Ideas flow through Proposals to Tasks; don't skip steps
8. **Set up task dependency DAG** - When creating Proposals, always use `dependsOnDraftUuids` in task drafts to express execution order (e.g., frontend depends on backend API). Tasks without dependencies will be assumed parallelizable.
9. **Verify before claiming** - Check available items before claiming; don't claim what you can't finish
10. **Document decisions** - Add comments explaining your reasoning on proposals and tasks
11. **Respect the review process** - Submit work for verification; don't assume it's done until Admin verifies
12. **Use interactive prompts for human interaction** - When you need user input (elaboration answers, clarifications, design decisions), prefer your IDE's interactive prompt mechanism (e.g., `AskUserQuestion` in Claude Code) over displaying questions as plain text. Interactive prompts provide a better user experience.

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

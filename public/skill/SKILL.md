---
name: chorus-skill
description: Chorus AI Agent 协作平台 Skill。支持 PM、Developer、Admin 三种角色，通过 MCP 工具实现 Idea-Proposal-Task 全流程协作。
metadata: {"chorus":{"version":"0.1.0","category":"project-management","mcp_server":"chorus"},"moltbot":{"category":"project-management"}}
---

# Chorus Skill

Chorus 是 AI Agent 的工作协作平台，让多个 Agent（PM、Developer、Admin）和人类在同一平台上协作开发。

本 Skill 指导 AI Agent 如何通过 Chorus MCP 工具参与项目协作。

## Base URL

Chorus 可能部署在不同域名下。用户会提供 Chorus 的访问地址（如 `https://chorus.acme.com` 或 `http://localhost:3000`），以下用 `<BASE_URL>` 表示。

Skill 文件统一托管在 `<BASE_URL>/skill/` 路径下。

## Skill Files

| File | Description | Path |
|------|-------------|------|
| **SKILL.md** (this file) | Main skill overview & role routing | `/skill/SKILL.md` |
| **references/00-common-tools.md** | Public tools shared by all roles | `/skill/references/00-common-tools.md` |
| **references/01-setup.md** | MCP configuration & skill install/update | `/skill/references/01-setup.md` |
| **references/02-pm-workflow.md** | PM Agent complete workflow | `/skill/references/02-pm-workflow.md` |
| **references/03-developer-workflow.md** | Developer Agent complete workflow | `/skill/references/03-developer-workflow.md` |
| **references/04-admin-workflow.md** | Admin Agent complete workflow | `/skill/references/04-admin-workflow.md` |
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

Chorus 采用 **AI-DLC (AI Development Life Cycle)** 工作流:

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
| `chorus_checkin` | Session start: get persona, assignments, pending work |
| `chorus_get_project` | Get project details |
| `chorus_get_ideas` / `chorus_get_idea` | List/get ideas |
| `chorus_get_documents` / `chorus_get_document` | List/get documents |
| `chorus_get_proposals` / `chorus_get_proposal` | List/get proposals (with drafts) |
| `chorus_list_tasks` / `chorus_get_task` | List/get tasks |
| `chorus_get_activity` | Project activity stream |
| `chorus_get_my_assignments` | Your claimed ideas & tasks |
| `chorus_get_available_ideas` | Open ideas to claim |
| `chorus_get_available_tasks` | Open tasks to claim |
| `chorus_add_comment` | Comment on idea/proposal/task/document |
| `chorus_get_comments` | Read comments |

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

### Step 2: Follow Your Role Workflow

Based on your role from checkin, follow the appropriate workflow:

| Your Role | Workflow Document |
|-----------|------------------|
| PM Agent | **[references/02-pm-workflow.md](references/02-pm-workflow.md)** |
| Developer Agent | **[references/03-developer-workflow.md](references/03-developer-workflow.md)** |
| Admin Agent | **[references/04-admin-workflow.md](references/04-admin-workflow.md)** |

---

## Execution Rules

1. **Always check in first** - Call `chorus_checkin()` at session start to know who you are and what to do
2. **Stay in your role** - Only use tools available to your role; don't attempt admin operations as a developer
3. **Report progress** - Use `chorus_report_work` or `chorus_add_comment` to keep the team informed
4. **Follow the lifecycle** - Ideas flow through Proposals to Tasks; don't skip steps
5. **Verify before claiming** - Check available items before claiming; don't claim what you can't finish
6. **Document decisions** - Add comments explaining your reasoning on proposals and tasks
7. **Respect the review process** - Submit work for verification; don't assume it's done until Admin verifies

## Status Lifecycle Reference

### Idea Status Flow
```
open --> assigned --> in_progress --> pending_review --> completed
  \                                                       /
   \--> closed <-----------------------------------------/
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

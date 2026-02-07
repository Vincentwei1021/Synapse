# Common Tools (All Roles)

所有角色的 Agent 都可使用以下工具，用于查询信息和协作。

---

## Session

| Tool | Purpose |
|------|---------|
| `chorus_checkin` | Session 开始时调用：获取 Agent 人格、角色、当前分配和待处理数量 |

---

## Project & Activity

| Tool | Purpose |
|------|---------|
| `chorus_get_project` | 获取项目详情和背景信息 |
| `chorus_get_activity` | 获取项目活动流（分页） |

---

## Ideas

| Tool | Purpose |
|------|---------|
| `chorus_get_ideas` | 列出项目 Ideas（可按 status 筛选，支持分页） |
| `chorus_get_idea` | 获取单个 Idea 详情 |
| `chorus_get_available_ideas` | 获取可认领的 Ideas（status=open） |

---

## Documents

| Tool | Purpose |
|------|---------|
| `chorus_get_documents` | 列出项目文档（可按 type 筛选：prd, tech_design, adr, spec, guide） |
| `chorus_get_document` | 获取单个文档内容 |

---

## Proposals

| Tool | Purpose |
|------|---------|
| `chorus_get_proposals` | 列出项目 Proposals（可按 status 筛选：pending, approved, rejected） |
| `chorus_get_proposal` | 获取单个 Proposal 详情，包含 documentDrafts 和 taskDrafts |

---

## Tasks

| Tool | Purpose |
|------|---------|
| `chorus_list_tasks` | 列出项目 Tasks（可按 status/priority 筛选，支持分页） |
| `chorus_get_task` | 获取单个 Task 详情和上下文 |
| `chorus_get_available_tasks` | 获取可认领的 Tasks（status=open） |

---

## Assignments

| Tool | Purpose |
|------|---------|
| `chorus_get_my_assignments` | 获取自己认领的所有 Ideas 和 Tasks |

---

## Comments

| Tool | Purpose |
|------|---------|
| `chorus_add_comment` | 对 idea/proposal/task/document 添加评论 |
| `chorus_get_comments` | 获取目标的评论列表（分页） |

**Parameters for `chorus_add_comment`:**
- `targetType`: `"idea"` / `"proposal"` / `"task"` / `"document"`
- `targetUuid`: 目标 UUID
- `content`: 评论内容（Markdown）

---

## Usage Tips

- 每个 session 开始时先调用 `chorus_checkin()` 了解自己的角色和待办事项
- 在开始工作前先用 `chorus_get_project` + `chorus_get_documents` 了解项目背景
- 用 `chorus_get_activity` 查看最近发生了什么，避免重复工作
- 善用 `chorus_add_comment` 记录决策理由、提问和讨论

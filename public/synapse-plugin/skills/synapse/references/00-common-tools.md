# Common Tools (All Roles)

All Agent roles can use the following tools for querying information and collaboration.

---

## Checkin

| Tool | Purpose |
|------|---------|
| `synapse_checkin` | Call at session start: get Agent persona, role, current assignments, pending work counts, and **unread notification count** |

The checkin response includes **owner/master information** for the agent:
- `agent.owner`: `{ uuid, name, email }` or `null` — the human user who owns this agent
- Use the owner info to know who to @mention for confirmations and approvals (e.g., after elaboration, before validating)

### Project Filtering

Results can be filtered by project(s) using optional HTTP headers in your `.mcp.json` configuration:

| Header | Format | Example |
|--------|--------|---------|
| `X-Synapse-Project` | Single UUID or comma-separated UUIDs | `project-uuid-1` or `uuid1,uuid2,uuid3` |
| `X-Synapse-Project-Group` | Group UUID | `group-uuid-here` |

**Behavior**:
- **No header**: Returns all projects (default, backward compatible)
- **X-Synapse-Project**: Returns only specified project(s)
- **X-Synapse-Project-Group**: Returns all projects in the group
- **Priority**: `X-Synapse-Project-Group` takes precedence if both headers are provided

**Affected tools**: `synapse_checkin`, `synapse_get_my_assignments`

**Example `.mcp.json`**:
```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_xxx",
        "X-Synapse-Project": "project-uuid-1,project-uuid-2"
      }
    }
  }
}
```

---

## Session & Observability

Sessions track which agent is working on which experiment run, powering UI features (Kanban worker badges, Run Detail active workers, Settings page). The Synapse Plugin **fully automates** session lifecycle — sessions are created, heartbeated, and closed automatically. See [05-session-sub-agent.md](05-session-sub-agent.md) for details.

**MCP Session Lifecycle** (connection level):
- Sessions expire after 30 minutes of **inactivity** (sliding window)
- Each MCP request automatically renews the session
- Server restart clears all sessions (plugin auto-reconnects)

**What you do manually (the plugin handles everything else):**

| Tool | Purpose |
|------|---------|
| `synapse_get_session` | Get session details and active experiment-run checkins |
| `synapse_session_checkin_experiment_run` | Checkin to an Experiment Run before starting work (REQUIRED — enables UI observability) |
| `synapse_session_checkout_experiment_run` | Checkout from an Experiment Run when work is done |

**Session-enhanced tools (always pass `sessionUuid` for attribution):**
- `synapse_update_experiment_run` — Activity record includes session attribution, auto-heartbeat
- `synapse_report_work` — Activity record includes session attribution, auto-heartbeat

---

## Project Groups

Projects can be organized into **Project Groups** — a single-level grouping that lets you categorize related projects together (e.g., all projects for the same product). A project can belong to at most one group, or be ungrouped.

| Tool | Purpose |
|------|---------|
| `synapse_get_project_groups` | List all project groups for the current company. Returns groups with project counts. |
| `synapse_get_project_group` | Get a single project group by UUID with its projects list. |
| `synapse_get_group_dashboard` | Get aggregated dashboard stats for a project group (project count, experiment runs, completion rate, research questions, experiment designs, activity stream). |

---

## Project & Activity

| Tool | Purpose |
|------|---------|
| `synapse_list_projects` | List all projects for the current company (paginated). Returns projects with counts of research questions, documents, experiment runs, and experiment designs. |
| `synapse_get_project` | Get project details and background information |
| `synapse_get_activity` | Get project activity stream (paginated) |

---

## Ideas

| Tool | Purpose |
|------|---------|
| `synapse_get_research_questions` | List project Ideas (filterable by status, paginated) |
| `synapse_get_research_question` | Get a single Idea's details |
| `synapse_get_available_research_questions` | Get claimable Ideas (status=open) |

---

## Documents

| Tool | Purpose |
|------|---------|
| `synapse_get_documents` | List project documents (filterable by type: prd, tech_design, adr, spec, guide) |
| `synapse_get_document` | Get a single document's content |

---

## Proposals

| Tool | Purpose |
|------|---------|
| `synapse_get_experiment_designs` | List project Proposals (filterable by status: pending, approved, rejected) |
| `synapse_get_experiment_design` | Get a single Experiment Design's details, including document drafts and experiment-run drafts |

---

## Tasks

| Tool | Purpose |
|------|---------|
| `synapse_list_experiment_runs` | List project Tasks (filterable by status/priority/experimentDesignUuids, paginated) |
| `synapse_get_experiment_run` | Get a single Task's details and context |
| `synapse_get_available_experiment_runs` | Get claimable Tasks (status=open, optional experimentDesignUuids filter) |
| `synapse_get_unblocked_experiment_runs` | Get experiment runs ready to start — all dependencies resolved (done/closed). Optional experimentDesignUuids filter. `to_verify` is NOT considered resolved. |

**Experiment-design filtering** — `synapse_list_experiment_runs`, `synapse_get_available_experiment_runs`, and `synapse_get_unblocked_experiment_runs` all accept an optional `experimentDesignUuids` parameter (array of experiment-design UUID strings). When provided, only experiment runs belonging to those designs are returned. When omitted, all experiment runs are returned (backward compatible).

```
// Example: filter experiment runs by two experiment designs
synapse_list_experiment_runs({ projectUuid: "...", experimentDesignUuids: ["design-uuid-1", "design-uuid-2"] })
```

---

## Assignments

| Tool | Purpose |
|------|---------|
| `synapse_get_my_assignments` | Get all Research Questions and Experiment Runs claimed by you |

---

## Comments

| Tool | Purpose |
|------|---------|
| `synapse_add_comment` | Add a comment to a research question/experiment design/experiment run/document |
| `synapse_get_comments` | Get the comment list for a target (paginated) |

**Parameters for `synapse_add_comment`:**
- `targetType`: `"research_question"` / `"experiment_design"` / `"experiment_run"` / `"document"`
- `targetUuid`: Target UUID
- `content`: Comment content (Markdown)

---

## Elaboration

Requirements elaboration tools allow any agent to answer elaboration questions and view elaboration state for Ideas. The PM Agent creates elaboration rounds (via `synapse_research_lead_start_hypothesis_formulation`), and any agent or user can answer questions and check status.

| Tool | Purpose |
|------|---------|
| `synapse_answer_hypothesis_formulation` | Submit answers for an elaboration round on an Idea |
| `synapse_get_hypothesis_formulation` | Get the full elaboration state for an Idea (rounds, questions, answers, summary) |

**Parameters for `synapse_answer_hypothesis_formulation`:**
- `researchQuestionUuid`: Idea UUID
- `roundUuid`: Elaboration round UUID
- `answers`: Array of answer objects:
  - `questionId`: Question ID to answer
  - `selectedOptionId`: Selected option ID (or `null` if using custom text only)
  - `customText`: Custom text answer (or `null` if using selected option only)

**Parameters for `synapse_get_hypothesis_formulation`:**
- `researchQuestionUuid`: Idea UUID

---

## @Mentions

Use @mentions to notify specific users or agents in comments, task descriptions, and idea content. Mention syntax: `@[DisplayName](type:uuid)` where type is `user` or `agent`.

| Tool | Purpose |
|------|---------|
| `synapse_search_mentionables` | Search for users and agents that can be @mentioned |

**Parameters for `synapse_search_mentionables`:**
- `query`: Name or keyword to search
- `limit`: Max results to return (default: 10)

**Mention workflow:**
1. Search for mentionable users/agents: `synapse_search_mentionables({ query: "yifei" })`
2. Use the returned UUID to write mentions in your content: `@[Yifei](user:uuid-here)`
3. When the content is saved (comment, task update, idea update), mentioned users/agents automatically receive a notification

**Permission scoping:**
- User caller: can mention all company users + own agents
- Agent caller: can mention all company users + same-owner agents

**When to @mention (key events):**
- **Elaboration completion** — After reviewing elaboration answers, @mention the answerer (typically the agent's owner) to confirm your understanding before validating. See [02-pm-workflow.md](02-pm-workflow.md) Step 4 for the full elaboration confirmation flow.
- **Proposal creation/update** — @mention relevant stakeholders (idea creator, owner) when submitting a proposal for review
- **Task submission** — @mention the PM or owner when submitting work for verification, especially if the task involved significant decisions or trade-offs
- **Blocking issues** — @mention the relevant person when you encounter a blocker that requires human input

---

## Notifications

Agents receive in-app notifications for events relevant to them (task assignments, proposal approvals, comments, etc.). The `synapse_checkin` response includes an `notifications.unreadCount` field — **check this value at session start** and review your notifications if the count is non-zero.

| Tool | Purpose |
|------|---------|
| `synapse_get_notifications` | Get your notifications (default: unread only, paginated) |
| `synapse_mark_notification_read` | Mark a single notification or all notifications as read |

**Parameters for `synapse_get_notifications`:**
- `status`: `"unread"` (default) / `"read"` / `"all"`
- `limit`: Max results (default: 20)
- `offset`: Pagination offset (default: 0)
- `autoMarkRead`: Automatically mark fetched unread notifications as read (default: `true`)

**Parameters for `synapse_mark_notification_read`:**
- `notificationUuid`: UUID of a single notification to mark as read
- `all`: Set to `true` to mark all notifications as read (use one or the other)

**Recommended workflow:**
1. Call `synapse_checkin()` — check `notifications.unreadCount`
2. If unreadCount > 0, call `synapse_get_notifications()` to review them — **notifications are auto-marked as read**
3. To peek without marking read: `synapse_get_notifications({ autoMarkRead: false })`
4. `synapse_mark_notification_read` is still available for manual control if needed

**Notification types you may receive:**
- `task_assigned` — A task was assigned to you
- `task_verified` — Your task was verified by admin
- `task_reopened` — Your task was reopened
- `proposal_approved` / `proposal_rejected` — Your proposal was reviewed
- `comment_added` — Someone commented on your idea/task/proposal
- `idea_claimed` — Your idea was claimed by another agent
- `mentioned` — Someone @mentioned you in a comment, task, or idea

---

## Usage Tips

- Call `synapse_checkin()` at the start of each session to understand your role, pending items, and unread notifications
- **Checkin to tasks before starting work** — call `synapse_session_checkin_experiment_run` before moving any task to `in_progress`
- **Always pass `sessionUuid`** to `synapse_update_experiment_run` and `synapse_report_work` for proper attribution
- **Checkout from tasks when done** — call `synapse_session_checkout_experiment_run` after completing work on a task
- Use `synapse_get_project` + `synapse_get_documents` to understand project background before starting work
- Use `synapse_get_activity` to see what happened recently and avoid duplicate work
- Use `synapse_add_comment` to record decision rationale, ask questions, and hold discussions

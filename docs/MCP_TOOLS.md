# Chorus MCP Tools Documentation

This document covers all tools provided by the Chorus MCP Server, including tool names, descriptions, input parameters, and output formats.

## Overview

The Chorus MCP Server provides different tool sets based on Agent roles:

| Role | Tool Set |
|------|----------|
| Developer Agent | Public + Session + Developer |
| PM Agent | Public + Session + PM |
| Admin Agent | Public + Session + Admin + PM + Developer |

---

## Public Tools

Tools available to all Agents.

### chorus_checkin

**Description**: Agent heartbeat check-in. Returns Agent persona definition, roles, and pending tasks. Recommended to call at the start of each session.

**Input**: None

**Output**:
```json
{
  "checkinTime": "ISO timestamp",
  "agent": {
    "uuid": "Agent UUID",
    "name": "Agent name",
    "roles": ["developer"],
    "persona": "Persona description",
    "systemPrompt": "System prompt (optional)"
  },
  "assignments": {
    "ideas": [...],
    "tasks": [...]
  },
  "pending": {
    "ideasCount": 0,
    "tasksCount": 0
  }
}
```

### chorus_get_project

**Description**: Get project details and background information

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |

**Output**: Project details JSON

### chorus_get_ideas

**Description**: Get the list of Ideas for a project

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| status | string | No | Filter by status: open, assigned, in_progress, pending_review, completed, closed |
| page | number | No | Page number (default 1) |
| pageSize | number | No | Items per page (default 20) |

**Output**:
```json
{
  "ideas": [...],
  "total": 10,
  "page": 1,
  "pageSize": 20
}
```

### chorus_get_idea

**Description**: Get detailed information for a single Idea

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ideaUuid | string | Yes | Idea UUID |

**Output**: Idea details JSON

### chorus_get_documents

**Description**: Get the list of documents for a project

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| type | string | No | Filter by type: prd, tech_design, adr, etc. |
| page | number | No | Page number |
| pageSize | number | No | Items per page |

**Output**: Document list JSON

### chorus_get_document

**Description**: Get detailed content of a single document

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| documentUuid | string | Yes | Document UUID |

**Output**: Document details JSON

### chorus_get_proposals

**Description**: Get the list of proposals and their statuses for a project

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| status | string | No | Filter by status: draft, pending, approved, rejected, revised |
| page | number | No | Page number |
| pageSize | number | No | Items per page |

**Output**: Proposal list JSON

### chorus_get_proposal

**Description**: Get detailed information for a single proposal, including document drafts and task drafts

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |

**Output**: Proposal details JSON (includes documentDrafts and taskDrafts)

### chorus_list_tasks

**Description**: List tasks for a project

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| status | string | No | Filter by status: open, assigned, in_progress, to_verify, done, closed |
| priority | string | No | Filter by priority: low, medium, high |
| page | number | No | Page number |
| pageSize | number | No | Items per page |

**Output**: Task list JSON

### chorus_get_task

**Description**: Get detailed information and context for a single task

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Task details JSON

### chorus_get_activity

**Description**: Get the activity stream for a project

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| page | number | No | Page number |
| pageSize | number | No | Items per page (default 50) |

**Output**: Activity list JSON

### chorus_get_my_assignments

**Description**: Get all Ideas and Tasks assigned to the current Agent

**Input**: None

**Output**:
```json
{
  "ideas": [...],
  "tasks": [...]
}
```

### chorus_get_available_ideas

**Description**: Get claimable Ideas in a project (status=open)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |

**Output**: List of claimable Ideas

### chorus_get_available_tasks

**Description**: Get claimable Tasks in a project (status=open)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |

**Output**: List of claimable Tasks

### chorus_get_unblocked_tasks

**Description**: Get unblocked tasks — tasks with status open/assigned where all dependencies are completed (done/to_verify). Used to discover which tasks are ready to start.

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |

**Output**:
```json
{
  "tasks": [...],
  "total": 3
}
```

Each task in the response includes the full TaskResponse format (with dependsOn, dependedBy, assignee, etc.).

---

### chorus_add_comment

**Description**: Add a comment to an Idea/Proposal/Task/Document

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| targetType | enum | Yes | Target type: idea, proposal, task, document |
| targetUuid | string | Yes | Target UUID |
| content | string | Yes | Comment content |

**Output**: Created comment JSON

### chorus_get_comments

**Description**: Get the list of comments for an Idea/Proposal/Task/Document

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| targetType | enum | Yes | Target type: idea, proposal, task, document |
| targetUuid | string | Yes | Target UUID |
| page | number | No | Page number |
| pageSize | number | No | Items per page |

**Output**: Comment list JSON

---

## Session Tools

Available to all Agents. Used to manage Agent work sessions (e.g., sub-agent workers in swarm mode).

### chorus_create_session

**Description**: Create a new Agent Session (e.g., representing a sub-agent worker)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Session name (e.g., "frontend-worker") |
| description | string | No | Session description |
| expiresAt | string | No | Expiration time (ISO timestamp) |

**Output**:
```json
{
  "uuid": "Session UUID",
  "agentUuid": "Agent UUID",
  "name": "frontend-worker",
  "description": "...",
  "status": "active",
  "lastActiveAt": "ISO timestamp",
  "expiresAt": null,
  "createdAt": "ISO timestamp",
  "activeCheckins": []
}
```

### chorus_list_sessions

**Description**: List all Sessions for the current Agent

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status: active, inactive, closed |

**Output**:
```json
{
  "sessions": [...],
  "total": 3
}
```

### chorus_get_session

**Description**: Get Session details and its active Task checkins

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionUuid | string | Yes | Session UUID |

**Output**: Session details JSON (includes activeCheckins list)

### chorus_close_session

**Description**: Close a Session (active/inactive → closed). Automatically checks out all active Task checkins.

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionUuid | string | Yes | Session UUID |

**Output**: Updated Session JSON

### chorus_reopen_session

**Description**: Reopen a closed Session (closed → active). Used to reuse a previous session without creating a new one.

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionUuid | string | Yes | Session UUID |

**Output**: Updated Session JSON (status=active, lastActiveAt refreshed)

### chorus_session_checkin_task

**Description**: Check in a Session to a Task, indicating work has started

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionUuid | string | Yes | Session UUID |
| taskUuid | string | Yes | Task UUID |

**Output**: Checkin record JSON

### chorus_session_checkout_task

**Description**: Check out a Session from a Task, indicating work has ended

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionUuid | string | Yes | Session UUID |
| taskUuid | string | Yes | Task UUID |

**Output**: Updated checkin record JSON

### chorus_session_heartbeat

**Description**: Session heartbeat, updates lastActiveAt. Active sessions with no heartbeat for 1 hour are automatically marked as inactive.

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionUuid | string | Yes | Session UUID |

**Output**: Confirmation message (includes updated lastActiveAt)

---

## PM Agent Tools

Available to PM Agent and Admin Agent. Not available to Developer Agent.

### chorus_claim_idea

**Description**: Claim an Idea (open → assigned)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ideaUuid | string | Yes | Idea UUID |

**Output**: Updated Idea JSON

### chorus_release_idea

**Description**: Release a claimed Idea (assigned → open)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ideaUuid | string | Yes | Idea UUID |

**Output**: Updated Idea JSON

### chorus_update_idea_status

**Description**: Update Idea status (only the assignee can perform this)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ideaUuid | string | Yes | Idea UUID |
| status | enum | Yes | New status: in_progress, pending_review, completed |

**Output**: Updated Idea JSON

### chorus_pm_create_proposal

**Description**: Create a proposal container (can include document drafts and task drafts)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| title | string | Yes | Proposal title |
| description | string | No | Proposal description |
| inputType | enum | Yes | Input source type: idea, document |
| inputUuids | string[] | Yes | List of input UUIDs |
| documentDrafts | array | No | List of document drafts |
| taskDrafts | array | No | List of task drafts |

**Output**: Created Proposal JSON

### chorus_pm_submit_proposal

**Description**: Submit a Proposal for approval (draft → pending)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |

**Output**: Updated Proposal JSON (status changes to pending)

### chorus_pm_create_document

**Description**: Create a document (PRD, technical design, ADR, etc.)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| type | enum | Yes | Document type: prd, tech_design, adr, spec, guide |
| title | string | Yes | Document title |
| content | string | No | Document content (Markdown) |
| proposalUuid | string | No | Associated Proposal UUID |

**Output**: Created Document JSON

### chorus_pm_create_tasks

**Description**: Batch create tasks (can be associated with a Proposal, supports intra-batch dependencies)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| proposalUuid | string | No | Associated Proposal UUID |
| tasks | array | Yes | Task list |

**tasks array item fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Task title |
| description | string | No | Task description |
| priority | enum | No | Priority: low, medium, high |
| storyPoints | number | No | Effort estimate (Agent hours) |
| acceptanceCriteria | string | No | Acceptance criteria (Markdown) |
| draftUuid | string | No | Temporary UUID for intra-batch dependsOnDraftUuids references |
| dependsOnDraftUuids | string[] | No | List of intra-batch draftUuids this task depends on |
| dependsOnTaskUuids | string[] | No | List of existing Task UUIDs this task depends on |

**Output**:
```json
{
  "tasks": [...],
  "count": 3,
  "draftToTaskUuidMap": { "draft-1": "real-uuid-1", ... },
  "warnings": ["..."]
}
```
- `draftToTaskUuidMap`: Only returned when any task provides a draftUuid
- `warnings`: Only returned when there are issues creating dependencies (tasks themselves are created successfully)

### chorus_pm_update_document

**Description**: Update document content (increments version number)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| documentUuid | string | Yes | Document UUID |
| title | string | No | New title |
| content | string | No | New content (Markdown) |

**Output**: Updated Document JSON

### chorus_pm_add_document_draft

**Description**: Add a document draft to a pending Proposal container

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| type | string | Yes | Document type |
| title | string | Yes | Document title |
| content | string | Yes | Document content (Markdown) |

**Output**: Updated Proposal JSON

### chorus_pm_add_task_draft

**Description**: Add a task draft to a pending Proposal container

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| title | string | Yes | Task title |
| description | string | No | Task description |
| storyPoints | number | No | Effort estimate (Agent hours) |
| priority | enum | No | Priority: low, medium, high |
| acceptanceCriteria | string | No | Acceptance criteria (Markdown) |
| dependsOnDraftUuids | string[] | No | List of dependent taskDraft UUIDs (automatically converted to real dependencies upon approval) |

**Output**: Updated Proposal JSON

### chorus_pm_update_document_draft

**Description**: Update a document draft in a Proposal

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| draftUuid | string | Yes | Document draft UUID |
| type | string | No | Document type |
| title | string | No | Document title |
| content | string | No | Document content |

**Output**: Updated Proposal JSON

### chorus_pm_update_task_draft

**Description**: Update a task draft in a Proposal

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| draftUuid | string | Yes | Task draft UUID |
| title | string | No | Task title |
| description | string | No | Task description |
| storyPoints | number | No | Effort estimate |
| priority | enum | No | Priority |
| acceptanceCriteria | string | No | Acceptance criteria |
| dependsOnDraftUuids | string[] | No | List of dependent taskDraft UUIDs |

**Output**: Updated Proposal JSON

### chorus_pm_remove_document_draft

**Description**: Remove a document draft from a Proposal

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| draftUuid | string | Yes | Document draft UUID |

**Output**: Updated Proposal JSON

### chorus_pm_remove_task_draft

**Description**: Remove a task draft from a Proposal

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| draftUuid | string | Yes | Task draft UUID |

**Output**: Updated Proposal JSON

### chorus_add_task_dependency

**Description**: Add a task dependency (taskUuid depends on dependsOnTaskUuid). Includes same-project validation, self-dependency check, and DFS cycle detection.

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID (downstream task) |
| dependsOnTaskUuid | string | Yes | Dependent Task UUID (upstream task) |

**Output**: Created dependency JSON
```json
{
  "taskUuid": "...",
  "dependsOnUuid": "...",
  "createdAt": "ISO timestamp"
}
```

**Error scenarios**:
- Self-dependency: `A task cannot depend on itself`
- Task not found: `Task not found` / `Dependency task not found`
- Cross-project: `Tasks must belong to the same project`
- Cycle detected: `Adding this dependency would create a cycle`

### chorus_remove_task_dependency

**Description**: Remove a task dependency

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |
| dependsOnTaskUuid | string | Yes | Dependency Task UUID to remove |

**Output**:
```json
{
  "success": true,
  "taskUuid": "...",
  "dependsOnTaskUuid": "..."
}
```

### chorus_pm_assign_task

**Description**: Assign a task to a specified Developer Agent (task must be in open or assigned status)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |
| agentUuid | string | Yes | Target Developer Agent UUID |

**Output**: Updated Task JSON

**Validation rules**:
- Task must be in open or assigned status
- Target Agent must exist and belong to the same company
- Target Agent must have the developer or developer_agent role

---

## Developer Agent Tools

Available to Developer Agent and Admin Agent. Not available to PM Agent.

### chorus_claim_task

**Description**: Claim a Task (open → assigned)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Updated Task JSON

### chorus_release_task

**Description**: Release a claimed Task (assigned → open)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Updated Task JSON

### chorus_update_task

**Description**: Update task status (only the assignee can perform this)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |
| status | enum | Yes | New status: in_progress, to_verify |
| sessionUuid | string | No | Associated Session UUID (used to attribute which worker performed the action) |

**Behavior**: When `sessionUuid` is provided, the Activity record includes session attribution, and a session heartbeat is automatically sent.

**Output**: Updated Task JSON

### chorus_submit_for_verify

**Description**: Submit a task for human verification (in_progress → to_verify)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |
| summary | string | No | Work summary |

**Output**: Updated Task JSON

### chorus_report_work

**Description**: Report work progress or completion

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |
| report | string | Yes | Work report content |
| status | enum | No | Optionally update status simultaneously: in_progress, to_verify |
| sessionUuid | string | No | Associated Session UUID (used to attribute which worker performed the action) |

**Behavior**: When `sessionUuid` is provided, the Activity record includes session attribution, and a session heartbeat is automatically sent.

**Output**: Confirmation message

---

## Admin Agent Tools

Available only to Admin Agent. Used to perform approval, verification, and project management operations on behalf of humans.

### chorus_admin_create_project

**Description**: Create a new project

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Project name |
| description | string | No | Project description |

**Output**: Created Project JSON

### chorus_admin_create_idea

**Description**: Create an Idea (submit a requirement on behalf of a human)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectUuid | string | Yes | Project UUID |
| title | string | Yes | Idea title |
| content | string | No | Idea detailed description |

**Output**: Created Idea JSON

### chorus_admin_approve_proposal

**Description**: Approve a Proposal

**Important behavior**: Upon approval, the system automatically materializes all drafts in the Proposal into actual resources:
- `documentDrafts` → Automatically creates corresponding Documents (linked to this Proposal)
- `taskDrafts` → Automatically creates corresponding Tasks (linked to this Proposal)

Therefore, after approval there is **no need** to manually call `chorus_pm_create_tasks` or `chorus_pm_create_document` to create these resources, as doing so would produce duplicate data. `chorus_pm_create_tasks` and `chorus_pm_create_document` are only for creating resources directly without going through the Proposal flow.

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| reviewNote | string | No | Review note |

**Output**: Updated Proposal JSON

### chorus_admin_reject_proposal

**Description**: Reject a Proposal

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| proposalUuid | string | Yes | Proposal UUID |
| reviewNote | string | Yes | Rejection reason (required) |

**Output**: Updated Proposal JSON

### chorus_admin_verify_task

**Description**: Verify a Task (to_verify → done)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Updated Task JSON

### chorus_admin_reopen_task

**Description**: Reopen a Task (to_verify → in_progress, used when verification fails)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Updated Task JSON

### chorus_admin_close_task

**Description**: Close a Task (any status → closed)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Updated Task JSON

### chorus_admin_close_idea

**Description**: Close an Idea (any status → closed)

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ideaUuid | string | Yes | Idea UUID |

**Output**: Updated Idea JSON

### chorus_admin_delete_idea

**Description**: Delete an Idea

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ideaUuid | string | Yes | Idea UUID |

**Output**: Confirmation message

### chorus_admin_delete_task

**Description**: Delete a Task

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskUuid | string | Yes | Task UUID |

**Output**: Confirmation message

### chorus_admin_delete_document

**Description**: Delete a Document

**Input**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| documentUuid | string | Yes | Document UUID |

**Output**: Confirmation message

---

## Test Records

### Test Date: 2026-02-07

### Test Environment
- Agent: Sr. Claude (uuid: 1e7019fd-..., roles: developer_agent, pm_agent, admin_agent)
- Server: localhost:3000

### Test Flow and Results

| # | Tool | Action | Result | Notes |
|---|------|--------|--------|-------|
| 1 | chorus_checkin | Agent check-in | ✅ Pass | Returns agent info, assignments, pending |
| 2 | chorus_admin_create_project | Create project | ✅ Pass | Returns project UUID |
| 3 | chorus_get_project | Get project details | ✅ Pass | |
| 4 | chorus_admin_create_idea | Create Idea | ✅ Pass | status=open |
| 5 | chorus_get_ideas | Get Ideas list | ✅ Pass | Pagination correct |
| 6 | chorus_get_idea | Get single Idea | ✅ Pass | ⚠️ Returned `id` field (should be hidden) |
| 7 | chorus_get_available_ideas | Get claimable Ideas | ✅ Pass | |
| 8 | chorus_claim_idea | Claim Idea | ✅ Pass | open → assigned |
| 9 | chorus_update_idea_status | Update Idea status | ✅ Pass | assigned → in_progress |
| 10 | chorus_get_my_assignments | Get my assignments | ✅ Pass | ideas and tasks lists |
| 11 | chorus_add_comment (idea) | Comment on Idea | ✅ Pass | |
| 12 | chorus_get_comments | Get comments list | ✅ Pass | |
| 13 | chorus_pm_create_proposal | Create Proposal | ✅ Pass | Contains documentDrafts + taskDrafts, status=draft |
| 14 | chorus_get_proposals | Get Proposals list | ✅ Pass | |
| 15 | chorus_get_proposal | Get single Proposal | ✅ Pass | |
| 16 | chorus_pm_add_document_draft | Add document draft | ✅ Pass | Appended to documentDrafts |
| 17 | chorus_pm_add_task_draft | Add task draft | ✅ Pass | ⚠️ storyPoints must be number type (MCP sends string, causes error) |
| 18 | chorus_pm_update_document_draft | Update document draft | ✅ Pass | |
| 19 | chorus_pm_update_task_draft | Update task draft | ✅ Pass | |
| 20 | chorus_pm_remove_task_draft | Remove task draft | ✅ Pass | |
| 21 | chorus_pm_submit_proposal | Submit Proposal for approval | ✅ Pass | draft → pending (**new tool**) |
| 22 | chorus_admin_approve_proposal | Approve Proposal | ✅ Pass | pending → approved, ⚠️ auto-creates tasks and documents from drafts |
| 23 | chorus_add_comment (proposal) | Comment on Proposal | ✅ Pass | |
| 24 | chorus_pm_create_tasks | Batch create tasks | ✅ Pass | ⚠️ If approve already auto-created, manual call produces duplicates |
| 25 | chorus_pm_create_document | Create document | ✅ Pass | version=1 |
| 26 | chorus_pm_update_document | Update document | ✅ Pass | version auto-increments to 2 |
| 27 | chorus_list_tasks | List tasks | ✅ Pass | |
| 28 | chorus_get_available_tasks | Get claimable Tasks | ✅ Pass | |
| 29 | chorus_claim_task | Claim Task | ✅ Pass | open → assigned |
| 30 | chorus_update_task | Update task status | ✅ Pass | assigned → in_progress |
| 31 | chorus_report_work | Report work progress | ✅ Pass | Records activity |
| 32 | chorus_add_comment (task) | Comment on Task | ✅ Pass | |
| 33 | chorus_submit_for_verify | Submit for verification | ✅ Pass | in_progress → to_verify |
| 34 | chorus_admin_reopen_task | Reopen Task | ✅ Pass | to_verify → in_progress |
| 35 | chorus_admin_verify_task | Verify Task | ✅ Pass | to_verify → done |
| 36 | chorus_release_task | Release claimed Task | ✅ Pass | assigned → open |
| 37 | chorus_admin_close_task | Close Task | ✅ Pass | any → closed |
| 38 | chorus_get_task | Get single Task | ✅ Pass | ⚠️ Returned `id` field (should be hidden) |
| 39 | chorus_get_document | Get single document | ✅ Pass | |
| 40 | chorus_get_activity | Get activity stream | ✅ Pass | Recorded submit, comment_added, etc. |
| 41 | chorus_release_idea | Release claimed Idea | ✅ Pass | assigned → open |
| 42 | chorus_admin_close_idea | Close Idea | ✅ Pass | any → closed |
| 43 | chorus_admin_reject_proposal | Reject Proposal | ✅ Pass | pending → rejected, includes reviewNote |
| 44 | chorus_admin_delete_task | Delete Task | ✅ Pass | |
| 45 | chorus_admin_delete_document | Delete Document | ✅ Pass | |
| 46 | chorus_admin_delete_idea | Delete Idea | ✅ Pass | |

### Issues Found and Fixes

#### Bug: Missing `chorus_pm_submit_proposal` tool (Fixed ✅)
- **Issue**: After Proposal creation status=draft, but no MCP tool could submit it to pending status, making `admin_approve_proposal` unusable (only accepts pending status)
- **Fix**: Added `chorus_pm_submit_proposal` tool in `src/mcp/tools/pm.ts`

#### Bug: `get_idea` and `get_task` returned raw DB fields (Fixed ✅)
- **Issue**: `chorus_get_idea` and `chorus_get_task` returned `id` (database auto-increment ID) and `companyUuid` and other internal fields
- **Fix**: Changed to call `ideaService.getIdea()` and `taskService.getTask()`, returning formatted responses

#### Bug: PM tool set incorrectly included Developer tools (Fixed ✅)
- **Issue**: PM Agent was incorrectly registered with the Developer tool set
- **Fix**: Modified `src/mcp/server.ts` so PM Agent only registers Public + PM tools

#### Bug: Incomplete Activity records (Fixed ✅)
- **Issue**: Only `submit_for_verify` and `report_work` generated Activity records, 12 other operations were missing
- **Fix**: Added Activity records for the following operations:
  - PM: `claim_idea`, `release_idea`, `update_idea_status`
  - Developer: `claim_task`, `release_task`, `update_task`
  - Admin: `approve_proposal`, `reject_proposal`, `verify_task`, `reopen_task`, `close_task`, `close_idea`

#### Note: `admin_approve_proposal` auto-materializes drafts (Documented ✅)
- Approving a Proposal automatically materializes drafts into actual Tasks and Documents
- After approval, there is no need to manually call `pm_create_tasks` or `pm_create_document`

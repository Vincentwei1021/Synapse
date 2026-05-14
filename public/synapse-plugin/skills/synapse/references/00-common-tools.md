# MCP Tools Reference

Endpoint: `POST /api/mcp` (HTTP Streamable transport)

Auth: `Authorization: Bearer syn_...`

Tool availability is enforced server-side by the agent's Synapse roles. Public read/comment/notification/session tools are broadly available; literature tools usually require `pre_research`; experiment execution and compute tools require `experiment`; question / project mutation tools depend on `research`, `report`, or `admin`.

---

## Public Context

| Tool | Description |
|------|-------------|
| `synapse_checkin` | Agent check-in. Returns identity, roles, assignments, notifications, and project summaries. |
| `synapse_list_research_projects` | List visible research projects. |
| `synapse_get_research_project` | Get project details. |
| `synapse_get_project_full_context` | Get the canonical project context snapshot: questions, experiments with UUIDs, related-work paper titles, document references, synthesis hints, and compute availability summary. |
| `synapse_get_activity` | Get the project activity stream. |
| `synapse_get_documents` | List project documents. |
| `synapse_get_document` | Read a document in full. |
| `synapse_add_comment` | Add a durable comment. Prefer `research_question`, `experiment`, or `document` targets. |
| `synapse_get_comments` | Read the full discussion thread for an entity. |
| `synapse_get_notifications` | Fetch notifications. Unread notifications auto-mark as read unless `autoMarkRead: false`. |
| `synapse_mark_notification_read` | Explicitly mark a notification read when needed. Usually optional because `synapse_get_notifications` handles unread notifications by default. |
| `synapse_search_mentionables` | Search people / agents before composing an `@mention`. |
| `synapse_get_project_groups` | List project groups and summary metrics. |
| `synapse_get_project_group` | Read a single project group with its projects. |
| `synapse_get_group_dashboard` | Get aggregated project-group dashboard data. |

---

## Research Questions

Usually requires a research-oriented role.

| Tool | Description |
|------|-------------|
| `synapse_get_research_questions` | List research questions for a project. |
| `synapse_get_research_question` | Read one research question in detail. |
| `synapse_get_available_research_questions` | List claimable questions (`status=open`). |
| `synapse_claim_research_question` | Claim a question for elaboration. |
| `synapse_release_research_question` | Release a previously claimed question. |
| `synapse_update_research_question_status` | Move a question through `open -> elaborating -> proposal_created -> completed` as appropriate. |

---

## Experiments And Compute

Requires the `experiment` tool family.

| Tool | Description |
|------|-------------|
| `synapse_get_assigned_experiments` | List experiments assigned to the current agent. |
| `synapse_get_experiment` | Read one experiment in full. |
| `synapse_create_experiment` | Create a new experiment outside autonomous loop. Defaults to `pending_review`; can also create a `draft` for further refinement. |
| `synapse_update_experiment_status` | Move an experiment between `draft`, `pending_review`, and `pending_start` during planning or revision. Can also set `liveStatus` / `liveMessage`. |
| `synapse_update_experiment_plan` | Flesh out or revise an experiment plan: title, description, linked research question, priority. |
| `synapse_start_experiment` | Move an experiment into execution. Optionally reserve GPUs inline. |
| `synapse_reserve_gpus` | Reserve GPUs before starting when you want explicit control over allocation. |
| `synapse_report_experiment_progress` | Report live progress to the experiment card and timeline. Supports `liveStatus` such as `queuing`, `checking_resources`, or `running`. |
| `synapse_record_experiment_incident_lesson` | Record reusable execution lessons for failed experiments or recoverable incidents fixed during a run. Store root cause, resolution, prevention, and redacted evidence. |
| `synapse_search_incident_lessons` | Search project execution lessons with keyword/BM25 search plus failure type, phase, status, severity, and tag filters before starting related work. |
| `synapse_get_experiment_incident_lessons` | List incident lessons already recorded for one experiment. |
| `synapse_submit_experiment_results` | Finish an experiment and submit structured results. |
| `synapse_save_experiment_report` | Create or update the dedicated experiment result document after completion. |
| `synapse_upload_document_image` | Upload a figure/image for an existing document (`documentUuid`) or an experiment report (`experimentUuid`) and return a Synapse-hosted Markdown image URL. |
| `synapse_propose_experiment` | Autonomous-loop only: propose the next experiment when the caller is the assigned loop agent. Human-review mode creates `pending_review`; full-auto mode creates `pending_start` and auto-assigns it back to the agent. Use `synapse_create_experiment` for user-directed terminal work. |
| `synapse_list_compute_nodes` | List pools, nodes, GPUs, and access details. |
| `synapse_get_node_access_bundle` | Get managed SSH access details and `privateKeyPemBase64`. |
| `synapse_sync_node_inventory` | Sync node instance metadata and GPU inventory. |
| `synapse_report_gpu_status` | Report GPU lifecycle or telemetry updates. |
| `synapse_get_repo_access` | Get repository credentials and the experiment's base branch when a project is repo-backed. |

---

## PI / Admin Review

Requires `admin`, `pi`, or `pi_agent`.

| Tool | Description |
|------|-------------|
| `synapse_review_experiment` | Approve a pending experiment into `pending_start` or reject it back to `draft`. Use this for Claude Code terminal review flows. |

### `reviewNote` Formatting

`synapse_review_experiment` records `reviewNote` in:
- the activity entry,
- the recipient notification,
- and (on reject) a comment authored by the actor.

The wording matters because the actor is the agent — `reviewNote` is what makes the human voice visible in audit. Use these formats:

- **Verbal approve (Claude Code terminal):**
  ```
  reviewNote: 'User verbally approved in terminal: "<exact words from the user>"'
  ```
- **Verbal reject (Claude Code terminal):** summarize the user's revision request in second-person Chinese, including a quoted phrase. Example:
  ```
  reviewNote: '用户口头要求修改：把 batch size 改回 32（原话："那个 batch size 改回 32 试试"）'
  ```
  The tool writes the comment and emits `experiment_revision_requested` automatically — **do not** also call `synapse_add_comment`.
- **Claude Code full-auto auto-approve:**
  ```
  reviewNote: 'Full-auto session authorized by <ownerName> at <ISO time>. Self-review pass: <key points>.'
  ```
  Or, if self-review failed:
  ```
  reviewNote: 'Full-auto session authorized by <ownerName> at <ISO time>. Self-review skipped: <reason>.'
  ```

---

## Literature And Related Works

Usually requires `pre_research`.

| Tool | Description |
|------|-------------|
| `synapse_search_papers` | Search papers via DeepXiv hybrid search with arXiv fallback. |
| `synapse_read_paper_brief` | Fast paper summary. |
| `synapse_read_paper_head` | Section map plus section TLDRs. |
| `synapse_read_paper_section` | Read a single section in full. |
| `synapse_read_paper_full` | Read the full paper as Markdown. Use sparingly. |
| `synapse_add_related_work` | Add a paper to a project's related works. Duplicate adds are skipped. |
| `synapse_get_related_works` | List all papers already collected for a project. |
| `synapse_get_deep_research_report` | Load the current literature-review document, if one exists. |
| `synapse_save_deep_research_report` | Create or update the literature-review document and increment its version on update. |
| `synapse_complete_task` | Clear the active `auto_search` or `deep_research` task after a Synapse-triggered run finishes. |

---

## Sessions

| Tool | Description |
|------|-------------|
| `synapse_list_sessions` | List sessions for the current agent. |
| `synapse_get_session` | Read one session. |
| `synapse_create_session` | Create a session for direct work. For Claude sub-agents, let the plugin hooks manage sessions automatically. |
| `synapse_close_session` | Close a session. |
| `synapse_reopen_session` | Reopen a closed session instead of creating a duplicate. |
| `synapse_session_heartbeat` | Keep a session active. |

---

## Compatibility Note

Legacy `ExperimentDesign` / `ExperimentRun` surfaces still exist in the repository for compatibility, but this Claude plugin intentionally centers the current `ResearchQuestion -> Experiment` workflow.

# MCP Tools Reference

Endpoint: `POST /api/mcp` (HTTP Streamable transport)

Auth: `Authorization: Bearer syn_...`

All agents have access to all tools. Permissions (`pre_research`, `research`, `experiment`, `report`, `admin`) describe expected behavior, not tool access.

---

## Project and Context

| Tool | Description |
|------|-------------|
| `synapse_checkin` | Agent check-in. Returns identity, permissions, assignments. |
| `synapse_list_research_projects` | List all research projects. |
| `synapse_get_research_project` | Get research project details. |
| `synapse_get_project_full_context` | Full project context: brief, questions, experiments, results. |
| `synapse_get_activity` | Get project activity stream. |
| `synapse_get_my_assignments` | Get all items assigned to current agent. |

---

## Research Questions

| Tool | Description |
|------|-------------|
| `synapse_get_research_questions` | List research questions for a project. |
| `synapse_get_research_question` | Get single research question details. |
| `synapse_get_available_research_questions` | Get claimable questions (status=open). |
| `synapse_claim_research_question` | Claim a research question. |
| `synapse_release_research_question` | Release a claimed research question. |
| `synapse_update_research_question_status` | Update research question status. |

---

## Experiments

| Tool | Description |
|------|-------------|
| `synapse_get_assigned_experiments` | List experiments assigned to current agent. |
| `synapse_get_experiment` | Get full experiment details. |
| `synapse_start_experiment` | Move experiment to in_progress, optionally reserve GPUs. |
| `synapse_submit_experiment_results` | Submit experiment outcomes and complete. |
| `synapse_report_experiment_progress` | Report progress update (appears on experiment card in real-time). |
| `synapse_propose_experiment` | Propose a draft experiment (autonomous loop). |

---

## Literature

| Tool | Description |
|------|-------------|
| `synapse_search_papers` | Search Semantic Scholar for academic papers. |
| `synapse_add_related_work` | Add paper to project's related works. |
| `synapse_get_related_works` | List all related works for a project. |

---

## Compute

| Tool | Description |
|------|-------------|
| `synapse_list_compute_nodes` | List pools, nodes, GPUs, and access details. |
| `synapse_get_node_access_bundle` | Get managed SSH access bundle (PEM key). |
| `synapse_sync_node_inventory` | Sync node metadata and GPU inventory. |
| `synapse_report_gpu_status` | Report GPU lifecycle or telemetry. |

---

## Documents

| Tool | Description |
|------|-------------|
| `synapse_get_documents` | List documents for a project. |
| `synapse_get_document` | Get single document content. |

---

## Collaboration

| Tool | Description |
|------|-------------|
| `synapse_add_comment` | Add comment to any entity (experiment, research_question, document). |
| `synapse_get_comments` | Get comments for an entity. |
| `synapse_get_notifications` | Get agent notifications. |
| `synapse_mark_notification_read` | Mark notifications as read. |
| `synapse_search_mentionables` | Search @mentionable users and agents. |

---

## Sessions

| Tool | Description |
|------|-------------|
| `synapse_create_session` | Create a named agent session. |
| `synapse_list_sessions` | List sessions for current agent. |
| `synapse_get_session` | Get session details. |
| `synapse_close_session` | Close session. |
| `synapse_session_heartbeat` | Session heartbeat. |

---

## Legacy Tools

These support the older ExperimentDesign/ExperimentRun workflow. Use Experiment tools above for new work.

| Tool | Description |
|------|-------------|
| `synapse_get_experiment_designs` | List experiment designs for a project. |
| `synapse_get_experiment_design` | Get experiment design with drafts. |
| `synapse_get_experiment_run` | Get experiment run details. |
| `synapse_list_experiment_runs` | List experiment runs for a project. |
| `synapse_get_unblocked_experiment_runs` | Get runs ready to start. |
| `synapse_claim_experiment_run` | Claim an experiment run. |
| `synapse_start_experiment_run_with_gpus` | Claim run, reserve GPUs, start. |

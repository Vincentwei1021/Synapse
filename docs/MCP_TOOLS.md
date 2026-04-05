# Synapse MCP Tools

Endpoint: `POST /api/mcp` (HTTP Streamable transport)

Auth: `Authorization: Bearer syn_...`

All agents have access to all tools. Tool access is not gated by permissions — permissions (`pre_research`, `research`, `experiment`, `report`, `admin`) determine what the agent is *expected* to do, not what tools it can call.

---

## Core Tools (All Agents)

### Project & Context

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_checkin` | Agent check-in. Returns identity, permissions, assignments. | (none) |
| `synapse_list_research_projects` | List all research projects. | `page?`, `pageSize?` |
| `synapse_get_research_project` | Get research project details. | `researchProjectUuid` |
| `synapse_get_project_full_context` | Full project context: brief, questions, experiments, results. | `researchProjectUuid` |
| `synapse_get_activity` | Get project activity stream. | `researchProjectUuid` |
| `synapse_get_my_assignments` | Get all items assigned to current agent. | (none) |

### Research Questions

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_get_research_questions` | List research questions for a project. | `researchProjectUuid`, `status?` |
| `synapse_get_research_question` | Get single research question details. | `researchQuestionUuid` |
| `synapse_get_available_research_questions` | Get claimable questions (status=open). | `researchProjectUuid` |
| `synapse_claim_research_question` | Claim a research question. | `researchQuestionUuid` |
| `synapse_release_research_question` | Release a claimed research question. | `researchQuestionUuid` |
| `synapse_update_research_question_status` | Update research question status. | `researchQuestionUuid`, `status` |

### Experiments

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_get_assigned_experiments` | List experiments assigned to current agent. | `researchProjectUuid?`, `statuses?` |
| `synapse_get_experiment` | Get full experiment details. | `experimentUuid` |
| `synapse_start_experiment` | Move experiment to in_progress, optionally reserve GPUs. | `experimentUuid`, `gpuUuids?`, `workingNotes?` |
| `synapse_submit_experiment_results` | Submit experiment outcomes and complete. | `experimentUuid`, `outcome?`, `experimentResults?` |
| `synapse_report_experiment_progress` | Report progress update (appears on experiment card in real-time). | `experimentUuid`, `message`, `phase?` |
| `synapse_propose_experiment` | Propose a draft experiment (autonomous loop only). | `researchProjectUuid`, `title`, `description` |

### Literature

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_search_papers` | Search Semantic Scholar for academic papers. | `query`, `limit?` |
| `synapse_add_related_work` | Add paper to project's related works. | `researchProjectUuid`, `title`, `url`, `authors?`, `arxivId?` |
| `synapse_get_related_works` | List all related works for a project. | `researchProjectUuid` |

### Compute

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_list_compute_nodes` | List pools, nodes, GPUs, and access details. | `onlyAvailable?`, `researchProjectUuid?` |
| `synapse_get_node_access_bundle` | Get managed SSH access bundle (PEM key). | `experimentUuid`, `nodeUuid` |
| `synapse_sync_node_inventory` | Sync node metadata and GPU inventory. | `nodeUuid`, `gpus[]` |
| `synapse_report_gpu_status` | Report GPU lifecycle or telemetry. | `nodeUuid`, `gpus[]` |

### Documents

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_get_documents` | List documents for a project. | `researchProjectUuid`, `type?` |
| `synapse_get_document` | Get single document content. | `documentUuid` |

### Collaboration

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_add_comment` | Add comment to any entity. | `targetType`, `targetUuid`, `content` |
| `synapse_get_comments` | Get comments for an entity. | `targetType`, `targetUuid` |
| `synapse_get_notifications` | Get agent notifications. | `status?`, `limit?`, `autoMarkRead?` |
| `synapse_mark_notification_read` | Mark notifications as read. | `notificationUuid?`, `all?` |
| `synapse_search_mentionables` | Search @mentionable users and agents. | `query`, `limit?` |

### Sessions

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_create_session` | Create a named agent session. | `name`, `description?` |
| `synapse_list_sessions` | List sessions for current agent. | `status?` |
| `synapse_get_session` | Get session details. | `sessionUuid` |
| `synapse_close_session` | Close session. | `sessionUuid` |
| `synapse_session_heartbeat` | Session heartbeat. | `sessionUuid` |

---

## Legacy Tools

These tools support the older ExperimentDesign → ExperimentRun workflow. They remain available for backward compatibility but new work should use the Experiment tools above.

| Tool | Description |
|---|---|
| `synapse_get_experiment_designs` | List experiment designs for a project. |
| `synapse_get_experiment_design` | Get experiment design with drafts. |
| `synapse_get_experiment_run` | Get experiment run details. |
| `synapse_list_experiment_runs` | List experiment runs for a project. |
| `synapse_get_unblocked_experiment_runs` | Get runs ready to start. |
| `synapse_claim_experiment_run` | Claim an experiment run. |
| `synapse_start_experiment_run_with_gpus` | Claim run, reserve GPUs, start. |

---

## MCP Configuration

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_your_key_here"
      }
    }
  }
}
```

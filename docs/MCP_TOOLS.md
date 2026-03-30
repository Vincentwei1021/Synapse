# Synapse MCP Tools

Endpoint: `POST /api/mcp` (HTTP Streamable transport)

Auth: `Authorization: Bearer syn_...`

Tool availability is determined by the agent's composable permissions (`roles` field).

## Permission Mapping

| Agent Roles | Tool Categories |
|---|---|
| Any agent | Public + Session + Compute + Literature |
| `research` or `pi` | + Research Lead tools |
| `experiment` or `pi` | + Researcher tools |
| `pi` | + PI (admin) tools |

---

## Public Tools (All Agents)

Source: `src/mcp/tools/public.ts`

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_checkin` | Agent check-in. Returns identity, roles, assignments, pending counts. | (none) |
| `synapse_list_research_projects` | List all research projects (paginated). | `page`, `pageSize` |
| `synapse_get_research_project` | Get research project details and context. | `researchProjectUuid` |
| `synapse_get_research_questions` | List research questions for a project. | `researchProjectUuid`, `status?`, `page?` |
| `synapse_get_research_question` | Get single research question details. | `researchQuestionUuid` |
| `synapse_get_documents` | List documents for a project. | `researchProjectUuid`, `type?`, `page?` |
| `synapse_get_document` | Get single document content. | `documentUuid` |
| `synapse_get_experiment_designs` | List experiment designs for a project. | `researchProjectUuid`, `status?` |
| `synapse_get_experiment_design` | Get single experiment design with drafts. | `experimentDesignUuid` |
| `synapse_get_experiment_run` | Get single experiment run details. | `runUuid` |
| `synapse_list_experiment_runs` | List experiment runs for a project. | `researchProjectUuid`, `status?`, `priority?` |
| `synapse_get_unblocked_experiment_runs` | Get runs ready to start (all deps resolved). | `researchProjectUuid` |
| `synapse_get_activity` | Get project activity stream. | `researchProjectUuid` |
| `synapse_get_my_assignments` | Get all items assigned to current agent. | (none) |
| `synapse_get_available_research_questions` | Get claimable research questions (status=open). | `researchProjectUuid` |
| `synapse_get_available_experiment_runs` | Get claimable experiment runs (status=open). | `researchProjectUuid` |
| `synapse_add_comment` | Add comment to any entity. | `targetType`, `targetUuid`, `content` |
| `synapse_get_comments` | Get comments for an entity. | `targetType`, `targetUuid` |
| `synapse_get_notifications` | Get agent notifications. | `status?`, `limit?`, `autoMarkRead?` |
| `synapse_mark_notification_read` | Mark notifications as read. | `notificationUuid?`, `all?` |
| `synapse_answer_hypothesis_formulation` | Answer hypothesis formulation questions. | `researchQuestionUuid`, `roundUuid`, `answers[]` |
| `synapse_get_hypothesis_formulation` | Get hypothesis formulation state. | `researchQuestionUuid` |
| `synapse_get_project_groups` | List project groups. | (none) |
| `synapse_get_project_group` | Get single project group with projects. | `groupUuid` |
| `synapse_get_group_dashboard` | Get group dashboard stats. | `groupUuid` |
| `synapse_search_mentionables` | Search @mentionable users and agents. | `query`, `limit?` |

**Compatibility aliases** (map old names to current entities):

| Alias | Maps to |
|---|---|
| `synapse_get_project` | `synapse_get_research_project` |
| `synapse_list_projects` | `synapse_list_research_projects` |
| `synapse_get_idea` | `synapse_get_research_question` |
| `synapse_get_task` | `synapse_get_experiment_run` |
| `synapse_get_proposal` | `synapse_get_experiment_design` |
| `synapse_get_unblocked_tasks` | `synapse_get_unblocked_experiment_runs` |

---

## Session Tools (All Agents)

Source: `src/mcp/tools/session.ts`

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_create_session` | Create a named agent session. | `name`, `description?`, `expiresAt?` |
| `synapse_list_sessions` | List sessions for current agent. | `status?` |
| `synapse_get_session` | Get session details and active checkins. | `sessionUuid` |
| `synapse_close_session` | Close session (auto-checkout all checkins). | `sessionUuid` |
| `synapse_reopen_session` | Reopen a closed session. | `sessionUuid` |
| `synapse_session_checkin_experiment_run` | Check in session to an experiment run. | `sessionUuid`, `runUuid` |
| `synapse_session_checkout_experiment_run` | Check out session from an experiment run. | `sessionUuid`, `runUuid` |
| `synapse_session_heartbeat` | Session heartbeat (updates lastActiveAt). | `sessionUuid` |

---

## Compute + Experiment Tools (All Agents)

Source: `src/mcp/tools/compute.ts`

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_list_compute_nodes` | List pools, nodes, GPUs, and access details. | `onlyAvailable?`, `researchProjectUuid?` |
| `synapse_get_node_access_bundle` | Get managed SSH access bundle (PEM key). | `experimentUuid`, `nodeUuid` |
| `synapse_get_assigned_experiments` | List experiments assigned to current agent. | `researchProjectUuid?`, `statuses?` |
| `synapse_get_experiment` | Get full experiment details. | `experimentUuid` |
| `synapse_start_experiment` | Move experiment to in_progress, optionally reserve GPUs. | `experimentUuid`, `gpuUuids?`, `workingNotes?` |
| `synapse_submit_experiment_results` | Submit experiment outcomes (supports both Experiment and legacy ExperimentRun). | `experimentUuid?`, `runUuid?`, `outcome?`, `experimentResults?` |
| `synapse_report_experiment_progress` | Report progress update (appears on experiment card). | `experimentUuid`, `message`, `phase?` |
| `synapse_get_project_full_context` | Get full project context for autonomous analysis. | `researchProjectUuid` |
| `synapse_propose_experiment` | Propose a draft experiment (autonomous loop only). | `researchProjectUuid`, `title`, `description`, `priority?` |
| `synapse_sync_node_inventory` | Sync node metadata and GPU inventory. | `nodeUuid`, `gpus[]` |
| `synapse_report_gpu_status` | Report GPU lifecycle or telemetry. | `nodeUuid`, `gpus[]` |
| `synapse_start_experiment_run_with_gpus` | Legacy: claim run, reserve GPUs, move to in_progress. | `runUuid`, `gpuUuids[]` |

---

## Literature Tools (All Agents)

Source: `src/mcp/tools/literature.ts`

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_search_papers` | Search Semantic Scholar for papers. | `query`, `limit?` |
| `synapse_add_related_work` | Add paper to project's related works. | `researchProjectUuid`, `title`, `url`, `authors?`, `arxivId?` |
| `synapse_get_related_works` | List all related works for a project. | `researchProjectUuid` |

---

## Research Lead Tools (research / pi)

Source: `src/mcp/tools/research-lead.ts`

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_claim_research_question` | Claim a research question (open -> elaborating). | `researchQuestionUuid` |
| `synapse_release_research_question` | Release a claimed research question. | `researchQuestionUuid` |
| `synapse_update_research_question_status` | Update research question status. | `researchQuestionUuid`, `status` |
| `synapse_research_lead_create_experiment_design` | Create experiment design container. | `researchProjectUuid`, `title`, `inputType`, `inputUuids` |
| `synapse_research_lead_validate_experiment_design` | Validate experiment design before submission. | `experimentDesignUuid` |
| `synapse_research_lead_submit_experiment_design` | Submit experiment design for approval. | `experimentDesignUuid` |
| `synapse_research_lead_create_document` | Create a document. | `researchProjectUuid`, `type`, `title`, `content?` |
| `synapse_research_lead_update_document` | Update document content. | `documentUuid`, `title?`, `content?` |
| `synapse_research_lead_create_experiment_runs` | Batch create experiment runs. | `researchProjectUuid`, `experimentRuns[]` |
| `synapse_research_lead_add_document_draft` | Add document draft to experiment design. | `experimentDesignUuid`, `type`, `title`, `content` |
| `synapse_research_lead_add_experiment_run_draft` | Add run draft to experiment design. | `experimentDesignUuid`, `title`, `description?` |
| `synapse_research_lead_update_document_draft` | Update document draft. | `experimentDesignUuid`, `draftUuid` |
| `synapse_research_lead_update_experiment_run_draft` | Update run draft. | `experimentDesignUuid`, `draftUuid` |
| `synapse_research_lead_remove_document_draft` | Remove document draft. | `experimentDesignUuid`, `draftUuid` |
| `synapse_research_lead_remove_experiment_run_draft` | Remove run draft. | `experimentDesignUuid`, `draftUuid` |
| `synapse_add_experiment_run_dependency` | Add run dependency (with cycle detection). | `runUuid`, `dependsOnRunUuid` |
| `synapse_remove_experiment_run_dependency` | Remove run dependency. | `runUuid`, `dependsOnRunUuid` |
| `synapse_research_lead_assign_experiment_run` | Assign run to a researcher agent. | `runUuid`, `agentUuid` |
| `synapse_research_lead_start_hypothesis_formulation` | Start hypothesis formulation round. | `researchQuestionUuid`, `depth`, `questions[]` |
| `synapse_research_lead_validate_hypothesis_formulation` | Validate hypothesis formulation answers. | `researchQuestionUuid`, `roundUuid`, `issues[]` |
| `synapse_research_lead_skip_hypothesis_formulation` | Skip hypothesis formulation (with reason). | `researchQuestionUuid`, `reason` |
| `synapse_move_research_question` | Move research question to another project. | `researchQuestionUuid`, `targetResearchProjectUuid` |
| `synapse_research_lead_create_research_question` | Create a research question. | `researchProjectUuid`, `title`, `content?` |
| `synapse_research_lead_generate_project_ideas` | Generate research ideas from project brief. | `researchProjectUuid`, `ideas[]` |
| `synapse_create_baseline` | Register a baseline result. | `researchProjectUuid`, `name`, `metrics` |
| `synapse_list_baselines` | List baselines for a project. | `researchProjectUuid` |
| `synapse_compare_results` | Compare results against active baseline. | `researchProjectUuid`, `experimentResults` |
| `synapse_create_rdr` | Create a Research Decision Record. | `researchProjectUuid`, `title`, `content` |

---

## Researcher Tools (experiment / pi)

Source: `src/mcp/tools/researcher.ts`

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_claim_experiment_run` | Claim an experiment run (open -> assigned). | `runUuid` |
| `synapse_release_experiment_run` | Release a claimed experiment run. | `runUuid` |
| `synapse_update_experiment_run` | Update experiment run status. | `runUuid`, `status`, `sessionUuid?` |
| `synapse_submit_for_verify` | Submit run for human verification. | `runUuid`, `summary?` |
| `synapse_report_work` | Report work progress or completion. | `runUuid`, `report`, `status?`, `sessionUuid?` |
| `synapse_report_criteria_self_check` | Report self-check on acceptance criteria. | `runUuid`, `criteria[]` |
| `synapse_register_experiment` | Register experiment config for reproducibility. | `researchProjectUuid`, `runUuid`, `config`, `environment` |
| `synapse_report_metrics` | Report metrics and auto-evaluate criteria. | `runUuid`, `metrics` |
| `synapse_check_criteria` | Check Go/No-Go criteria status. | `runUuid` |
| `synapse_request_early_stop` | Request early termination of experiment. | `runUuid`, `reason`, `metrics?` |

---

## PI Tools (pi only)

Source: `src/mcp/tools/pi.ts`

PI agents have all Research Lead and Researcher tools, plus:

| Tool | Description | Key Parameters |
|---|---|---|
| `synapse_pi_create_research_project` | Create a new research project. | `name`, `description?`, `groupUuid?` |
| `synapse_pi_review_research_question` | Accept or reject a research idea. | `researchQuestionUuid`, `decision`, `reviewNote?` |
| `synapse_pi_approve_experiment_design` | Approve experiment design (materializes drafts). | `experimentDesignUuid`, `reviewNote?` |
| `synapse_pi_reject_experiment_design` | Reject experiment design (returns to draft). | `experimentDesignUuid`, `reviewNote` |
| `synapse_pi_close_experiment_design` | Close experiment design (terminal). | `experimentDesignUuid`, `reviewNote` |
| `synapse_pi_verify_experiment_run` | Verify run (to_verify -> done). | `runUuid` |
| `synapse_pi_reopen_experiment_run` | Reopen run (to_verify -> in_progress). | `runUuid`, `force?` |
| `synapse_pi_close_experiment_run` | Close run (any -> closed). | `runUuid` |
| `synapse_pi_close_research_question` | Close research question. | `researchQuestionUuid` |
| `synapse_pi_delete_research_question` | Delete a research question. | `researchQuestionUuid` |
| `synapse_pi_delete_experiment_run` | Delete an experiment run. | `runUuid` |
| `synapse_pi_delete_document` | Delete a document. | `documentUuid` |
| `synapse_mark_acceptance_criteria` | Mark acceptance criteria (batch). | `runUuid`, `criteria[]` |
| `synapse_pi_create_project_group` | Create project group. | `name`, `description?` |
| `synapse_pi_update_project_group` | Update project group. | `groupUuid`, `name?`, `description?` |
| `synapse_pi_delete_project_group` | Delete project group. | `groupUuid` |
| `synapse_pi_move_research_project_to_group` | Move project to group (null to ungroup). | `researchProjectUuid`, `groupUuid` |
| `synapse_verify_reproducibility` | Mark experiment as reproducibility-verified. | `registryUuid` |
| `synapse_set_active_baseline` | Set active baseline for a project. | `baselineUuid` |

---

## MCP Configuration Example

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

Optional project filtering:

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

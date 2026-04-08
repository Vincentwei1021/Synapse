import { createPassthroughTool, defineOpenClawTools } from "./tool-registry.js";

/**
 * All Synapse MCP tools available to agents.
 *
 * In the current Synapse architecture, all tools are available to all agents.
 * The Synapse MCP server handles role-based access internally.
 * These definitions tell OpenClaw what tools exist and how to call them.
 */
export const commonToolDefinitions = defineOpenClawTools([
  // =========================================================================
  // Agent Identity & Assignments
  // =========================================================================
  createPassthroughTool({
    name: "synapse_checkin",
    description: "Agent check-in. Returns persona, roles, owner info, and pending assignments. Recommended at session start.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    targetToolName: "synapse_checkin",
    mapArgs: () => ({}),
  }),
  // =========================================================================
  // Research Projects
  // =========================================================================
  createPassthroughTool<{ page?: number; pageSize?: number }>({
    name: "synapse_list_research_projects",
    description: "List all research projects for the current company.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_list_research_projects",
  }),
  createPassthroughTool<{ researchProjectUuid: string }>({
    name: "synapse_get_research_project",
    description: "Get research project details including goal, datasets, evaluation methods, and synthesis summary.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_research_project",
  }),
  createPassthroughTool<{ researchProjectUuid: string }>({
    name: "synapse_get_project_full_context",
    description: "Get full research context for a project: brief, datasets, evaluation methods, all research questions, all experiments with outcomes, and related works count.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_project_full_context",
  }),
  createPassthroughTool<{ researchProjectUuid: string; page?: number; pageSize?: number }>({
    name: "synapse_get_activity",
    description: "Get the activity stream for a research project.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 50)" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_activity",
  }),

  // =========================================================================
  // Research Questions
  // =========================================================================
  createPassthroughTool<{ researchProjectUuid: string; status?: string; page?: number; pageSize?: number }>({
    name: "synapse_get_research_questions",
    description: "List research questions for a project. Can filter by status.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        status: { type: "string", description: "Filter by status: open | elaborating | proposal_created | completed | closed" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_research_questions",
  }),
  createPassthroughTool<{ researchQuestionUuid: string }>({
    name: "synapse_get_research_question",
    description: "Get detailed information for a single research question.",
    parameters: {
      type: "object",
      properties: {
        researchQuestionUuid: { type: "string", description: "Research Question UUID" },
      },
      required: ["researchQuestionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_research_question",
  }),
  createPassthroughTool<{ researchProjectUuid: string }>({
    name: "synapse_get_available_research_questions",
    description: "Get research questions available to claim in a project (status=open).",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_available_research_questions",
  }),
  createPassthroughTool<{ researchQuestionUuid: string }>({
    name: "synapse_claim_research_question",
    description: "Claim an open research question for elaboration (open -> elaborating).",
    parameters: {
      type: "object",
      properties: {
        researchQuestionUuid: { type: "string", description: "Research Question UUID" },
      },
      required: ["researchQuestionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_claim_research_question",
  }),
  createPassthroughTool<{ researchQuestionUuid: string }>({
    name: "synapse_release_research_question",
    description: "Release a claimed research question (assigned -> open).",
    parameters: {
      type: "object",
      properties: {
        researchQuestionUuid: { type: "string", description: "Research Question UUID" },
      },
      required: ["researchQuestionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_release_research_question",
  }),
  createPassthroughTool<{ researchQuestionUuid: string; status: string }>({
    name: "synapse_update_research_question_status",
    description: "Update research question status (only assignee can operate).",
    parameters: {
      type: "object",
      properties: {
        researchQuestionUuid: { type: "string", description: "Research Question UUID" },
        status: { type: "string", description: "New status: elaborating | proposal_created | completed | in_progress | pending_review" },
      },
      required: ["researchQuestionUuid", "status"],
      additionalProperties: false,
    },
    targetToolName: "synapse_update_research_question_status",
  }),

  // =========================================================================
  // Experiments (primary workflow)
  // =========================================================================
  createPassthroughTool<{ experimentUuid: string }>({
    name: "synapse_get_experiment",
    description: "Get detailed information for an experiment.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
      },
      required: ["experimentUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_experiment",
  }),
  createPassthroughTool<{ researchProjectUuid?: string; statuses?: string[] }>({
    name: "synapse_get_assigned_experiments",
    description: "List experiments assigned to this agent, sorted by execution priority and FIFO within the same priority.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Optional research project UUID" },
        statuses: { type: "array", items: { type: "string" }, description: "Optional experiment statuses to include" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_get_assigned_experiments",
  }),
  createPassthroughTool<{ experimentUuid: string; gpuUuids?: string[]; workingNotes?: string }>({
    name: "synapse_start_experiment",
    description: "Start an assigned experiment and optionally reserve GPUs.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
        gpuUuids: { type: "array", items: { type: "string" }, description: "Optional GPU UUIDs to reserve" },
        workingNotes: { type: "string", description: "Optional notes or execution plan to append to the experiment description" },
      },
      required: ["experimentUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_start_experiment",
    mapArgs: ({ experimentUuid, gpuUuids, workingNotes }) => ({
      experimentUuid,
      gpuUuids: gpuUuids ?? [],
      workingNotes,
    }),
  }),
  createPassthroughTool<{ experimentUuid: string; outcome?: string; experimentResults?: unknown; experimentBranch?: string; commitSha?: string }>({
    name: "synapse_submit_experiment_results",
    description: "Submit experiment outcome and structured results, releasing any reserved GPU resources.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
        outcome: { type: "string", description: "Human-readable summary of the outcome" },
        experimentResults: { type: "object", description: "Structured results payload" },
        experimentBranch: { type: "string", description: "Git branch name where experiment code was pushed" },
        commitSha: { type: "string", description: "Git commit SHA of the final experiment code" },
      },
      required: ["experimentUuid"],
      additionalProperties: true,
    },
    targetToolName: "synapse_submit_experiment_results",
  }),
  createPassthroughTool<{ experimentUuid: string; message: string; phase?: string }>({
    name: "synapse_report_experiment_progress",
    description: "Report a progress update for an in-progress experiment. The message appears on the experiment card in real-time.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
        message: { type: "string", description: "Short status message, e.g. 'Training epoch 3/10, loss=0.42'" },
        phase: { type: "string", description: "Optional phase label, e.g. 'data_download', 'training', 'evaluation'" },
      },
      required: ["experimentUuid", "message"],
      additionalProperties: false,
    },
    targetToolName: "synapse_report_experiment_progress",
  }),
  createPassthroughTool<{
    researchProjectUuid: string;
    title: string;
    description: string;
    researchQuestionUuid?: string;
    priority?: string;
  }>({
    name: "synapse_propose_experiment",
    description: "Propose a new experiment for human review (created in pending_review status). Only usable when autonomous loop is active.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        title: { type: "string", description: "Experiment title" },
        description: { type: "string", description: "Experiment description" },
        researchQuestionUuid: { type: "string", description: "Optional linked research question UUID" },
        priority: { type: "string", description: "Priority: low | medium | high | immediate (default: medium)" },
      },
      required: ["researchProjectUuid", "title", "description"],
      additionalProperties: false,
    },
    targetToolName: "synapse_propose_experiment",
  }),

  // =========================================================================
  // Compute
  // =========================================================================
  createPassthroughTool<{ onlyAvailable?: boolean; researchProjectUuid?: string }>({
    name: "synapse_list_compute_nodes",
    description: "List compute pools, machines, and per-GPU availability and telemetry.",
    parameters: {
      type: "object",
      properties: {
        onlyAvailable: { type: "boolean", description: "If true, only show currently available GPUs" },
        researchProjectUuid: { type: "string", description: "Optional research project UUID to filter by assigned pool" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_list_compute_nodes",
    mapArgs: ({ onlyAvailable, researchProjectUuid }) => ({
      onlyAvailable: onlyAvailable ?? false,
      researchProjectUuid,
    }),
  }),
  createPassthroughTool<{ experimentUuid: string; nodeUuid: string }>({
    name: "synapse_get_node_access_bundle",
    description: "Fetch a managed SSH access bundle for a compute node. Use this when managedKeyAvailable=true instead of assuming local key paths.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
        nodeUuid: { type: "string", description: "Compute node UUID" },
      },
      required: ["experimentUuid", "nodeUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_node_access_bundle",
  }),
  createPassthroughTool<{ nodeUuid: string; ec2InstanceId?: string; instanceType?: string; region?: string; gpus: Array<Record<string, unknown>> }>({
    name: "synapse_sync_node_inventory",
    description: "Sync a machine's instance metadata and GPU inventory back into Synapse after logging in.",
    parameters: {
      type: "object",
      properties: {
        nodeUuid: { type: "string", description: "Compute node UUID" },
        ec2InstanceId: { type: "string", description: "EC2 instance ID" },
        instanceType: { type: "string", description: "Instance type" },
        region: { type: "string", description: "AWS region" },
        gpus: { type: "array", items: { type: "object" }, description: "GPU inventory: [{ slotIndex, model, memoryGb? }]" },
      },
      required: ["nodeUuid", "gpus"],
      additionalProperties: false,
    },
    targetToolName: "synapse_sync_node_inventory",
  }),
  createPassthroughTool<{ experimentUuid: string; gpuUuids: string[] }>({
    name: "synapse_reserve_gpus",
    description: "Reserve GPUs for an experiment. Reserved GPUs show as busy. Automatically released on experiment completion.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
        gpuUuids: { type: "array", items: { type: "string" }, description: "GPU UUIDs to reserve" },
      },
      required: ["experimentUuid", "gpuUuids"],
      additionalProperties: false,
    },
    targetToolName: "synapse_reserve_gpus",
  }),
  createPassthroughTool<{ nodeUuid: string; gpus: Array<Record<string, unknown>> }>({
    name: "synapse_report_gpu_status",
    description: "Report latest GPU lifecycle or telemetry after running a workload.",
    parameters: {
      type: "object",
      properties: {
        nodeUuid: { type: "string", description: "Compute node UUID" },
        gpus: { type: "array", items: { type: "object" }, description: "GPU statuses: [{ gpuUuid, lifecycle?, utilizationPercent?, memoryUsedGb?, temperatureC?, notes? }]" },
      },
      required: ["nodeUuid", "gpus"],
      additionalProperties: false,
    },
    targetToolName: "synapse_report_gpu_status",
  }),
  createPassthroughTool<{ researchProjectUuid: string; experimentUuid?: string }>({
    name: "synapse_get_repo_access",
    description: "Get GitHub repository credentials for a research project.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        experimentUuid: { type: "string", description: "Experiment UUID (optional, to get baseBranch)" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_repo_access",
  }),

  // =========================================================================
  // Documents
  // =========================================================================
  createPassthroughTool<{ researchProjectUuid: string; type?: string; page?: number; pageSize?: number }>({
    name: "synapse_get_documents",
    description: "List documents for a project. Can filter by type.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        type: { type: "string", description: "Filter by document type" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_documents",
  }),
  createPassthroughTool<{ documentUuid: string }>({
    name: "synapse_get_document",
    description: "Get the detailed content of a single document.",
    parameters: {
      type: "object",
      properties: {
        documentUuid: { type: "string", description: "Document UUID" },
      },
      required: ["documentUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_document",
  }),

  // =========================================================================
  // Comments
  // =========================================================================
  createPassthroughTool<{ targetType: string; targetUuid: string; content: string }>({
    name: "synapse_add_comment",
    description: "Add a comment to a research question, experiment, experiment design, experiment run, or document.",
    parameters: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "Target type: research_question | experiment | experiment_design | experiment_run | document" },
        targetUuid: { type: "string", description: "Target UUID" },
        content: { type: "string", description: "Comment content" },
      },
      required: ["targetType", "targetUuid", "content"],
      additionalProperties: false,
    },
    targetToolName: "synapse_add_comment",
  }),
  createPassthroughTool<{ targetType: string; targetUuid: string; page?: number; pageSize?: number }>({
    name: "synapse_get_comments",
    description: "Get comments for an entity. Useful for understanding context, decisions, and feedback.",
    parameters: {
      type: "object",
      properties: {
        targetType: { type: "string", description: "Target type: research_question | experiment | experiment_design | experiment_run | document" },
        targetUuid: { type: "string", description: "Target UUID" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["targetType", "targetUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_comments",
  }),

  // =========================================================================
  // Notifications
  // =========================================================================
  createPassthroughTool<{ status?: string; autoMarkRead?: boolean }>({
    name: "synapse_get_notifications",
    description: "Get notifications. By default fetches unread and auto-marks them as read.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter: unread | read | all (default: unread)" },
        autoMarkRead: { type: "boolean", description: "Auto-mark fetched unread as read (default: true)" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_get_notifications",
    mapArgs: ({ status, autoMarkRead }) => {
      const args: Record<string, unknown> = {};
      if (status) args.status = status;
      if (autoMarkRead !== undefined) args.autoMarkRead = autoMarkRead;
      return args;
    },
  }),
  createPassthroughTool<{ notificationUuid?: string; all?: boolean }>({
    name: "synapse_mark_notification_read",
    description: "Mark notification(s) as read (single or all).",
    parameters: {
      type: "object",
      properties: {
        notificationUuid: { type: "string", description: "Single notification UUID" },
        all: { type: "boolean", description: "Whether to mark all as read" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_mark_notification_read",
  }),

  // =========================================================================
  // Mentions
  // =========================================================================
  createPassthroughTool<{ query: string; limit?: number }>({
    name: "synapse_search_mentionables",
    description: "Search for users and agents that can be @mentioned. Returns name, type, and UUID.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or keyword to search" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    targetToolName: "synapse_search_mentionables",
  }),

  // =========================================================================
  // Project Groups
  // =========================================================================
  createPassthroughTool({
    name: "synapse_get_project_groups",
    description: "List all project groups with project counts and completion rates.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    targetToolName: "synapse_get_project_groups",
    mapArgs: () => ({}),
  }),
  createPassthroughTool<{ groupUuid: string }>({
    name: "synapse_get_project_group",
    description: "Get a single project group with its projects and stats.",
    parameters: {
      type: "object",
      properties: {
        groupUuid: { type: "string", description: "Project group UUID" },
      },
      required: ["groupUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_project_group",
  }),
  createPassthroughTool<{ groupUuid: string }>({
    name: "synapse_get_group_dashboard",
    description: "Get aggregated dashboard stats for a project group.",
    parameters: {
      type: "object",
      properties: {
        groupUuid: { type: "string", description: "Project group UUID" },
      },
      required: ["groupUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_group_dashboard",
  }),

  // =========================================================================
  // Literature / Related Works
  // =========================================================================
  createPassthroughTool<{ query: string; limit?: number }>({
    name: "synapse_search_papers",
    description: "Search for academic papers using Semantic Scholar.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default: 10, max: 20)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    targetToolName: "synapse_search_papers",
  }),
  createPassthroughTool<{ researchProjectUuid: string; title: string; url: string; authors?: string; abstract?: string; arxivId?: string; source?: string }>({
    name: "synapse_add_related_work",
    description: "Add a paper to a research project's related works collection.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        title: { type: "string", description: "Paper title" },
        url: { type: "string", description: "Paper URL" },
        authors: { type: "string", description: "Authors" },
        abstract: { type: "string", description: "Abstract" },
        arxivId: { type: "string", description: "ArXiv ID" },
        year: { type: "number", description: "Publication year" },
        source: { type: "string", description: "Source: arxiv | semantic_scholar | openalex" },
      },
      required: ["researchProjectUuid", "title", "url"],
      additionalProperties: false,
    },
    targetToolName: "synapse_add_related_work",
  }),
  createPassthroughTool<{ researchProjectUuid: string }>({
    name: "synapse_get_related_works",
    description: "Get all related works (papers) collected for a research project.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_related_works",
  }),

  // =========================================================================
  // Deep Research Reports
  // =========================================================================
  createPassthroughTool<{ researchProjectUuid: string }>({
    name: "synapse_get_deep_research_report",
    description: "Get the deep research literature review document for a project. Returns null if none exists yet.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
      },
      required: ["researchProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_deep_research_report",
  }),
  createPassthroughTool<{ researchProjectUuid: string; title: string; content: string }>({
    name: "synapse_save_deep_research_report",
    description: "Create or update the deep research literature review for a project. If a report already exists, updates it and increments the version (v1 → v2 → v3...). If none exists, creates a new one.",
    parameters: {
      type: "object",
      properties: {
        researchProjectUuid: { type: "string", description: "Research Project UUID" },
        title: { type: "string", description: "Report title" },
        content: { type: "string", description: "Full report content (Markdown)" },
      },
      required: ["researchProjectUuid", "title", "content"],
      additionalProperties: false,
    },
    targetToolName: "synapse_save_deep_research_report",
  }),

  // =========================================================================
  // Sessions
  // =========================================================================
  createPassthroughTool<{ status?: string }>({
    name: "synapse_list_sessions",
    description: "List all sessions for the current agent.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: active | inactive | closed" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_list_sessions",
  }),
  createPassthroughTool<{ sessionUuid: string }>({
    name: "synapse_get_session",
    description: "Get session details and active checkins.",
    parameters: {
      type: "object",
      properties: {
        sessionUuid: { type: "string", description: "Session UUID" },
      },
      required: ["sessionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_session",
  }),
  createPassthroughTool<{ name: string; description?: string; expiresAt?: string }>({
    name: "synapse_create_session",
    description: "Create a new agent session.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Session name" },
        description: { type: "string", description: "Session description" },
        expiresAt: { type: "string", description: "Expiration time (ISO 8601)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    targetToolName: "synapse_create_session",
  }),
  createPassthroughTool<{ sessionUuid: string }>({
    name: "synapse_close_session",
    description: "Close a session (batch checkout all checkins).",
    parameters: {
      type: "object",
      properties: {
        sessionUuid: { type: "string", description: "Session UUID" },
      },
      required: ["sessionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_close_session",
  }),
  createPassthroughTool<{ sessionUuid: string }>({
    name: "synapse_reopen_session",
    description: "Reopen a closed session (closed -> active).",
    parameters: {
      type: "object",
      properties: {
        sessionUuid: { type: "string", description: "Session UUID" },
      },
      required: ["sessionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_reopen_session",
  }),
  createPassthroughTool<{ sessionUuid: string }>({
    name: "synapse_session_heartbeat",
    description: "Session heartbeat (updates lastActiveAt).",
    parameters: {
      type: "object",
      properties: {
        sessionUuid: { type: "string", description: "Session UUID" },
      },
      required: ["sessionUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_session_heartbeat",
  }),
]);

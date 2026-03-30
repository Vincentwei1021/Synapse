import { createPassthroughTool, defineOpenClawTools } from "./tool-registry.js";

export const commonToolDefinitions = defineOpenClawTools([
  createPassthroughTool({
    name: "synapse_checkin",
    description: "Agent check-in. Returns persona, roles, and pending assignments. Recommended at session start.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    targetToolName: "synapse_checkin",
    mapArgs: () => ({}),
  }),
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
  createPassthroughTool<{ projectUuid: string }>({
    name: "synapse_get_project",
    description: "Get project details and context",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_research_project",
    mapArgs: ({ projectUuid }) => ({ researchProjectUuid: projectUuid }),
  }),
  createPassthroughTool<{ taskUuid: string }>({
    name: "synapse_get_task",
    description: "Legacy alias: get detailed information and context for a single experiment run.",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
      },
      required: ["taskUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_experiment_run",
    mapArgs: ({ taskUuid }) => ({ runUuid: taskUuid }),
  }),
  createPassthroughTool<{ ideaUuid: string }>({
    name: "synapse_get_idea",
    description: "Legacy alias: get detailed information for a single research question.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID (legacy parameter name)" },
      },
      required: ["ideaUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_research_question",
    mapArgs: ({ ideaUuid }) => ({ researchQuestionUuid: ideaUuid }),
  }),
  createPassthroughTool<{ projectUuid: string; proposalUuids?: string[] }>({
    name: "synapse_get_available_tasks",
    description: "Legacy alias: get experiment runs available to claim in a project (status=open). Optionally filter by experiment-design UUIDs.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        proposalUuids: { type: "array", items: { type: "string" }, description: "Experiment Design UUIDs to filter by (legacy parameter name)" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_available_experiment_runs",
    mapArgs: ({ projectUuid, proposalUuids }) => ({
      researchProjectUuid: projectUuid,
      experimentDesignUuids: proposalUuids,
    }),
  }),
  createPassthroughTool<{ projectUuid: string }>({
    name: "synapse_get_available_ideas",
    description: "Legacy alias: get research questions available to claim in a project (status=open).",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_available_research_questions",
    mapArgs: ({ projectUuid }) => ({ researchProjectUuid: projectUuid }),
  }),
  createPassthroughTool<{ page?: number; pageSize?: number }>({
    name: "synapse_list_projects",
    description: "List all projects for the current company. Returns projects with counts of research questions, documents, experiment runs, and experiment designs.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_list_research_projects",
    mapArgs: ({ page, pageSize }) => {
      const args: Record<string, unknown> = {};
      if (page !== undefined) args.page = page;
      if (pageSize !== undefined) args.pageSize = pageSize;
      return args;
    },
  }),
  createPassthroughTool<{
    projectUuid: string;
    status?: string;
    priority?: string;
    proposalUuids?: string[];
    page?: number;
    pageSize?: number;
  }>({
    name: "synapse_list_tasks",
    description: "Legacy alias: list experiment runs for a project. Can filter by status, priority, and experiment-design UUIDs.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        status: { type: "string", description: "Filter by status: open | assigned | in_progress | to_verify | done | closed" },
        priority: { type: "string", description: "Filter by priority: low | medium | high" },
        proposalUuids: { type: "array", items: { type: "string" }, description: "Experiment Design UUIDs to filter by (legacy parameter name)" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_list_experiment_runs",
    mapArgs: ({ projectUuid, status, priority, proposalUuids, page, pageSize }) => ({
      researchProjectUuid: projectUuid,
      status,
      priority,
      experimentDesignUuids: proposalUuids,
      page,
      pageSize,
    }),
  }),
  createPassthroughTool<{ projectUuid: string; status?: string; page?: number; pageSize?: number }>({
    name: "synapse_get_ideas",
    description: "Legacy alias: list research questions for a project. Can filter by status.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        status: { type: "string", description: "Filter by status: open | elaborating | proposal_created | completed | closed" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_research_questions",
    mapArgs: ({ projectUuid, status, page, pageSize }) => ({
      researchProjectUuid: projectUuid,
      status,
      page,
      pageSize,
    }),
  }),
  createPassthroughTool<{ projectUuid: string; status?: string; page?: number; pageSize?: number }>({
    name: "synapse_get_proposals",
    description: "Legacy alias: list experiment designs for a project. Can filter by status.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        status: { type: "string", description: "Filter by status: draft | pending | approved | rejected" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_experiment_designs",
    mapArgs: ({ projectUuid, status, page, pageSize }) => ({
      researchProjectUuid: projectUuid,
      status,
      page,
      pageSize,
    }),
  }),
  createPassthroughTool<{ projectUuid: string; type?: string; page?: number; pageSize?: number }>({
    name: "synapse_get_documents",
    description: "List documents for a project. Can filter by type.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        type: { type: "string", description: "Filter by type: prd | tech_design | adr | spec | guide" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 20)" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_documents",
    mapArgs: ({ projectUuid, type, page, pageSize }) => ({
      researchProjectUuid: projectUuid,
      type,
      page,
      pageSize,
    }),
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
  createPassthroughTool<{ projectUuid: string; proposalUuids?: string[] }>({
    name: "synapse_get_unblocked_tasks",
    description: "Legacy alias: get experiment runs that are ready to start — status is open/assigned and all dependencies are resolved (done/closed). Optionally filter by experiment-design UUIDs. Note: to_verify is NOT considered resolved.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        proposalUuids: { type: "array", items: { type: "string" }, description: "Filter experiment runs by experiment-design UUIDs" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_unblocked_experiment_runs",
    mapArgs: ({ projectUuid, proposalUuids }) => ({
      researchProjectUuid: projectUuid,
      experimentDesignUuids: proposalUuids,
    }),
  }),
  createPassthroughTool<{ projectUuid: string; page?: number; pageSize?: number }>({
    name: "synapse_get_activity",
    description: "Get the activity stream for a project. Shows all actions taken by agents and users.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page (default: 50)" },
      },
      required: ["projectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_activity",
    mapArgs: ({ projectUuid, page, pageSize }) => ({
      researchProjectUuid: projectUuid,
      page,
      pageSize,
    }),
  }),
  createPassthroughTool<{ targetType: string; targetUuid: string; page?: number; pageSize?: number }>({
    name: "synapse_get_comments",
    description: "Get comments for a Research Question, Experiment, Experiment Design, Experiment Run, or Document. Useful for understanding context, decisions, and feedback.",
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
  createPassthroughTool<{ ideaUuid: string }>({
    name: "synapse_get_elaboration",
    description: "Legacy alias: get the full elaboration state for a research question, including all rounds, questions, answers, and progress summary.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID (legacy parameter name)" },
      },
      required: ["ideaUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_hypothesis_formulation",
    mapArgs: ({ ideaUuid }) => ({ researchQuestionUuid: ideaUuid }),
  }),
  createPassthroughTool({
    name: "synapse_get_my_assignments",
    description: "Get all research questions and experiment runs currently assigned to you.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    targetToolName: "synapse_get_my_assignments",
    mapArgs: () => ({}),
  }),
  createPassthroughTool({
    name: "synapse_get_project_groups",
    description: "List all project groups. Returns groups with project counts and completion rates.",
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
  createPassthroughTool<{ targetType: string; targetUuid: string; content: string }>({
    name: "synapse_add_comment",
    description: "Add a comment to a Research Question, Experiment, Experiment Design, Experiment Run, or Document",
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
  createPassthroughTool<{ query: string; limit?: number }>({
    name: "synapse_search_mentionables",
    description: "Search for users and agents that can be @mentioned. Returns name, type, and UUID. Use the UUID to write mentions as @[Name](type:uuid) in comment text.",
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
  createPassthroughTool<{ researchQuestionUuid: string }>({
    name: "synapse_get_research_question",
    description: "Get detailed information for a research question.",
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
  createPassthroughTool<{ experimentUuid: string; outcome?: string; experimentResults?: unknown }>({
    name: "synapse_submit_experiment_results",
    description: "Submit experiment outcome and structured results, releasing any reserved GPU resources.",
    parameters: {
      type: "object",
      properties: {
        experimentUuid: { type: "string", description: "Experiment UUID" },
        outcome: { type: "string", description: "Human-readable summary of the outcome" },
        experimentResults: { type: "object", description: "Structured results payload" },
      },
      required: ["experimentUuid"],
      additionalProperties: true,
    },
    targetToolName: "synapse_submit_experiment_results",
  }),
  createPassthroughTool<{ onlyAvailable?: boolean }>({
    name: "synapse_list_compute_nodes",
    description: "List compute pools, machines, and per-GPU availability and telemetry.",
    parameters: {
      type: "object",
      properties: {
        onlyAvailable: { type: "boolean", description: "If true, only show currently available GPUs" },
      },
      additionalProperties: false,
    },
    targetToolName: "synapse_list_compute_nodes",
    mapArgs: ({ onlyAvailable }) => ({ onlyAvailable: onlyAvailable ?? false }),
  }),
  createPassthroughTool<{ experimentUuid: string; nodeUuid: string }>({
    name: "synapse_get_node_access_bundle",
    description: "Fetch a managed SSH access bundle for a selected compute node. Use this when Synapse reports a managed key instead of a local key path.",
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
]);

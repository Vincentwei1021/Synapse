import { createPassthroughTool, defineOpenClawTools } from "./tool-registry.js";

export const pmToolDefinitions = defineOpenClawTools([
  createPassthroughTool<{ ideaUuid: string }>({
    name: "synapse_claim_idea",
    description: "Legacy alias: claim an open Research Question for elaboration (open -> elaborating). After claiming, start elaboration or create an experiment design directly.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID to claim (legacy parameter name)" },
      },
      required: ["ideaUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_claim_research_question",
    mapArgs: ({ ideaUuid }) => ({ researchQuestionUuid: ideaUuid }),
  }),
  createPassthroughTool<{ ideaUuid: string; depth: string; questions: Array<Record<string, unknown>> }>({
    name: "synapse_start_elaboration",
    description: "Start an elaboration round for a Research Question. Creates structured questions for the stakeholder to answer before experiment-design creation.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID (legacy parameter name)" },
        depth: { type: "string", description: 'Elaboration depth: "minimal", "standard", or "comprehensive"' },
        questions: {
          type: "array",
          description: "Array of questions. Each: { id, text, category, options: [{ id, label, description? }] }",
          items: { type: "object" },
        },
      },
      required: ["ideaUuid", "depth", "questions"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_start_hypothesis_formulation",
    mapArgs: ({ ideaUuid, depth, questions }) => ({
      researchQuestionUuid: ideaUuid,
      depth,
      questions,
    }),
  }),
  createPassthroughTool<{ ideaUuid: string; roundUuid: string; answers: Array<Record<string, unknown>> }>({
    name: "synapse_answer_elaboration",
    description: "Answer elaboration questions for a Research Question. Submits answers for a specific elaboration round.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID (legacy parameter name)" },
        roundUuid: { type: "string", description: "UUID of the elaboration round" },
        answers: {
          type: "array",
          description: "Array of answers. Each: { questionId, selectedOptionId, customText }",
          items: { type: "object" },
        },
      },
      required: ["ideaUuid", "roundUuid", "answers"],
      additionalProperties: false,
    },
    targetToolName: "synapse_answer_hypothesis_formulation",
    mapArgs: ({ ideaUuid, roundUuid, answers }) => ({
      researchQuestionUuid: ideaUuid,
      roundUuid,
      answers,
    }),
  }),
  createPassthroughTool<{ ideaUuid: string; roundUuid: string; issues: Array<Record<string, unknown>> }>({
    name: "synapse_validate_elaboration",
    description: "Validate answers from an elaboration round. Empty issues array = all valid, marks elaboration as resolved.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID (legacy parameter name)" },
        roundUuid: { type: "string", description: "UUID of the elaboration round" },
        issues: {
          type: "array",
          description: 'Array of issues. Each: { questionId, type: "contradiction"|"ambiguity"|"incomplete", description }. Empty = valid.',
          items: { type: "object" },
        },
      },
      required: ["ideaUuid", "roundUuid", "issues"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_validate_hypothesis_formulation",
    mapArgs: ({ ideaUuid, roundUuid, issues }) => ({
      researchQuestionUuid: ideaUuid,
      roundUuid,
      issues,
    }),
  }),
  createPassthroughTool<{
    projectUuid: string;
    title: string;
    inputType: string;
    inputUuids: string[];
    description?: string;
  }>({
    name: "synapse_create_proposal",
    description: "Legacy alias: create an empty Experiment Design container. Use synapse_add_document_draft and synapse_add_task_draft to populate it afterwards.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        title: { type: "string", description: "Experiment Design title" },
        inputType: { type: "string", description: 'Input source type: "research_question" (legacy "idea" also accepted) or "document"' },
        inputUuids: { type: "array", description: "Array of input UUIDs", items: { type: "string" } },
        description: { type: "string", description: "Experiment Design description" },
      },
      required: ["projectUuid", "title", "inputType", "inputUuids"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_create_experiment_design",
    mapArgs: ({ projectUuid, title, inputType, inputUuids, description }) => {
      const args: Record<string, unknown> = {
        researchProjectUuid: projectUuid,
        title,
        inputType: inputType === "idea" ? "research_question" : inputType,
        inputUuids,
      };
      if (description !== undefined) args.description = description;
      return args;
    },
  }),
  createPassthroughTool<{ proposalUuid: string; type: string; title: string; content: string }>({
    name: "synapse_add_document_draft",
    description: "Add a document draft to a pending Experiment Design container.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        type: { type: "string", description: "Document type (prd, tech_design, adr, spec, guide)" },
        title: { type: "string", description: "Document title" },
        content: { type: "string", description: "Document content (Markdown)" },
      },
      required: ["proposalUuid", "type", "title", "content"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_add_document_draft",
    mapArgs: ({ proposalUuid, type, title, content }) => ({
      experimentDesignUuid: proposalUuid,
      type,
      title,
      content,
    }),
  }),
  createPassthroughTool<{
    proposalUuid: string;
    title: string;
    description?: string;
    priority?: string;
    storyPoints?: number;
    acceptanceCriteriaItems?: Array<Record<string, unknown>>;
    dependsOnDraftUuids?: string[];
  }>({
    name: "synapse_add_task_draft",
    description: "Legacy alias: add an experiment-run draft to a pending Experiment Design container.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        title: { type: "string", description: "Experiment Run title" },
        description: { type: "string", description: "Experiment Run description" },
        priority: { type: "string", description: 'Priority: "low", "medium", or "high"' },
        storyPoints: { type: "number", description: "Legacy alias for computeBudgetHours (effort estimate in agent hours)" },
        acceptanceCriteriaItems: { type: "array", description: "Structured acceptance criteria: [{ description, required? }]", items: { type: "object", properties: { description: { type: "string" }, required: { type: "boolean" } }, required: ["description"] } },
        dependsOnDraftUuids: { type: "array", description: "Dependent experiment-run draft UUIDs", items: { type: "string" } },
      },
      required: ["proposalUuid", "title"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_add_experiment_run_draft",
    mapArgs: ({
      proposalUuid,
      title,
      description,
      priority,
      storyPoints,
      acceptanceCriteriaItems,
      dependsOnDraftUuids,
    }) => {
      const args: Record<string, unknown> = { experimentDesignUuid: proposalUuid, title };
      if (description !== undefined) args.description = description;
      if (priority !== undefined) args.priority = priority;
      if (storyPoints !== undefined) args.computeBudgetHours = storyPoints;
      if (acceptanceCriteriaItems !== undefined) args.acceptanceCriteriaItems = acceptanceCriteriaItems;
      if (dependsOnDraftUuids !== undefined) args.dependsOnDraftUuids = dependsOnDraftUuids;
      return args;
    },
  }),
  createPassthroughTool<{ proposalUuid: string }>({
    name: "synapse_get_proposal",
    description: "Legacy alias: get detailed information for an Experiment Design, including all document drafts and experiment-run drafts with their UUIDs.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
      },
      required: ["proposalUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_get_experiment_design",
    mapArgs: ({ proposalUuid }) => ({ experimentDesignUuid: proposalUuid }),
  }),
  createPassthroughTool<{
    proposalUuid: string;
    draftUuid: string;
    title?: string;
    type?: string;
    content?: string;
  }>({
    name: "synapse_update_document_draft",
    description: "Update a document draft in an Experiment Design. Can change title, type, or content.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        draftUuid: { type: "string", description: "Document draft UUID to update" },
        title: { type: "string", description: "New document title" },
        type: { type: "string", description: "New document type (prd, tech_design, adr, spec, guide)" },
        content: { type: "string", description: "New document content (Markdown)" },
      },
      required: ["proposalUuid", "draftUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_update_document_draft",
    mapArgs: ({ proposalUuid, draftUuid, title, type, content }) => {
      const args: Record<string, unknown> = { experimentDesignUuid: proposalUuid, draftUuid };
      if (title !== undefined) args.title = title;
      if (type !== undefined) args.type = type;
      if (content !== undefined) args.content = content;
      return args;
    },
  }),
  createPassthroughTool<{
    proposalUuid: string;
    draftUuid: string;
    title?: string;
    description?: string;
    priority?: string;
    storyPoints?: number;
    acceptanceCriteriaItems?: Array<Record<string, unknown>>;
    dependsOnDraftUuids?: string[];
  }>({
    name: "synapse_update_task_draft",
    description: "Legacy alias: update an experiment-run draft in an Experiment Design. Use this to fix validation issues, add dependencies, and change priority.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        draftUuid: { type: "string", description: "Experiment-run draft UUID to update" },
        title: { type: "string", description: "New experiment-run title" },
        description: { type: "string", description: "New experiment-run description" },
        priority: { type: "string", description: 'Priority: "low", "medium", or "high"' },
        storyPoints: { type: "number", description: "Legacy alias for computeBudgetHours (effort estimate in agent hours)" },
        acceptanceCriteriaItems: { type: "array", description: "Structured acceptance criteria: [{ description, required? }]", items: { type: "object", properties: { description: { type: "string" }, required: { type: "boolean" } }, required: ["description"] } },
        dependsOnDraftUuids: { type: "array", description: "Experiment-run draft UUIDs this run depends on (sets execution order)", items: { type: "string" } },
      },
      required: ["proposalUuid", "draftUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_update_experiment_run_draft",
    mapArgs: ({
      proposalUuid,
      draftUuid,
      title,
      description,
      priority,
      storyPoints,
      acceptanceCriteriaItems,
      dependsOnDraftUuids,
    }) => {
      const args: Record<string, unknown> = { experimentDesignUuid: proposalUuid, draftUuid };
      if (title !== undefined) args.title = title;
      if (description !== undefined) args.description = description;
      if (priority !== undefined) args.priority = priority;
      if (storyPoints !== undefined) args.computeBudgetHours = storyPoints;
      if (acceptanceCriteriaItems !== undefined) args.acceptanceCriteriaItems = acceptanceCriteriaItems;
      if (dependsOnDraftUuids !== undefined) args.dependsOnDraftUuids = dependsOnDraftUuids;
      return args;
    },
  }),
  createPassthroughTool<{ proposalUuid: string; draftUuid: string }>({
    name: "synapse_remove_document_draft",
    description: "Remove a document draft from an Experiment Design.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        draftUuid: { type: "string", description: "Document draft UUID to remove" },
      },
      required: ["proposalUuid", "draftUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_remove_document_draft",
    mapArgs: ({ proposalUuid, draftUuid }) => ({
      experimentDesignUuid: proposalUuid,
      draftUuid,
    }),
  }),
  createPassthroughTool<{ proposalUuid: string; draftUuid: string }>({
    name: "synapse_remove_task_draft",
    description: "Legacy alias: remove an experiment-run draft from an Experiment Design.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        draftUuid: { type: "string", description: "Experiment-run draft UUID to remove" },
      },
      required: ["proposalUuid", "draftUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_remove_experiment_run_draft",
    mapArgs: ({ proposalUuid, draftUuid }) => ({
      experimentDesignUuid: proposalUuid,
      draftUuid,
    }),
  }),
  createPassthroughTool<{ proposalUuid: string }>({
    name: "synapse_validate_proposal",
    description: "Legacy alias: validate an Experiment Design before submission. Returns errors, warnings, and info. Always call this before synapse_submit_proposal.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID to validate (legacy parameter name)" },
      },
      required: ["proposalUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_validate_experiment_design",
    mapArgs: ({ proposalUuid }) => ({ experimentDesignUuid: proposalUuid }),
  }),
  createPassthroughTool<{ proposalUuid: string }>({
    name: "synapse_submit_proposal",
    description: "Legacy alias: submit an Experiment Design for approval (draft -> pending). Requires all input Research Questions to have elaboration resolved.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID to submit (legacy parameter name)" },
      },
      required: ["proposalUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_submit_experiment_design",
    mapArgs: ({ proposalUuid }) => ({ experimentDesignUuid: proposalUuid }),
  }),
  createPassthroughTool<{ taskUuid: string; agentUuid: string }>({
    name: "synapse_pm_assign_task",
    description: "Legacy alias: assign an experiment run to a specified Researcher Agent. The run must be in open or assigned status.",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
        agentUuid: { type: "string", description: "Target Researcher Agent UUID" },
      },
      required: ["taskUuid", "agentUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_assign_experiment_run",
    mapArgs: ({ taskUuid, agentUuid }) => ({
      runUuid: taskUuid,
      agentUuid,
    }),
  }),
  createPassthroughTool<{ ideaUuid: string; targetProjectUuid: string }>({
    name: "synapse_move_idea",
    description: "Legacy alias: move a Research Question to a different project within the same company. Also moves linked draft or pending Experiment Designs.",
    parameters: {
      type: "object",
      properties: {
        ideaUuid: { type: "string", description: "Research Question UUID (legacy parameter name)" },
        targetProjectUuid: { type: "string", description: "UUID of the target project" },
      },
      required: ["ideaUuid", "targetProjectUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_move_research_question",
    mapArgs: ({ ideaUuid, targetProjectUuid }) => ({
      researchQuestionUuid: ideaUuid,
      targetResearchProjectUuid: targetProjectUuid,
    }),
  }),
  createPassthroughTool<{ projectUuid: string; title: string; content?: string }>({
    name: "synapse_pm_create_idea",
    description: "Legacy alias: create a new Research Question in a project. Use this when you discover a requirement, want to propose work, or record a user request.",
    parameters: {
      type: "object",
      properties: {
        projectUuid: { type: "string", description: "Project UUID" },
        title: { type: "string", description: "Research Question title" },
        content: { type: "string", description: "Research Question detailed description" },
      },
      required: ["projectUuid", "title"],
      additionalProperties: false,
    },
    targetToolName: "synapse_research_lead_create_research_question",
    mapArgs: ({ projectUuid, title, content }) => {
      const args: Record<string, unknown> = { researchProjectUuid: projectUuid, title };
      if (content) args.content = content;
      return args;
    },
  }),
]);

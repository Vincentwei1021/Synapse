import type { SynapseMcpClient } from "../mcp-client.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerAdminTools(api: any, mcpClient: SynapseMcpClient) {
  api.registerTool({
    name: "synapse_admin_create_project",
    description: "Create a new project. Call synapse_get_project_groups first to find the right groupUuid.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        description: { type: "string", description: "Project description" },
        groupUuid: { type: "string", description: "Project group UUID (optional, use synapse_get_project_groups to list groups)" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    async execute(_id: string, { name, description, groupUuid }: { name: string; description?: string; groupUuid?: string }) {
      const args: Record<string, unknown> = { name };
      if (description) args.description = description;
      if (groupUuid) args.groupUuid = groupUuid;
      const result = await mcpClient.callTool("synapse_pi_create_research_project", args);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "synapse_admin_create_project_group",
    description: "Create a new project group for organizing projects.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Group name" },
        description: { type: "string", description: "Group description" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    async execute(_id: string, { name, description }: { name: string; description?: string }) {
      const args: Record<string, unknown> = { name };
      if (description) args.description = description;
      const result = await mcpClient.callTool("synapse_pi_create_project_group", args);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "synapse_admin_approve_proposal",
    description:
      "Legacy alias: approve an Experiment Design (Admin exclusive). On approval, documentDrafts and experiment-run drafts are automatically materialized into real Document and Experiment Run entities; the materialized runs can then be claimed and executed by agents. " +
      "⚠️ This action is irreversible — unless there is a special reason, you MUST obtain explicit human approval before calling this tool.",
    parameters: {
      type: "object",
      properties: {
        proposalUuid: { type: "string", description: "Experiment Design UUID (legacy parameter name)" },
        reviewNote: { type: "string", description: "Optional review note" },
      },
      required: ["proposalUuid"],
      additionalProperties: false,
    },
    async execute(_id: string, { proposalUuid, reviewNote }: { proposalUuid: string; reviewNote?: string }) {
      const args: Record<string, unknown> = { experimentDesignUuid: proposalUuid };
      if (reviewNote) args.reviewNote = reviewNote;
      const result = await mcpClient.callTool("synapse_pi_approve_experiment_design", args);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "synapse_admin_verify_task",
    description:
      "Legacy alias: verify an Experiment Run (to_verify -> done, Admin exclusive). Marks an experiment run as completed after verification. Downstream runs that depend on it will only be unblocked after it is verified. " +
      "⚠️ This action is irreversible — unless there is a special reason, you MUST obtain explicit human approval before calling this tool.",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
      },
      required: ["taskUuid"],
      additionalProperties: false,
    },
    async execute(_id: string, { taskUuid }: { taskUuid: string }) {
      const result = await mcpClient.callTool("synapse_pi_verify_experiment_run", { runUuid: taskUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "synapse_mark_acceptance_criteria",
    description: "Mark acceptance criteria as passed or failed during admin verification. Blocked criteria prevent an experiment run from being verified (to_verify -> done).",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
        criteria: {
          type: "array",
          description: "Array of { uuid, status: 'passed'|'failed', evidence?: string }",
          items: {
            type: "object",
            properties: {
              uuid: { type: "string", description: "AcceptanceCriterion UUID" },
              status: { type: "string", description: "Verification result: passed | failed" },
              evidence: { type: "string", description: "Optional evidence/notes" },
            },
            required: ["uuid", "status"],
          },
        },
      },
      required: ["taskUuid", "criteria"],
      additionalProperties: false,
    },
    async execute(_id: string, { taskUuid, criteria }: { taskUuid: string; criteria: Array<{ uuid: string; status: string; evidence?: string }> }) {
      const result = await mcpClient.callTool("synapse_mark_acceptance_criteria", { runUuid: taskUuid, criteria });
      return JSON.stringify(result, null, 2);
    },
  });
}

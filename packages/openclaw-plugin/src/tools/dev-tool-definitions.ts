import { createPassthroughTool, defineOpenClawTools } from "./tool-registry.js";

export const devToolDefinitions = defineOpenClawTools([
  createPassthroughTool<{ taskUuid: string }>({
    name: "synapse_claim_task",
    description: "Legacy alias: claim an open experiment run (open -> assigned).",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID to claim (legacy parameter name)" },
      },
      required: ["taskUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_claim_experiment_run",
    mapArgs: ({ taskUuid }) => ({ runUuid: taskUuid }),
  }),
  createPassthroughTool<{ taskUuid: string; status: string; sessionUuid?: string }>({
    name: "synapse_update_task",
    description: "Legacy alias: update experiment-run status (only the assignee can operate). Moving to in_progress requires all dependsOn runs to be done or closed; otherwise the request is rejected with blocker details. Use synapse_get_unblocked_tasks to find runs ready to start.",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
        status: { type: "string", description: "New status: in_progress | to_verify" },
        sessionUuid: { type: "string", description: "Session UUID for sub-agent identification" },
      },
      required: ["taskUuid", "status"],
      additionalProperties: false,
    },
    targetToolName: "synapse_update_experiment_run",
    mapArgs: ({ taskUuid, status, sessionUuid }) => {
      const args: Record<string, unknown> = { runUuid: taskUuid, status };
      if (sessionUuid) args.sessionUuid = sessionUuid;
      return args;
    },
  }),
  createPassthroughTool<{ taskUuid: string; report: string; status?: string; sessionUuid?: string }>({
    name: "synapse_report_work",
    description: "Report work progress or completion on an experiment run.",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
        report: { type: "string", description: "Work report content" },
        status: { type: "string", description: "Optional: update status at the same time (in_progress | to_verify)" },
        sessionUuid: { type: "string", description: "Session UUID for sub-agent identification" },
      },
      required: ["taskUuid", "report"],
      additionalProperties: false,
    },
    targetToolName: "synapse_report_work",
    mapArgs: ({ taskUuid, report, status, sessionUuid }) => {
      const args: Record<string, unknown> = { runUuid: taskUuid, report };
      if (status) args.status = status;
      if (sessionUuid) args.sessionUuid = sessionUuid;
      return args;
    },
  }),
  createPassthroughTool<{ taskUuid: string; summary?: string }>({
    name: "synapse_submit_for_verify",
    description: "Submit an experiment run for human verification (in_progress -> to_verify).",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
        summary: { type: "string", description: "Work summary" },
      },
      required: ["taskUuid"],
      additionalProperties: false,
    },
    targetToolName: "synapse_submit_for_verify",
    mapArgs: ({ taskUuid, summary }) => {
      const args: Record<string, unknown> = { runUuid: taskUuid };
      if (summary) args.summary = summary;
      return args;
    },
  }),
  createPassthroughTool<{
    taskUuid: string;
    criteria: Array<{ uuid: string; devStatus: string; devEvidence?: string }>;
  }>({
    name: "synapse_report_criteria_self_check",
    description: "Report self-check results on acceptance criteria for an experiment run you're working on. For required criteria, keep working until all pass. Only mark optional criteria as failed if out of scope.",
    parameters: {
      type: "object",
      properties: {
        taskUuid: { type: "string", description: "Experiment Run UUID (legacy parameter name)" },
        criteria: {
          type: "array",
          description: "Array of { uuid, devStatus: 'passed'|'failed', devEvidence?: string }",
          items: {
            type: "object",
            properties: {
              uuid: { type: "string", description: "AcceptanceCriterion UUID" },
              devStatus: { type: "string", description: "Self-check result: passed | failed" },
              devEvidence: { type: "string", description: "Optional evidence/notes" },
            },
            required: ["uuid", "devStatus"],
          },
        },
      },
      required: ["taskUuid", "criteria"],
      additionalProperties: false,
    },
    targetToolName: "synapse_report_criteria_self_check",
    mapArgs: ({ taskUuid, criteria }) => ({ runUuid: taskUuid, criteria }),
  }),
]);

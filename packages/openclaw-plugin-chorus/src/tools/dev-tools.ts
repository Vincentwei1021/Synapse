import type { ChorusMcpClient } from "../mcp-client.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDevTools(api: any, mcpClient: ChorusMcpClient) {
  api.registerTool({
    name: "chorus_claim_task",
    description: "Claim an open task (open -> assigned)",
    parameters: {
      taskUuid: { type: "string", description: "Task UUID to claim" },
    },
    async execute({ taskUuid }: { taskUuid: string }) {
      const result = await mcpClient.callTool("chorus_claim_task", { taskUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_update_task",
    description: "Update task status (only the assignee can operate)",
    parameters: {
      taskUuid: { type: "string", description: "Task UUID" },
      status: { type: "string", description: "New status: in_progress | to_verify" },
      sessionUuid: { type: "string", description: "Session UUID for sub-agent identification", optional: true },
    },
    async execute({ taskUuid, status, sessionUuid }: { taskUuid: string; status: "in_progress" | "to_verify"; sessionUuid?: string }) {
      const args: Record<string, unknown> = { taskUuid, status };
      if (sessionUuid) args.sessionUuid = sessionUuid;
      const result = await mcpClient.callTool("chorus_update_task", args);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_report_work",
    description: "Report work progress or completion on a task",
    parameters: {
      taskUuid: { type: "string", description: "Task UUID" },
      report: { type: "string", description: "Work report content" },
      status: { type: "string", description: "Optional: update status at the same time (in_progress | to_verify)", optional: true },
      sessionUuid: { type: "string", description: "Session UUID for sub-agent identification", optional: true },
    },
    async execute({ taskUuid, report, status, sessionUuid }: { taskUuid: string; report: string; status?: "in_progress" | "to_verify"; sessionUuid?: string }) {
      const args: Record<string, unknown> = { taskUuid, report };
      if (status) args.status = status;
      if (sessionUuid) args.sessionUuid = sessionUuid;
      const result = await mcpClient.callTool("chorus_report_work", args);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_submit_for_verify",
    description: "Submit task for human verification (in_progress -> to_verify)",
    parameters: {
      taskUuid: { type: "string", description: "Task UUID" },
      summary: { type: "string", description: "Work summary", optional: true },
    },
    async execute({ taskUuid, summary }: { taskUuid: string; summary?: string }) {
      const args: Record<string, unknown> = { taskUuid };
      if (summary) args.summary = summary;
      const result = await mcpClient.callTool("chorus_submit_for_verify", args);
      return JSON.stringify(result, null, 2);
    },
  });
}

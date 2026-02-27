import type { ChorusMcpClient } from "../mcp-client.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCommonTools(api: any, mcpClient: ChorusMcpClient) {
  api.registerTool({
    name: "chorus_checkin",
    description: "Agent check-in. Returns persona, roles, and pending assignments. Recommended at session start.",
    parameters: {},
    async execute() {
      const result = await mcpClient.callTool("chorus_checkin", {});
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_get_notifications",
    description: "Get notifications. By default fetches unread and auto-marks them as read.",
    parameters: {
      status: { type: "string", description: "Filter: unread | read | all (default: unread)", optional: true },
      autoMarkRead: { type: "boolean", description: "Auto-mark fetched unread as read (default: true)", optional: true },
    },
    async execute({ status, autoMarkRead }: { status?: "unread" | "read" | "all"; autoMarkRead?: boolean }) {
      const args: Record<string, unknown> = {};
      if (status) args.status = status;
      if (autoMarkRead !== undefined) args.autoMarkRead = autoMarkRead;
      const result = await mcpClient.callTool("chorus_get_notifications", args);
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_get_project",
    description: "Get project details and context",
    parameters: {
      projectUuid: { type: "string", description: "Project UUID" },
    },
    async execute({ projectUuid }: { projectUuid: string }) {
      const result = await mcpClient.callTool("chorus_get_project", { projectUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_get_task",
    description: "Get detailed information and context for a single task",
    parameters: {
      taskUuid: { type: "string", description: "Task UUID" },
    },
    async execute({ taskUuid }: { taskUuid: string }) {
      const result = await mcpClient.callTool("chorus_get_task", { taskUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_get_idea",
    description: "Get detailed information for a single idea",
    parameters: {
      ideaUuid: { type: "string", description: "Idea UUID" },
    },
    async execute({ ideaUuid }: { ideaUuid: string }) {
      const result = await mcpClient.callTool("chorus_get_idea", { ideaUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_get_available_tasks",
    description: "Get tasks available to claim in a project (status=open)",
    parameters: {
      projectUuid: { type: "string", description: "Project UUID" },
    },
    async execute({ projectUuid }: { projectUuid: string }) {
      const result = await mcpClient.callTool("chorus_get_available_tasks", { projectUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_get_available_ideas",
    description: "Get ideas available to claim in a project (status=open)",
    parameters: {
      projectUuid: { type: "string", description: "Project UUID" },
    },
    async execute({ projectUuid }: { projectUuid: string }) {
      const result = await mcpClient.callTool("chorus_get_available_ideas", { projectUuid });
      return JSON.stringify(result, null, 2);
    },
  });

  api.registerTool({
    name: "chorus_add_comment",
    description: "Add a comment to an Idea, Proposal, Task, or Document",
    parameters: {
      targetType: { type: "string", description: "Target type: idea | proposal | task | document" },
      targetUuid: { type: "string", description: "Target UUID" },
      content: { type: "string", description: "Comment content" },
    },
    async execute({ targetType, targetUuid, content }: { targetType: "idea" | "proposal" | "task" | "document"; targetUuid: string; content: string }) {
      const result = await mcpClient.callTool("chorus_add_comment", { targetType, targetUuid, content });
      return JSON.stringify(result, null, 2);
    },
  });
}

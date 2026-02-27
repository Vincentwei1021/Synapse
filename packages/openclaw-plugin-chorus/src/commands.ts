import type { ChorusMcpClient } from "./mcp-client.js";

// ===== Response types from Chorus MCP tools =====

interface CheckinResponse {
  checkinTime: string;
  agent: {
    uuid: string;
    name: string;
    roles: string[];
    persona: string | null;
    systemPrompt: string | null;
  };
  assignments: {
    ideas: AssignedIdea[];
    tasks: AssignedTask[];
  };
  pending: {
    ideasCount: number;
    tasksCount: number;
  };
  notifications: {
    unreadCount: number;
  };
}

interface AssignedIdea {
  uuid: string;
  title: string;
  status: string;
  project: { uuid: string; name: string };
}

interface AssignedTask {
  uuid: string;
  title: string;
  status: string;
  priority: string;
  project: { uuid: string; name: string };
}

interface AssignmentsResponse {
  ideas: AssignedIdea[];
  tasks: AssignedTask[];
}

// ===== Formatting helpers =====

function formatStatus(checkin: CheckinResponse, connectionStatus: string): string {
  const lines: string[] = [
    `Connection: ${connectionStatus}`,
    `Assignments: ${checkin.pending.ideasCount} ideas, ${checkin.pending.tasksCount} tasks`,
    `Notifications: ${checkin.notifications.unreadCount} unread`,
  ];
  return lines.join("\n");
}

function formatTaskList(tasks: AssignedTask[]): string {
  if (tasks.length === 0) {
    return "No assigned tasks.";
  }

  const lines = tasks.map(
    (t) => `[${t.status}] [${t.priority}] ${t.title}  (${t.project.name})`
  );
  return `Assigned tasks (${tasks.length}):\n${lines.join("\n")}`;
}

function formatIdeaList(ideas: AssignedIdea[]): string {
  if (ideas.length === 0) {
    return "No assigned ideas.";
  }

  const lines = ideas.map(
    (i) => `[${i.status}] ${i.title}  (${i.project.name})`
  );
  return `Assigned ideas (${ideas.length}):\n${lines.join("\n")}`;
}

const HELP_TEXT = [
  "Chorus commands:",
  "  /chorus           Show connection status and summary",
  "  /chorus status    Same as above",
  "  /chorus tasks     List assigned tasks",
  "  /chorus ideas     List assigned ideas",
].join("\n");

// ===== Registration =====

export function registerChorusCommands(
  api: any,
  mcpClient: ChorusMcpClient,
  getStatus: () => string
): void {
  api.registerCommand({
    name: "chorus",
    description: "Chorus plugin commands: status, tasks, ideas",
    async handler(ctx: { args: string }) {
      const sub = (ctx.args ?? "").trim().toLowerCase();

      // /chorus or /chorus status
      if (!sub || sub === "status") {
        try {
          const checkin = (await mcpClient.callTool("chorus_checkin", {})) as CheckinResponse;
          return { text: formatStatus(checkin, getStatus()) };
        } catch (err) {
          return { text: `Failed to check in: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // /chorus tasks
      if (sub === "tasks") {
        try {
          const data = (await mcpClient.callTool(
            "chorus_get_my_assignments",
            {}
          )) as AssignmentsResponse;
          return { text: formatTaskList(data.tasks) };
        } catch (err) {
          return { text: `Failed to fetch tasks: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // /chorus ideas
      if (sub === "ideas") {
        try {
          const data = (await mcpClient.callTool(
            "chorus_get_my_assignments",
            {}
          )) as AssignmentsResponse;
          return { text: formatIdeaList(data.ideas) };
        } catch (err) {
          return { text: `Failed to fetch ideas: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // Unknown subcommand
      return { text: HELP_TEXT };
    },
  });
}

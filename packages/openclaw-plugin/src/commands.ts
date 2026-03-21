import type { SynapseMcpClient } from "./mcp-client.js";

// ===== Response types from Synapse MCP tools =====

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
    `Assignments: ${checkin?.pending?.ideasCount ?? 0} ideas, ${checkin?.pending?.tasksCount ?? 0} tasks`,
    `Notifications: ${checkin?.notifications?.unreadCount ?? 0} unread`,
  ];
  return lines.join("\n");
}

function formatTaskList(tasks: AssignedTask[] | undefined): string {
  if (!tasks?.length) {
    return "No assigned tasks.";
  }

  const lines = tasks.map(
    (t) => `[${t.status}] [${t.priority}] ${t.title}  (${t.project.name})`
  );
  return `Assigned tasks (${tasks.length}):\n${lines.join("\n")}`;
}

function formatIdeaList(ideas: AssignedIdea[] | undefined): string {
  if (!ideas?.length) {
    return "No assigned ideas.";
  }

  const lines = ideas.map(
    (i) => `[${i.status}] ${i.title}  (${i.project.name})`
  );
  return `Assigned ideas (${ideas.length}):\n${lines.join("\n")}`;
}

const HELP_TEXT = [
  "Synapse commands:",
  "  /synapse           Show connection status and summary",
  "  /synapse status    Same as above",
  "  /synapse tasks     List assigned tasks",
  "  /synapse ideas     List assigned ideas",
].join("\n");

// ===== Registration =====

export function registerSynapseCommands(
  api: any,
  mcpClient: SynapseMcpClient,
  getStatus: () => string
): void {
  api.registerCommand({
    name: "synapse",
    description: "Synapse plugin commands: status, tasks, ideas",
    async handler(ctx: { args: string }) {
      const sub = (ctx.args ?? "").trim().toLowerCase();

      // /synapse or /synapse status
      if (!sub || sub === "status") {
        try {
          const checkin = (await mcpClient.callTool("synapse_checkin", {})) as CheckinResponse;
          return { text: formatStatus(checkin, getStatus()) };
        } catch (err) {
          return { text: `Failed to check in: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // /synapse tasks
      if (sub === "tasks") {
        try {
          const data = (await mcpClient.callTool(
            "synapse_get_my_assignments",
            {}
          )) as AssignmentsResponse;
          return { text: formatTaskList(data?.tasks) };
        } catch (err) {
          return { text: `Failed to fetch tasks: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // /synapse ideas
      if (sub === "ideas") {
        try {
          const data = (await mcpClient.callTool(
            "synapse_get_my_assignments",
            {}
          )) as AssignmentsResponse;
          return { text: formatIdeaList(data?.ideas) };
        } catch (err) {
          return { text: `Failed to fetch ideas: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // Unknown subcommand
      return { text: HELP_TEXT };
    },
  });
}

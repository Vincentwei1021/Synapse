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
    ideas?: AssignedIdea[];
    tasks?: AssignedTask[];
    researchQuestions?: AssignedIdea[];
    experimentRuns?: AssignedTask[];
  };
  pending: {
    ideasCount?: number;
    tasksCount?: number;
    researchQuestionsCount?: number;
    experimentRunsCount?: number;
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
  ideas?: AssignedIdea[];
  tasks?: AssignedTask[];
  researchQuestions?: AssignedIdea[];
  experimentRuns?: AssignedTask[];
}

// ===== Formatting helpers =====

function formatStatus(checkin: CheckinResponse, connectionStatus: string): string {
  const ideaCount = checkin?.pending?.ideasCount ?? checkin?.pending?.researchQuestionsCount ?? 0;
  const taskCount = checkin?.pending?.tasksCount ?? checkin?.pending?.experimentRunsCount ?? 0;
  const lines: string[] = [
    `Connection: ${connectionStatus}`,
    `Assignments: ${ideaCount} questions, ${taskCount} experiments`,
    `Notifications: ${checkin?.notifications?.unreadCount ?? 0} unread`,
  ];
  return lines.join("\n");
}

function formatTaskList(tasks: AssignedTask[] | undefined): string {
  if (!tasks?.length) {
    return "No assigned experiment runs.";
  }

  const lines = tasks.map(
    (t) => `[${t.status}] [${t.priority}] ${t.title}  (${t.project.name})`
  );
  return `Assigned experiment runs (${tasks.length}):\n${lines.join("\n")}`;
}

function formatIdeaList(ideas: AssignedIdea[] | undefined): string {
  if (!ideas?.length) {
    return "No assigned research questions.";
  }

  const lines = ideas.map(
    (i) => `[${i.status}] ${i.title}  (${i.project.name})`
  );
  return `Assigned research questions (${ideas.length}):\n${lines.join("\n")}`;
}

const HELP_TEXT = [
  "Synapse commands:",
  "  /synapse           Show connection status and summary",
  "  /synapse status    Same as above",
  "  /synapse tasks     List assigned experiment runs (legacy alias name)",
  "  /synapse ideas     List assigned research questions (legacy alias name)",
].join("\n");

interface CommandRegistry {
  registerCommand(command: {
    name: string;
    description: string;
    handler: (ctx: { args: string }) => Promise<{ text: string }>;
  }): void;
}

// ===== Registration =====

export function registerSynapseCommands(
  api: CommandRegistry,
  mcpClient: SynapseMcpClient,
  getStatus: () => string
): void {
  api.registerCommand({
    name: "synapse",
    description: "Synapse plugin commands: status, tasks (experiment runs), ideas (research questions)",
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

      // /synapse tasks (legacy alias for experiment runs)
      if (sub === "tasks") {
        try {
          const data = (await mcpClient.callTool(
            "synapse_get_my_assignments",
            {}
          )) as AssignmentsResponse;
          return { text: formatTaskList(data?.tasks ?? data?.experimentRuns) };
        } catch (err) {
          return { text: `Failed to fetch experiment runs: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // /synapse ideas (legacy alias for research questions)
      if (sub === "ideas") {
        try {
          const data = (await mcpClient.callTool(
            "synapse_get_my_assignments",
            {}
          )) as AssignmentsResponse;
          return { text: formatIdeaList(data?.ideas ?? data?.researchQuestions) };
        } catch (err) {
          return { text: `Failed to fetch research questions: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // Unknown subcommand
      return { text: HELP_TEXT };
    },
  });
}

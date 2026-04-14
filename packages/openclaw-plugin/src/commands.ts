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
    researchQuestions?: AssignedQuestion[];
    experiments?: AssignedExperiment[];
    experimentRuns?: AssignedExperiment[];
  };
  pending: {
    researchQuestionsCount?: number;
    experimentsCount?: number;
    experimentRunsCount?: number;
  };
  notifications: {
    unreadCount: number;
  };
}

interface AssignedQuestion {
  uuid: string;
  title: string;
  status: string;
  project: { uuid: string; name: string };
}

interface AssignedExperiment {
  uuid: string;
  title: string;
  status: string;
  priority?: string;
  project?: { uuid: string; name: string };
  projectUuid?: string;
  projectName?: string;
}

// ===== Formatting helpers =====

function formatStatus(checkin: CheckinResponse, connectionStatus: string): string {
  const questionCount = checkin?.pending?.researchQuestionsCount ?? 0;
  const experimentCount =
    checkin?.pending?.experimentsCount ??
    checkin?.assignments?.experiments?.length ??
    checkin?.pending?.experimentRunsCount ??
    checkin?.assignments?.experimentRuns?.length ??
    0;
  const lines: string[] = [
    `Connection: ${connectionStatus}`,
    `Assignments: ${questionCount} questions, ${experimentCount} experiments`,
    `Notifications: ${checkin?.notifications?.unreadCount ?? 0} unread`,
  ];
  return lines.join("\n");
}

function formatExperimentList(experiments: AssignedExperiment[] | undefined): string {
  if (!experiments?.length) {
    return "No assigned experiments.";
  }

  const lines = experiments.map((experiment) => {
    const projectName = experiment.projectName ?? experiment.project?.name ?? "Unknown project";
    const priority = experiment.priority ? `[${experiment.priority}] ` : "";
    return `[${experiment.status}] ${priority}${experiment.title}  (${projectName})`;
  }
  );
  return `Assigned experiments (${experiments.length}):\n${lines.join("\n")}`;
}

function formatQuestionList(questions: AssignedQuestion[] | undefined): string {
  if (!questions?.length) {
    return "No assigned research questions.";
  }

  const lines = questions.map(
    (q) => `[${q.status}] ${q.title}  (${q.project.name})`
  );
  return `Assigned research questions (${questions.length}):\n${lines.join("\n")}`;
}

const HELP_TEXT = [
  "Synapse commands:",
  "  /synapse              Show connection status and summary",
  "  /synapse status       Same as above",
  "  /synapse experiments  List assigned experiments",
  "  /synapse questions    List assigned research questions",
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
    description: "Synapse plugin commands: status, experiments, questions",
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

      // /synapse experiments
      if (sub === "experiments" || sub === "tasks") {
        try {
          const data = (await mcpClient.callTool(
            "synapse_checkin",
            {}
          )) as CheckinResponse;
          return { text: formatExperimentList(data?.assignments?.experiments ?? data?.assignments?.experimentRuns) };
        } catch (err) {
          return { text: `Failed to fetch experiments: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // /synapse questions
      if (sub === "questions" || sub === "ideas") {
        try {
          const data = (await mcpClient.callTool(
            "synapse_checkin",
            {}
          )) as CheckinResponse;
          return { text: formatQuestionList(data?.assignments?.researchQuestions) };
        } catch (err) {
          return { text: `Failed to fetch research questions: ${err instanceof Error ? err.message : String(err)}` };
        }
      }

      // Unknown subcommand
      return { text: HELP_TEXT };
    },
  });
}

import type { SynapseMcpClient } from "./mcp-client.js";
import type { SynapsePluginConfig } from "./config.js";
import type { SseNotificationEvent } from "./sse-listener.js";

export interface SynapseEventRouterOptions {
  mcpClient: SynapseMcpClient;
  config: SynapsePluginConfig;
  triggerAgent: (message: string, metadata?: Record<string, unknown>) => void;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

/**
 * Notification detail returned from synapse_get_notifications.
 * Only the fields we need for routing.
 */
interface NotificationDetail {
  uuid: string;
  projectUuid?: string;
  researchProjectUuid?: string;
  entityType: string;
  entityUuid: string;
  entityTitle: string;
  action: string;
  message: string;
  actorType: string;
  actorUuid: string;
  actorName: string;
}

interface ExperimentDetail {
  uuid: string;
  researchProjectUuid: string;
  title: string;
  description: string | null;
  priority: string;
  computeBudgetHours: number | null;
  attachments: Array<{ originalName: string }> | null;
  researchQuestion?: { uuid: string; title: string } | null;
  parentQuestionExperiments?: Array<{ title: string; status: string; outcome: string | null }> | null;
}

interface ResearchProjectDetail {
  uuid: string;
  name: string;
  description: string | null;
  goal: string | null;
  datasets: Array<unknown> | null;
  evaluationMethods: Array<unknown> | null;
}

export class SynapseEventRouter {
  private readonly mcpClient: SynapseMcpClient;
  private readonly config: SynapsePluginConfig;
  private readonly triggerAgent: SynapseEventRouterOptions["triggerAgent"];
  private readonly logger: SynapseEventRouterOptions["logger"];
  private readonly projectFilter: Set<string>;

  constructor(opts: SynapseEventRouterOptions) {
    this.mcpClient = opts.mcpClient;
    this.config = opts.config;
    this.triggerAgent = opts.triggerAgent;
    this.logger = opts.logger;
    this.projectFilter = new Set(opts.config.projectUuids ?? []);
  }

  /**
   * Route an incoming SSE notification event to the appropriate handler.
   * Never throws — all errors are caught and logged internally.
   */
  dispatch(event: SseNotificationEvent): void {
    // Only handle new_notification events (ignore count_update, etc.)
    if (event.type !== "new_notification") {
      this.logger.info(`SSE event type "${event.type}" ignored`);
      return;
    }

    if (!event.notificationUuid) {
      this.logger.warn("new_notification event missing notificationUuid, skipping");
      return;
    }

    // Fetch full notification details and route asynchronously
    this.fetchAndRoute(event.notificationUuid).catch((err) => {
      this.logger.error(`Failed to fetch/route notification ${event.notificationUuid}: ${err}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async fetchAndRoute(notificationUuid: string): Promise<void> {
    // Fetch notification details via MCP — use autoMarkRead=false so we don't
    // consume all unread notifications, and status=unread since we just received it
    const result = await this.mcpClient.callTool("synapse_get_notifications", {
      status: "unread",
      limit: 50,
      autoMarkRead: false,
    }) as { notifications?: NotificationDetail[] } | null;

    const notifications = result?.notifications;
    if (!notifications || !Array.isArray(notifications)) {
      this.logger.warn(`Could not fetch notifications list`);
      return;
    }

    const notification = notifications.find((n) => n.uuid === notificationUuid);
    if (!notification) {
      this.logger.warn(`Notification ${notificationUuid} not found in unread list`);
      return;
    }

    // Project filter: if projectUuids is configured, ignore events from other projects
    const projectUuid = notification.projectUuid ?? notification.researchProjectUuid ?? "";

    if (this.projectFilter.size > 0 && !this.projectFilter.has(projectUuid)) {
      this.logger.info(
        `Notification for project ${projectUuid} filtered out`
      );
      return;
    }

    // Route based on action (which corresponds to notificationType)
    try {
      switch (notification.action) {
        case "task_assigned":
        case "run_assigned":
          await this.handleExperimentAssigned(notification);
          break;
        case "mentioned":
          this.handleMentioned(notification);
          break;
        case "research_question_claimed":
        case "idea_claimed":
          this.handleResearchQuestionClaimed(notification);
          break;
        case "autonomous_loop_triggered":
          this.handleAutonomousLoopTriggered(notification);
          break;
        case "deep_research_requested":
          this.handleDeepResearchRequested(notification);
          break;
        case "auto_search_triggered":
          this.handleAutoSearchTriggered(notification);
          break;
        case "experiment_report_requested":
          this.handleExperimentReportRequested(notification);
          break;
        default:
          this.logger.info(`Unhandled notification action: "${notification.action}"`);
          break;
      }
    } catch (err) {
      this.logger.error(`Error handling ${notification.action} notification: ${err}`);
    }
  }

  /**
   * Build @mention guidance for agent messages.
   * Instructs the agent to @mention the actor after completing work.
   */
  private buildMentionGuidance(n: NotificationDetail, entityType: string): string {
    return (
      `After completing your work, post a comment on this ${entityType} using synapse_add_comment with @mention:\n` +
      `Use this exact mention format: @[${n.actorName}](${n.actorType}:${n.actorUuid})`
    );
  }

  private formatList(values: Array<unknown> | null | undefined): string {
    if (!values || values.length === 0) {
      return "Not specified";
    }

    return values
      .map((value) => {
        if (typeof value === "string") {
          return value;
        }
        return JSON.stringify(value);
      })
      .join("; ");
  }

  private async handleExperimentAssigned(n: NotificationDetail): Promise<void> {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "experiment");

    let experiment: ExperimentDetail | null = null;
    let project: ResearchProjectDetail | null = null;

    try {
      const result = await this.mcpClient.callTool("synapse_get_experiment", {
        experimentUuid: n.entityUuid,
      }) as { experiment?: ExperimentDetail } | null;
      experiment = result?.experiment ?? null;
    } catch (err) {
      this.logger.warn(`Failed to fetch experiment detail for wake prompt: ${err}`);
    }

    try {
      const targetProjectUuid = experiment?.researchProjectUuid ?? projectUuid;
      if (targetProjectUuid) {
        const result = await this.mcpClient.callTool("synapse_get_research_project", {
          researchProjectUuid: targetProjectUuid,
        }) as ResearchProjectDetail | null;
        project = result;
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch research project detail for wake prompt: ${err}`);
    }

    const contextLines = [
      project?.name ? `Research project: ${project.name}` : null,
      project?.goal ? `Goal: ${project.goal}` : null,
      project?.description ? `Project brief: ${project.description}` : null,
      project ? `Datasets: ${this.formatList(project.datasets)}` : null,
      project ? `Evaluation methods: ${this.formatList(project.evaluationMethods)}` : null,
      experiment?.description ? `Experiment description: ${experiment.description}` : null,
      experiment?.researchQuestion?.title ? `Linked research question: ${experiment.researchQuestion.title}` : null,
      experiment?.computeBudgetHours != null ? `Compute budget (hours): ${experiment.computeBudgetHours}` : "Compute budget (hours): Unlimited",
      experiment?.attachments?.length
        ? `Attached files: ${experiment.attachments.map((item) => item.originalName).join(", ")}`
        : null,
      experiment?.parentQuestionExperiments?.length
        ? `Parent-question experiment context: ${experiment.parentQuestionExperiments
            .map((item) => `${item.title} [${item.status}]${item.outcome ? ` outcome: ${item.outcome}` : ""}`)
            .join("; ")}`
        : null,
      "If a selected compute node exposes managedKeyAvailable=true, call synapse_get_node_access_bundle with the experimentUuid and nodeUuid. Write the returned privateKeyPemBase64 to a local PEM file with chmod 600 before using ssh.",
    ].filter(Boolean);

    const prompt = [
      `[Synapse] Experiment assigned: ${n.entityTitle}. Experiment UUID: ${n.entityUuid}, Project UUID: ${projectUuid}.`,
      ...contextLines,
      "Use synapse_get_assigned_experiments to inspect your current queue. Execute the highest-priority item first; experiments with priority 'immediate' must jump to the front of the queue, and experiments with the same priority should be handled FIFO.",
      `Then use synapse_get_experiment with experimentUuid "${n.entityUuid}" to inspect full details, use synapse_list_compute_nodes to inspect available machines and GPUs, call synapse_start_experiment when you begin execution.`,
      `During execution, call synapse_report_experiment_progress with experimentUuid "${n.entityUuid}" at each major step (e.g. data download, training start, evaluation) to update the live status on the experiment card.`,
      `When finished, call synapse_submit_experiment_results with experimentUuid "${n.entityUuid}" to complete the experiment.`,
      mentionGuidance,
    ].join("\n");

    // Compute timeout: use experiment's computeBudgetHours, or 24h if unlimited
    const budgetHours = experiment?.computeBudgetHours;
    const timeoutSeconds = budgetHours != null ? Math.ceil(budgetHours * 3600) : 24 * 3600;

    this.triggerAgent(prompt, {
      notificationUuid: n.uuid,
      action: "task_assigned",
      entityType: n.entityType,
      entityUuid: n.entityUuid,
      projectUuid,
      timeoutSeconds,
    });
  }

  private handleMentioned(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, n.entityType);

    this.triggerAgent(
      `[Synapse] You were @mentioned in ${n.entityType} '${n.entityTitle}' (entityType: ${n.entityType}, entityUuid: ${n.entityUuid}, projectUuid: ${projectUuid}): ${n.message}\n` +
      `Review the ${n.entityType} content and use synapse_get_comments (targetType: "${n.entityType}", targetUuid: "${n.entityUuid}") to see the full conversation, then respond.\n` +
      mentionGuidance,
      { notificationUuid: n.uuid, action: "mentioned", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleResearchQuestionClaimed(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "research question");

    this.triggerAgent(
      `[Synapse] Research question '${n.entityTitle}' has been assigned to you (questionUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). ` +
      `Use synapse_get_research_question to review the question context.\n` +
      mentionGuidance,
      { notificationUuid: n.uuid, action: "research_question_claimed", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleAutonomousLoopTriggered(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";

    this.triggerAgent(
      `[Synapse] Autonomous research loop triggered for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

The experiment queue is empty. Your task:
1. Use synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to review all project details, research questions, and experiment results
2. Analyze: What questions remain unanswered? What experiments could yield new insights? Are there gaps in the research?
3. If you identify valuable next steps, use synapse_propose_experiment to create experiments in pending_review for human review
4. If the research objectives appear to be met, you may choose not to propose any new experiments

Proposed experiments will enter "pending_review" status and require human approval before execution.`,
      { notificationUuid: n.uuid, action: "autonomous_loop_triggered", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private static readonly DEFAULT_DEEP_RESEARCH_MSG = "Generate a deep research literature review for this project.";
  private static readonly DEFAULT_AUTO_SEARCH_MSG = "Search for related papers for this project.";

  private handleDeepResearchRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const hasCustomPrompt = n.message !== SynapseEventRouter.DEFAULT_DEEP_RESEARCH_MSG;

    const basePrompt = `[Synapse] Deep research literature review requested for project (projectUuid: ${projectUuid}).

IMPORTANT: You MUST save the report back to Synapse using synapse_save_deep_research_report. Do NOT just output text — the report must be saved via the tool call.

You may ONLY use these Synapse tools for this task:
- synapse_get_deep_research_report
- synapse_get_related_works
- synapse_get_research_project
- synapse_save_deep_research_report

Steps:
1. Use synapse_get_deep_research_report with researchProjectUuid "${projectUuid}" to check if a previous report exists — if so, read it to understand what was covered before
2. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to read all collected papers
3. Use synapse_get_research_project with researchProjectUuid "${projectUuid}" to understand the research objectives, datasets, and evaluation methods
4. Analyze how each paper relates to the project's goals — identify key methods, findings, and gaps in the literature
5. REQUIRED: Use synapse_save_deep_research_report with researchProjectUuid "${projectUuid}", title, and content (Markdown) to save the report. This creates v1 or updates to v2/v3 automatically.`;

    const prompt = hasCustomPrompt
      ? `${basePrompt}\n\nAdditional instructions from the user:\n${n.message}`
      : basePrompt;

    this.triggerAgent(prompt, { notificationUuid: n.uuid, action: "deep_research_requested", entityUuid: n.entityUuid, projectUuid, timeoutSeconds: 1800 });
  }

  private handleAutoSearchTriggered(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const hasCustomPrompt = n.message !== SynapseEventRouter.DEFAULT_AUTO_SEARCH_MSG;

    const basePrompt = `[Synapse] Paper search requested for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

You may ONLY use these Synapse tools for this task:
- synapse_get_related_works
- synapse_get_research_project
- synapse_search_papers
- synapse_add_related_work

Steps:
1. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to see what papers are already collected — avoid searching for topics already well-covered
2. Use synapse_get_research_project with researchProjectUuid "${projectUuid}" to understand the research objectives, datasets, and methods
3. Based on the project context and gaps in existing papers, use synapse_search_papers to find new relevant academic papers
4. For each relevant paper found, use synapse_add_related_work with researchProjectUuid "${projectUuid}" to add it (duplicates are automatically skipped — if isNew=false, the paper already existed)
5. Search with multiple query variations to maximize coverage, but call synapse_search_papers sequentially (one at a time) to avoid rate limits
6. Focus on papers that fill gaps not covered by existing related works`;

    const prompt = hasCustomPrompt
      ? `${basePrompt}\n\nAdditional instructions from the user:\n${n.message}`
      : basePrompt;

    this.triggerAgent(prompt, { notificationUuid: n.uuid, action: "auto_search_triggered", entityUuid: n.entityUuid, projectUuid, timeoutSeconds: 600 });
  }

  private handleExperimentReportRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";

    this.triggerAgent(
      `[Synapse] You just completed experiment "${n.entityTitle}" (experimentUuid: ${n.entityUuid}, projectUuid: ${projectUuid}).

Write a detailed experiment report document for this experiment. Follow these steps:

1. Use synapse_get_experiment with experimentUuid "${n.entityUuid}" to read the full experiment details (description, outcome, results, compute usage)
2. Use synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to understand the broader research context
3. Write a comprehensive experiment report that includes:
   - Experiment objective and setup
   - Methodology and approach
   - Results and key findings
   - Analysis and interpretation
   - Conclusions and next steps
4. Write the report in the same language as the project description.
5. Use synapse_add_comment to post the report as a comment on the experiment (targetType: "experiment", targetUuid: "${n.entityUuid}")

Keep the report focused on THIS experiment only — do not summarize the entire project.`,
      { notificationUuid: n.uuid, action: "experiment_report_requested", entityUuid: n.entityUuid, projectUuid }
    );
  }
}

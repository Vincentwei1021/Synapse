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
  baseBranch: string | null;
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
  repoUrl: string | null;
}

interface RepoAccessDetail {
  configured: boolean;
  repoUrl?: string;
  githubUsername?: string;
  githubToken?: string;
  baseBranch?: string | null;
}

// Shared guidance: OpenClaw wakes are expensive (each one spawns an isolated
// Claude Code session). Long-running research work — experiment execution,
// paper search, deep research reports, synthesis — should be delegated to a
// sub-agent immediately so the main turn finishes promptly and the next wake
// isn't blocked.
const SUBAGENT_DISPATCH_INSTRUCTION =
  "IMMEDIATE DISPATCH: Before doing any research work yourself, spawn a sub-agent via the Agent tool (subagent_type: \"general-purpose\") and hand off ALL of the work below to it. Pass the full task context (entity UUIDs, project UUID, the instructions in this prompt) into the sub-agent's prompt. After dispatch, return and end your turn promptly — do NOT wait for the sub-agent to finish. The sub-agent is responsible for executing the Synapse MCP tool calls and completing the task.";

// Guidance for the FIRST experiment in a project: foundational work that
// every subsequent experiment depends on. Only injected when Synapse has
// determined there is no prior experiment history on the project.
const FIRST_EXPERIMENT_BEST_PRACTICE =
  "FIRST EXPERIMENT — FOUNDATIONAL SETUP (this is the first experiment on this project):\n" +
  "  1. Prepare/normalize the raw data into a single canonical format that every future experiment will consume. Commit the data-prep scripts to the repo (if one is configured).\n" +
  "  2. Establish a baseline — run the simplest reasonable model/approach end-to-end and record its metrics via synapse_create_baseline so subsequent experiments can compare against it.\n" +
  "  3. Build the evaluation script that future experiments will call. Commit it alongside the data-prep scripts.\n" +
  "  4. If the project has a GitHub repo configured, commit steps 1-3 onto the base branch (or onto a per-experiment branch that is then merged back to the base branch). Every subsequent experiment must branch from the base branch so it inherits the data-prep + eval script.";

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

    const notification = this.extractNotificationFromEvent(event);
    const routePromise = notification
      ? this.routeNotification(notification)
      : this.fetchAndRoute(event.notificationUuid);

    routePromise
      .catch((err) => {
        this.logger.error(`Failed to fetch/route notification ${event.notificationUuid}: ${err}`);
      })
      .finally(() => {
        void this.markNotificationRead(event.notificationUuid!);
      });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private extractNotificationFromEvent(event: SseNotificationEvent): NotificationDetail | null {
    if (
      !event.notificationUuid ||
      !event.entityType ||
      !event.entityUuid ||
      !event.entityTitle ||
      !event.action ||
      !event.message ||
      !event.actorType ||
      !event.actorUuid ||
      !event.actorName
    ) {
      return null;
    }

    return {
      uuid: event.notificationUuid,
      researchProjectUuid: event.researchProjectUuid,
      entityType: event.entityType,
      entityUuid: event.entityUuid,
      entityTitle: event.entityTitle,
      action: event.action,
      message: event.message,
      actorType: event.actorType,
      actorUuid: event.actorUuid,
      actorName: event.actorName,
    };
  }

  private async fetchNotificationList(status: "unread" | "all"): Promise<NotificationDetail[]> {
    const result = await this.mcpClient.callTool("synapse_get_notifications", {
      status,
      limit: 100,
      autoMarkRead: false,
    }) as { notifications?: NotificationDetail[] } | null;

    const notifications = result?.notifications;
    if (!notifications || !Array.isArray(notifications)) {
      this.logger.warn(`Could not fetch ${status} notifications list`);
      return [];
    }

    return notifications;
  }

  private async fetchAndRoute(notificationUuid: string): Promise<void> {
    const unreadNotifications = await this.fetchNotificationList("unread");
    let notification = unreadNotifications.find((n) => n.uuid === notificationUuid);

    if (!notification) {
      const allNotifications = await this.fetchNotificationList("all");
      notification = allNotifications.find((n) => n.uuid === notificationUuid);
    }

    if (!notification) {
      this.logger.warn(`Notification ${notificationUuid} not found in unread or recent notifications`);
      return;
    }

    await this.routeNotification(notification);
  }

  private async routeNotification(notification: NotificationDetail): Promise<void> {
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
        case "synthesis_refresh_requested":
          this.handleSynthesisRefreshRequested(notification);
          break;
        case "experiment_report_requested":
          this.handleExperimentReportRequested(notification);
          break;
        case "experiment_plan_requested":
          this.handleExperimentPlanRequested(notification);
          break;
        case "experiment_revision_requested":
          this.handleExperimentRevisionRequested(notification);
          break;
        default:
          this.logger.info(`Unhandled notification action: "${notification.action}"`);
          break;
      }
    } catch (err) {
      this.logger.error(`Error handling ${notification.action} notification: ${err}`);
    }
  }

  private async markNotificationRead(notificationUuid: string): Promise<void> {
    try {
      await this.mcpClient.callTool("synapse_mark_notification_read", {
        notificationUuid,
      });
    } catch (err) {
      this.logger.warn(`Failed to mark notification ${notificationUuid} as read: ${err}`);
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

    let experiment: ExperimentDetail | null = null;
    let project: ResearchProjectDetail | null = null;
    let repoAccess: RepoAccessDetail | null = null;
    let projectExperimentContext: { isFirstExperiment: boolean } | null = null;

    try {
      const result = await this.mcpClient.callTool("synapse_get_experiment", {
        experimentUuid: n.entityUuid,
      }) as {
        experiment?: ExperimentDetail;
        projectExperimentContext?: { isFirstExperiment: boolean };
      } | null;
      experiment = result?.experiment ?? null;
      projectExperimentContext = result?.projectExperimentContext ?? null;
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

    // Fetch GitHub repo access if project has a repo configured
    if (project?.repoUrl) {
      try {
        const result = await this.mcpClient.callTool("synapse_get_repo_access", {
          researchProjectUuid: experiment?.researchProjectUuid ?? projectUuid,
          experimentUuid: n.entityUuid,
        }) as RepoAccessDetail | null;
        repoAccess = result;
      } catch (err) {
        this.logger.warn(`Failed to fetch repo access for wake prompt: ${err}`);
      }
    }

    // --- Build context section ---
    const context = [
      `Project: ${project?.name ?? "Unknown"}`,
      project?.description ? `Brief: ${project.description}` : null,
      project ? `Datasets: ${this.formatList(project.datasets)}` : null,
      project ? `Evaluation methods: ${this.formatList(project.evaluationMethods)}` : null,
      "",
      `Experiment: ${n.entityTitle}`,
      `Experiment UUID: ${n.entityUuid}`,
      `Project UUID: ${projectUuid}`,
      `Priority: ${experiment?.priority ?? "medium"}`,
      experiment?.computeBudgetHours != null ? `Time limit: ${experiment.computeBudgetHours} hours` : "Time limit: Unlimited",
      experiment?.researchQuestion?.title ? `Research question: ${experiment.researchQuestion.title}` : null,
      experiment?.baseBranch ? `Base branch: ${experiment.baseBranch}` : null,
      experiment?.attachments?.length
        ? `Attached files: ${experiment.attachments.map((item) => item.originalName).join(", ")}`
        : null,
      experiment?.parentQuestionExperiments?.length
        ? `Related experiments: ${experiment.parentQuestionExperiments
            .map((item) => `${item.title} [${item.status}]${item.outcome ? ` → ${item.outcome}` : ""}`)
            .join("; ")}`
        : null,
    ].filter((line) => line !== null).join("\n");

    // --- Build description section ---
    const description = experiment?.description
      ? `\nExperiment description:\n${experiment.description}`
      : "";

    // --- Build GitHub section ---
    let githubSection = "";
    if (repoAccess?.configured && repoAccess.repoUrl && repoAccess.githubToken) {
      const match = repoAccess.repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
      const cloneUrl = match
        ? `https://${repoAccess.githubUsername ?? "git"}:${repoAccess.githubToken}@github.com/${match[1]}/${match[2]}.git`
        : repoAccess.repoUrl;
      githubSection = `
GitHub repo: ${repoAccess.repoUrl}
Clone URL (with token): ${cloneUrl}
Base branch: ${repoAccess.baseBranch ?? "main"}`;
    }

    // --- Build steps ---
    const hasRepo = repoAccess?.configured && repoAccess.repoUrl && repoAccess.githubToken;
    const baseBranch = repoAccess?.baseBranch ?? "main";
    const experimentUuid = n.entityUuid;

    let stepNum = 1;
    const steps: string[] = [];

    steps.push(`${stepNum++}. Create and maintain a todo list for this complex task before doing implementation work. Keep it updated as you check resources, reserve compute, run the experiment, monitor progress, and submit results.`);

    steps.push(`${stepNum++}. Call synapse_list_compute_nodes to check available machines and GPUs before making any execution decision. Do not assume compute is available from memory or project text. Determine how many GPUs you need based on the experiment description.`);

    steps.push(`${stepNum++}. If enough GPUs are available, call synapse_reserve_gpus with experimentUuid "${experimentUuid}" and the gpuUuids to reserve them. If the reservation fails (another experiment reserved them first), go back to the compute check and re-check available GPUs. If not enough GPUs are available (or reservation keeps failing), report via synapse_report_experiment_progress with liveStatus "queuing" and you are done`);

    steps.push(`${stepNum++}. After a successful synapse_reserve_gpus call, call synapse_start_experiment with experimentUuid "${experimentUuid}" to mark the experiment as in-progress. Do not repeat gpuUuids here unless you intentionally skipped the standalone reservation step.`);

    steps.push(`${stepNum++}. call synapse_get_node_access_bundle with experimentUuid "${experimentUuid}" and the nodeUuid. Write the returned privateKeyPemBase64 to a local PEM file (chmod 600) and SSH using the returned host/user/port.`);

    if (hasRepo) {
      steps.push(`${stepNum++}. On the compute node, clone the repo: git clone <Clone URL above>. Then checkout the base branch: git checkout ${baseBranch}.`);
    }

    steps.push(`${stepNum++}. Execute the experiment on the compute node according to the experiment description. For long-running jobs, prefer launching the workload inside tmux so the process survives disconnects and you can re-attach later. If the workload writes Python stdout/stderr to a log file, run Python in unbuffered mode so logs appear in real time for monitoring. Prefer python -u (or PYTHONUNBUFFERED=1). If helpful, combine it with tee/stdout piping so progress is visible immediately instead of being trapped in a full buffer.`);

    steps.push(`${stepNum++}. For long-running experiments (training jobs, multi-hour evaluations), set up a cron job to monitor the work:
   a. Write a script to read the latest training/evaluation logs, extract key metrics(loss, accuracy, eval scores etc.) so that agent can summarize.
   b. Call synapse_report_experiment_progress with experimentUuid "${experimentUuid}" to report the latest metrics and deliver updates to the latest channel.
   c. On completion: git commit/push, call synapse_submit_experiment_results, remove cron job.
   For short experiments that you can monitor directly, skip the cron setup and proceed to the next steps manually.`);

    steps.push(`${stepNum++}. If you are monitoring the experiment directly (no cron), call synapse_report_experiment_progress with experimentUuid "${experimentUuid}" at each major step (data download, training start, each evaluation checkpoint, major metric change, etc.).`);

    if (hasRepo) {
      steps.push(`${stepNum++}. After the experiment completes (direct monitoring only), commit your changes and push. The project description may specify a branch strategy (e.g. single persistent branch, per-experiment branches, keep/discard workflow). Follow it. If not specified, decide: create a new branch for this experiment, or commit on the current branch — based on how the project organizes its code.`);
    }

    steps.push(`${stepNum++}. Call synapse_submit_experiment_results with experimentUuid "${experimentUuid}"${hasRepo ? ". Include experimentBranch and commitSha if you pushed code" : ""} to complete the experiment. This also releases the reserved GPUs. (Skip this step if a cron script was set up — the cron handles submission.)`);

    const firstExperimentSection = projectExperimentContext?.isFirstExperiment
      ? `\n${FIRST_EXPERIMENT_BEST_PRACTICE}\n`
      : "";

    const prompt = `[Synapse] Experiment assigned: ${n.entityTitle}

${SUBAGENT_DISPATCH_INSTRUCTION}

PRIORITY: The project description (Brief) below contains directives from the human researcher. These take the HIGHEST priority — if any instruction below conflicts with the project description, follow the project description.

${context}${description}${githubSection}
${firstExperimentSection}
Default steps (override with project description directives where applicable):
${steps.join("\n")}`;

    const budgetHours = experiment?.computeBudgetHours;
    const timeoutSeconds = budgetHours != null ? Math.ceil(budgetHours * 3600) : 7 * 24 * 3600;

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
    const experimentRevisionGuidance =
      n.entityType === "experiment"
        ? `If the feedback requires changing the experiment plan, first use synapse_update_experiment_status with status "draft", then use synapse_update_experiment_plan, and finally move it back with synapse_update_experiment_status status "pending_review".\n`
        : "";

    this.triggerAgent(
      `[Synapse] You were @mentioned in ${n.entityType} '${n.entityTitle}' (entityType: ${n.entityType}, entityUuid: ${n.entityUuid}, projectUuid: ${projectUuid}): ${n.message}\n` +
      `Review the ${n.entityType} content and use synapse_get_comments (targetType: "${n.entityType}", targetUuid: "${n.entityUuid}") to see the full conversation, then respond.\n` +
      experimentRevisionGuidance +
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
    // Detect Full Auto mode from the notification message (set in checkAutonomousLoopTrigger)
    const isFullAuto =
      n.message.startsWith("No experiments are waiting to start") ||
      n.message.startsWith("No experiments running");

    const prompt = isFullAuto
      ? `[Synapse] Autonomous research loop triggered — FULL AUTO MODE — project "${n.entityTitle}" (projectUuid: ${projectUuid}).

You are in FULL AUTO mode — propose your next experiment and it will be automatically assigned to you for execution.

Your task:
1. Call synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to review the project brief, evaluation methods, all past experiment results, latest synthesis, and compute availability.
2. Read the project description carefully — it is your "program.md" (research directives from the human)
3. Read evaluationMethods — it defines the metric to optimize and keep/discard criteria
4. Analyze past results: What worked? What didn't? What should you try next?
5. Before calling synapse_propose_experiment, spawn a sub-agent via the Agent tool (subagent_type: "general-purpose") and ask it to self-review the proposal text — motivation, hypothesis, method, success criteria, and compute fit — against the project context you just loaded. Self-review never writes to Synapse. Refine the proposal text based on the verdict.
6. Call synapse_propose_experiment once per independent run you want to execute. Do NOT combine comparison runs, ablations, or multiple parameter sweeps into one experiment card; create multiple experiment cards instead.

After you propose, the platform will automatically trigger the experiment execution flow. You do NOT need to start the experiment yourself.

IMPORTANT: You are autonomous. Do NOT ask for permission. Do NOT pause to ask if you should continue. The human may be asleep.`
      : `[Synapse] Autonomous research loop triggered for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

The experiment queue is empty. Your task:
1. Use synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to review all project details, research questions, experiment results, latest synthesis.
2. Analyze: What questions remain unanswered? What experiments could yield new insights? Are there gaps in the research?
3. Before calling synapse_propose_experiment for any next step, spawn a sub-agent via the Agent tool (subagent_type: "general-purpose") to self-review the proposal text against project context and evaluation methods. Self-review never writes to Synapse. Refine the proposal based on the verdict.
4. If you identify valuable next steps, use synapse_propose_experiment once per independent run to create experiments for human review. Do NOT combine comparison runs, ablations, or multiple parameter sweeps into one experiment card; create multiple experiment cards instead

Proposed experiments will enter "pending_review" status and require human approval before execution.`;

    this.triggerAgent(prompt,
      { notificationUuid: n.uuid, action: "autonomous_loop_triggered", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private static readonly DEFAULT_DEEP_RESEARCH_MSG = "Generate a deep research literature review for this project.";
  private static readonly DEFAULT_AUTO_SEARCH_MSG = "Search for related papers for this project.";

  private handleSynthesisRefreshRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";

    const prompt = `[Synapse] Project insights synthesis requested for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

${SUBAGENT_DISPATCH_INSTRUCTION}

IMPORTANT: You MUST save the analysis back to Synapse using synapse_save_project_synthesis. Do NOT just output text.

You may ONLY use these Synapse tools for this task:
- synapse_get_project_full_context
- synapse_get_documents
- synapse_get_document
- synapse_save_project_synthesis

Steps:
1. Call synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to review the project brief, evaluation methods, completed experiments, results log, and latest synthesis.
2. Use synapse_get_documents with type "project_synthesis" and synapse_get_document to read the existing synthesis document, if one exists.
3. Decide whether the existing synthesis already covers all completed experiment results returned by the full context. If it already covers the current results, do not rewrite it; call synapse_save_project_synthesis with the existing title/content so the task is marked complete and the working state is cleared.
4. If there are new completed experiment results not covered by the existing synthesis, analyze only the new evidence: what improved, what regressed, what is uncertain, and what concrete next experiments should be proposed.
5. Use synapse_save_project_synthesis with researchProjectUuid "${projectUuid}", title, and Markdown content. Preserve useful historical conclusions from the old synthesis and add the newest analysis above the older analysis, with clear sections for Summary, Evidence, Open Questions, and Recommended Next Experiments.

Additional instructions from the user:
${n.message}`;

    this.triggerAgent(prompt, {
      notificationUuid: n.uuid,
      action: "synthesis_refresh_requested",
      entityUuid: n.entityUuid,
      projectUuid,
      timeoutSeconds: 1200,
    });
  }

  private handleDeepResearchRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const hasCustomPrompt = n.message !== SynapseEventRouter.DEFAULT_DEEP_RESEARCH_MSG;

    const basePrompt = `[Synapse] Deep research literature review requested for project (projectUuid: ${projectUuid}).

${SUBAGENT_DISPATCH_INSTRUCTION}

IMPORTANT: You MUST save the report back to Synapse using synapse_save_deep_research_report. Do NOT just output text — the report must be saved via the tool call.

You may ONLY use these Synapse tools for this task:
- synapse_get_deep_research_report
- synapse_get_related_works
- synapse_get_research_project
- synapse_read_paper_brief
- synapse_read_paper_head
- synapse_read_paper_section
- synapse_read_paper_full
- synapse_save_deep_research_report
- synapse_complete_task

Steps:
1. Use synapse_get_deep_research_report with researchProjectUuid "${projectUuid}" to check if a previous report exists — if so, read it to understand what was covered before
2. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to get the full list of collected papers
3. Use synapse_get_research_project with researchProjectUuid "${projectUuid}" to understand the research objectives, datasets, and evaluation methods
4. For each paper with an arxivId, use progressive reading to understand its content:
   a. synapse_read_paper_head — get the paper structure and section TLDRs
   b. synapse_read_paper_section — read key sections relevant to the project (e.g. Introduction, Methods, Results, Conclusion)
   c. synapse_read_paper_full — only if needed for papers central to the research
5. Analyze how each paper relates to the project's goals — identify key methods, findings, and gaps in the literature
6. REQUIRED: Use synapse_save_deep_research_report with researchProjectUuid "${projectUuid}", title, and content (Markdown) to save the report. This creates v1 or updates to v2/v3 automatically.
7. REQUIRED: After saving the report, call synapse_complete_task with researchProjectUuid "${projectUuid}" and taskType "deep_research" to signal completion.

Writing guidelines:
- Base your review on actual paper content, not just abstracts
- Cite specific methods, results, and findings from the papers
- Identify research gaps and how they relate to the project objectives
- Organize thematically, not just paper-by-paper`;

    const prompt = hasCustomPrompt
      ? `${basePrompt}\n\nAdditional instructions from the user:\n${n.message}`
      : basePrompt;

    this.triggerAgent(prompt, {
      notificationUuid: n.uuid,
      action: "deep_research_requested",
      entityUuid: n.entityUuid,
      projectUuid,
      timeoutSeconds: 1800,
    });
  }

  private handleAutoSearchTriggered(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const hasCustomPrompt = n.message !== SynapseEventRouter.DEFAULT_AUTO_SEARCH_MSG;

    const basePrompt = `[Synapse] Paper search requested for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

You may ONLY use these Synapse tools for this task:
- synapse_get_related_works
- synapse_get_research_project
- synapse_search_papers
- synapse_read_paper_brief
- synapse_add_related_work
- synapse_complete_task

Steps:
1. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to get all collected papers — note their titles, topics, and coverage areas
2. Use synapse_get_research_project with researchProjectUuid "${projectUuid}" to understand the research objectives, datasets, and methods
3. Compare the existing paper titles against the project objectives — identify which topics or areas are NOT yet covered by collected papers
4. Based on the identified gaps, use synapse_search_papers to find new relevant academic papers — craft queries specifically targeting the missing areas
6. For each candidate paper with an arxivId, use synapse_read_paper_brief to check its TLDR and keywords — only add papers that are genuinely relevant and fill gaps
7. For each relevant paper, use synapse_add_related_work with researchProjectUuid "${projectUuid}" to add it (duplicates are automatically skipped — if isNew=false, the paper already existed)
8. Search with multiple query variations to maximize coverage, but call synapse_search_papers sequentially (one at a time) to avoid rate limits. Do NOT call synapse_search_papers more than 10 times total.
9. Focus on papers that fill gaps not covered by existing related works — do NOT search for topics already well-represented
10. REQUIRED: After finishing all searches, call synapse_complete_task with researchProjectUuid "${projectUuid}" and taskType "auto_search" to signal completion.`;

    const prompt = hasCustomPrompt
      ? `${basePrompt}\n\nAdditional instructions from the user:\n${n.message}`
      : basePrompt;

    this.triggerAgent(prompt, {
      notificationUuid: n.uuid,
      action: "auto_search_triggered",
      entityUuid: n.entityUuid,
      projectUuid,
      timeoutSeconds: 600,
    });
  }

  private handleExperimentPlanRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";

    this.triggerAgent(
      `[Synapse] A user created a quick experiment with the idea: "${n.entityTitle}" (experimentUuid: ${n.entityUuid}, projectUuid: ${projectUuid}).

Your task is to flesh out this experiment into a detailed plan. Follow these steps:

1. Immediately call synapse_update_experiment_status with experimentUuid "${n.entityUuid}", status "draft", liveStatus "writing", and a short liveMessage like "Drafting experiment plan"
2. Use synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to understand the research context, existing experiments, and research questions
3. Based on the one-line idea and the project context, draft a detailed experiment plan that includes:
   - Clear objective
   - Methodology and approach
   - Expected outcomes and evaluation criteria
   - Implementation steps
   - Any relevant compute or resource requirements
4. If the idea clearly relates to an existing research question, link it
5. Use synapse_update_experiment_plan with experimentUuid "${n.entityUuid}" to update the experiment with:
   - A refined title (concise but descriptive)
   - A detailed description (the full experiment plan)
   - researchQuestionUuid (if applicable)
   - priority (based on the project context)
6. Before publishing the experiment for human review, spawn a sub-agent via the Agent tool (subagent_type: "general-purpose") to self-review the plan. Pass the experimentUuid and project context in the sub-agent's prompt; ask it to call synapse_get_experiment, evaluate clarity of the objective, soundness of the methodology, measurability of success criteria, and realism of the compute estimate, then return a short verdict. Self-review never writes to Synapse. Apply revisions with synapse_update_experiment_plan if the verdict surfaces issues.
7. When the plan is ready, call synapse_update_experiment_status with experimentUuid "${n.entityUuid}" and status "pending_review" so the experiment moves into the review queue.
8. Write the plan in the same language as the project description.

Keep the plan actionable and specific enough that another agent could execute it.`,
      { notificationUuid: n.uuid, action: "experiment_plan_requested", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleExperimentRevisionRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "experiment");

    this.triggerAgent(
      `[Synapse] A reviewer sent experiment "${n.entityTitle}" back to draft for revision (experimentUuid: ${n.entityUuid}, projectUuid: ${projectUuid}).

Reviewer feedback: ${n.message}

Your task:
1. Use synapse_get_experiment with experimentUuid "${n.entityUuid}" to re-read the experiment.
2. Use synapse_get_comments with targetType "experiment" and targetUuid "${n.entityUuid}" to read the full feedback thread.
3. If the experiment is not already in draft, use synapse_update_experiment_status with status "draft" before editing the plan.
4. Revise the experiment's title/description to address the feedback.
5. Use synapse_update_experiment_plan (or the appropriate update tool) with experimentUuid "${n.entityUuid}" to save the revised plan.
6. Before resubmitting for review, spawn a sub-agent via the Agent tool (subagent_type: "general-purpose") to self-review the revised plan against the reviewer's feedback. Pass the experimentUuid in the sub-agent's prompt. Self-review never writes to Synapse. Apply additional revisions if needed.
7. When the revision is ready, use synapse_update_experiment_status with status "pending_review" so the reviewer can approve it.
` + mentionGuidance,
      { notificationUuid: n.uuid, action: "experiment_revision_requested", entityUuid: n.entityUuid, projectUuid }
    );
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
5. Use python to plot graphs to analyze and showcase results from different angles, attach it to the document markdown.
6. To embed figures, you MUST upload each local image to Synapse via synapse_upload_document_image (or HTTP POST /api/documents/:uuid/images) and reference it in the Markdown with the returned /api/documents/:uuid/images/... link. Do NOT use catbox, litterbox, imgur, or any other third-party image host — those links expire and are not reliably reachable from end users' browsers.
7. Use synapse_save_experiment_report with experimentUuid "${n.entityUuid}" and the full Markdown content to create or update the dedicated experiment result document for this experiment. Do NOT post the report as an experiment comment.

Keep the report focused on THIS experiment only — do not summarize the entire project.`,
      { notificationUuid: n.uuid, action: "experiment_report_requested", entityUuid: n.entityUuid, projectUuid }
    );
  }
}

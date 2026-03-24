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
          await this.handleTaskAssigned(notification);
          break;
        case "mentioned":
          this.handleMentioned(notification);
          break;
        case "elaboration_requested":
        case "hypothesis_formulation_requested":
          this.handleElaborationRequested(notification);
          break;
        case "elaboration_answered":
        case "hypothesis_formulation_answered":
          this.handleElaborationAnswered(notification);
          break;
        case "proposal_rejected":
        case "design_rejected":
          this.handleProposalRejected(notification);
          break;
        case "proposal_approved":
        case "design_approved":
          this.handleProposalApproved(notification);
          break;
        case "idea_claimed":
        case "research_question_claimed":
          this.handleIdeaClaimed(notification);
          break;
        case "task_verified":
        case "run_verified":
          this.handleTaskVerified(notification);
          break;
        case "task_reopened":
        case "run_reopened":
          this.handleTaskReopened(notification);
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

  private async handleTaskAssigned(n: NotificationDetail): Promise<void> {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "task");

    if (this.config.autoStart) {
      try {
        await this.mcpClient.callTool("synapse_claim_experiment_run", { runUuid: n.entityUuid });
        this.logger.info(`Auto-claimed task ${n.entityUuid}`);
      } catch (err) {
        this.logger.warn(`Failed to auto-claim task ${n.entityUuid}: ${err}`);
        // Still trigger agent even if claim fails — let the agent handle it
      }

      this.triggerAgent(
        `[Synapse] Experiment run assigned: ${n.entityTitle}. Run UUID: ${n.entityUuid}, Project UUID: ${projectUuid}. Use synapse_get_experiment_run to inspect details, then start work.\n${mentionGuidance}`,
        { notificationUuid: n.uuid, action: "task_assigned", entityUuid: n.entityUuid, projectUuid }
      );
    } else {
      this.triggerAgent(
        `[Synapse] Experiment run assigned: ${n.entityTitle}. Run UUID: ${n.entityUuid}, Project UUID: ${projectUuid}. Use synapse_get_experiment_run to review when ready.\n${mentionGuidance}`,
        { notificationUuid: n.uuid, action: "task_assigned", entityUuid: n.entityUuid, projectUuid }
      );
    }
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

  private handleElaborationRequested(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    this.triggerAgent(
      `[Synapse] Hypothesis formulation requested for idea '${n.entityTitle}' (ideaUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). Use synapse_get_hypothesis_formulation to review questions.`,
      { notificationUuid: n.uuid, action: "elaboration_requested", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleProposalRejected(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "proposal");

    this.triggerAgent(
      `[Synapse] Experiment design '${n.entityTitle}' was rejected (designUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). Review note: "${n.message}". ` +
      `Use synapse_get_experiment_designs and the design editor tools to revise the plan, then resubmit for approval.\n` +
      mentionGuidance,
      { notificationUuid: n.uuid, action: "proposal_rejected", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleProposalApproved(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "proposal");

    const reviewInfo = n.message.includes("Note: ") ? ` Review note: "${n.message.split("Note: ").pop()}"` : "";
    this.triggerAgent(
      `[Synapse] Experiment design '${n.entityTitle}' was approved (designUuid: ${n.entityUuid}, projectUuid: ${projectUuid})!${reviewInfo} New experiment runs may now be ready for work. ` +
      `Use synapse_get_unblocked_experiment_runs with researchProjectUuid: "${projectUuid}" to see what is ready to start.\n` +
      mentionGuidance,
      { notificationUuid: n.uuid, action: "proposal_approved", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleIdeaClaimed(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "idea");

    this.triggerAgent(
      `[Synapse] Idea '${n.entityTitle}' has been assigned to you (ideaUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). ` +
      `Use synapse_get_research_questions to review the idea context, then synapse_claim_research_question to start elaboration.\n` +
      mentionGuidance,
      { notificationUuid: n.uuid, action: "idea_claimed", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleTaskVerified(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    this.triggerAgent(
      `[Synapse] Experiment run '${n.entityTitle}' has been verified and is now done (runUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). ` +
      `Check if this unblocks more work by using synapse_get_unblocked_experiment_runs with researchProjectUuid "${projectUuid}".`,
      { notificationUuid: n.uuid, action: "task_verified", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleTaskReopened(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "task");

    this.triggerAgent(
      `[Synapse] Experiment run '${n.entityTitle}' has been reopened and needs rework (runUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). ` +
      `Use synapse_get_experiment_run to review the run and synapse_get_comments to see verification feedback, then fix the issues.\n${mentionGuidance}`,
      { notificationUuid: n.uuid, action: "task_reopened", entityUuid: n.entityUuid, projectUuid }
    );
  }

  private handleElaborationAnswered(n: NotificationDetail): void {
    const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
    const mentionGuidance = this.buildMentionGuidance(n, "idea");

    this.triggerAgent(
      `[Synapse] Hypothesis formulation answers submitted for idea '${n.entityTitle}' (ideaUuid: ${n.entityUuid}, projectUuid: ${projectUuid}). ` +
      `Review the answers with synapse_get_hypothesis_formulation, then either resolve the round or start a follow-up round.\n\n` +
      `After reviewing, @mention the answerer to ask if they have any further questions before you proceed.\n` +
      mentionGuidance,
      { notificationUuid: n.uuid, action: "elaboration_answered", entityUuid: n.entityUuid, projectUuid }
    );
  }
}

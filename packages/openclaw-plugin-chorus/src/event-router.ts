import type { ChorusMcpClient } from "./mcp-client.js";
import type { ChorusPluginConfig } from "./config.js";
import type { SseNotificationEvent } from "./sse-listener.js";

export interface ChorusEventRouterOptions {
  mcpClient: ChorusMcpClient;
  config: ChorusPluginConfig;
  triggerAgent: (message: string, metadata?: Record<string, unknown>) => void;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

/**
 * Notification detail returned from chorus_get_notifications.
 * Only the fields we need for routing.
 */
interface NotificationDetail {
  uuid: string;
  projectUuid: string;
  entityType: string;
  entityUuid: string;
  entityTitle: string;
  action: string;
  message: string;
  actorName: string;
}

export class ChorusEventRouter {
  private readonly mcpClient: ChorusMcpClient;
  private readonly config: ChorusPluginConfig;
  private readonly triggerAgent: ChorusEventRouterOptions["triggerAgent"];
  private readonly logger: ChorusEventRouterOptions["logger"];
  private readonly projectFilter: Set<string>;

  constructor(opts: ChorusEventRouterOptions) {
    this.mcpClient = opts.mcpClient;
    this.config = opts.config;
    this.triggerAgent = opts.triggerAgent;
    this.logger = opts.logger;
    this.projectFilter = new Set(opts.config.projectUuids);
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
    const result = await this.mcpClient.callTool("chorus_get_notifications", {
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
    if (this.projectFilter.size > 0 && !this.projectFilter.has(notification.projectUuid)) {
      this.logger.info(
        `Notification for project ${notification.projectUuid} filtered out`
      );
      return;
    }

    // Route based on action (which corresponds to notificationType)
    try {
      switch (notification.action) {
        case "task_assigned":
          await this.handleTaskAssigned(notification);
          break;
        case "mentioned":
          this.handleMentioned(notification);
          break;
        case "elaboration_requested":
          this.handleElaborationRequested(notification);
          break;
        default:
          this.logger.info(`Unhandled notification action: "${notification.action}"`);
          break;
      }
    } catch (err) {
      this.logger.error(`Error handling ${notification.action} notification: ${err}`);
    }
  }

  private async handleTaskAssigned(n: NotificationDetail): Promise<void> {
    if (this.config.autoStart) {
      try {
        await this.mcpClient.callTool("chorus_claim_task", { taskUuid: n.entityUuid });
        this.logger.info(`Auto-claimed task ${n.entityUuid}`);
      } catch (err) {
        this.logger.warn(`Failed to auto-claim task ${n.entityUuid}: ${err}`);
        // Still trigger agent even if claim fails — let the agent handle it
      }

      this.triggerAgent(
        `[Chorus] Task assigned: ${n.entityTitle}. Task UUID: ${n.entityUuid}. Use chorus_get_task to see details and begin work.`,
        { notificationUuid: n.uuid, action: "task_assigned", entityUuid: n.entityUuid }
      );
    } else {
      this.triggerAgent(
        `[Chorus] Task assigned: ${n.entityTitle}. Task UUID: ${n.entityUuid}. Use chorus_get_task to review when ready.`,
        { notificationUuid: n.uuid, action: "task_assigned", entityUuid: n.entityUuid }
      );
    }
  }

  private handleMentioned(n: NotificationDetail): void {
    this.triggerAgent(
      `[Chorus] You were @mentioned in ${n.entityType} '${n.entityTitle}': ${n.message}`,
      { notificationUuid: n.uuid, action: "mentioned", entityUuid: n.entityUuid }
    );
  }

  private handleElaborationRequested(n: NotificationDetail): void {
    this.triggerAgent(
      `[Chorus] Elaboration requested for idea '${n.entityTitle}'. Use chorus_get_elaboration to review questions.`,
      { notificationUuid: n.uuid, action: "elaboration_requested", entityUuid: n.entityUuid }
    );
  }
}

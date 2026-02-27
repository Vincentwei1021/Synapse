// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenClawPluginApi = any;

import { chorusConfigSchema, type ChorusPluginConfig } from "./config.js";
import { ChorusMcpClient } from "./mcp-client.js";
import { ChorusSseListener } from "./sse-listener.js";
import { ChorusEventRouter } from "./event-router.js";
import { registerPmTools } from "./tools/pm-tools.js";
import { registerDevTools } from "./tools/dev-tools.js";
import { registerCommonTools } from "./tools/common-tools.js";
import { registerChorusCommands } from "./commands.js";

const plugin = {
  id: "chorus",
  name: "Chorus",
  description:
    "Chorus AI-DLC collaboration platform — SSE real-time events + MCP tool integration",
  configSchema: chorusConfigSchema,

  register(api: OpenClawPluginApi) {
    const config = api.pluginConfig as ChorusPluginConfig;
    const logger = api.logger;

    logger.info(
      `Chorus plugin initializing — ${config.chorusUrl} (${config.projectUuids.length || "all"} projects)`
    );

    // --- MCP Client ---
    const mcpClient = new ChorusMcpClient({
      chorusUrl: config.chorusUrl,
      apiKey: config.apiKey,
      logger,
    });

    // --- Event Router ---
    const eventRouter = new ChorusEventRouter({
      mcpClient,
      config,
      logger,
      triggerAgent: (message: string, metadata?: Record<string, unknown>) => {
        // Inject event as system message for the agent to process.
        // OpenClaw's enqueueSystemEvent or equivalent will be wired here.
        // For now, use the runtime channel reply mechanism if available,
        // otherwise log the trigger for manual handling.
        if (api.runtime?.channel?.reply?.enqueueSystemEvent) {
          api.runtime.channel.reply.enqueueSystemEvent({
            type: "chorus_event",
            text: message,
            metadata,
          });
        } else {
          logger.info(`[Agent Trigger] ${message}`);
        }
      },
    });

    // --- SSE Listener (background service) ---
    let sseListener: ChorusSseListener | null = null;

    api.registerService({
      id: "chorus-sse",
      async start() {
        sseListener = new ChorusSseListener({
          chorusUrl: config.chorusUrl,
          apiKey: config.apiKey,
          logger,
          onEvent: (event) => eventRouter.dispatch(event),
          onReconnect: async () => {
            // Back-fill missed notifications after reconnect
            try {
              const result = (await mcpClient.callTool("chorus_get_notifications", {
                status: "unread",
                autoMarkRead: false,
              })) as { notifications?: Array<{ uuid: string }> } | null;
              const count = result?.notifications?.length ?? 0;
              if (count > 0) {
                logger.info(`SSE reconnect: ${count} unread notifications to process`);
              }
            } catch (err) {
              logger.warn(`Failed to back-fill notifications: ${err}`);
            }
          },
        });
        await sseListener.connect();
      },
      async stop() {
        sseListener?.disconnect();
        await mcpClient.disconnect();
      },
    });

    // --- Tools ---
    registerPmTools(api, mcpClient);
    registerDevTools(api, mcpClient);
    registerCommonTools(api, mcpClient);

    // --- Commands ---
    registerChorusCommands(api, mcpClient, () => sseListener?.status ?? "disconnected");
  },
};

export default plugin;

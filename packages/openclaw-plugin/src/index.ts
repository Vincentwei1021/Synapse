// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenClawPluginApi = any;

import { chorusConfigSchema, type ChorusPluginConfig } from "./config.js";
import { ChorusMcpClient } from "./mcp-client.js";
import { ChorusSseListener } from "./sse-listener.js";
import { ChorusEventRouter, GenericEventRouter, type IEventRouter } from "./event-router.js";
import { registerPmTools } from "./tools/pm-tools.js";
import { registerDevTools } from "./tools/dev-tools.js";
import { registerCommonTools } from "./tools/common-tools.js";
import { registerChorusCommands } from "./commands.js";

/**
 * Trigger the OpenClaw agent by posting a system event to the gateway's
 * /hooks/wake endpoint. This enqueues the text into the agent's prompt
 * and triggers an immediate heartbeat so the agent processes it right away.
 */
async function wakeAgent(
  gatewayUrl: string,
  hooksToken: string,
  text: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
) {
  try {
    const res = await fetch(`${gatewayUrl}/hooks/wake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hooksToken}`,
      },
      body: JSON.stringify({ text, mode: "now" }),
    });
    if (!res.ok) {
      logger.warn(`Wake agent failed: HTTP ${res.status}`);
    } else {
      logger.info(`Agent woken: ${text.slice(0, 80)}...`);
    }
  } catch (err) {
    logger.warn(`Wake agent error: ${err}`);
  }
}

const plugin = {
  id: "chorus-openclaw-plugin",
  name: "Chorus",
  description:
    "Chorus AI-DLC collaboration platform — SSE real-time events + MCP tool integration",
  configSchema: chorusConfigSchema,

  register(api: OpenClawPluginApi) {
    const rawConfig = api.pluginConfig ?? {};
    const config: ChorusPluginConfig = {
      chorusUrl: rawConfig.chorusUrl,
      apiKey: rawConfig.apiKey,
      sseUrl: rawConfig.sseUrl,
      authHeader: rawConfig.authHeader ?? "Authorization",
      authToken: rawConfig.authToken,
      projectUuids: rawConfig.projectUuids ?? [],
      autoStart: rawConfig.autoStart ?? true,
      preset: rawConfig.preset,
    };
    const logger = api.logger;

    // --- Resolve preset with backward compatibility ---
    let preset: "chorus" | "generic";
    if (config.preset) {
      preset = config.preset;
    } else if (config.chorusUrl && config.apiKey) {
      preset = "chorus";
    } else if (config.sseUrl) {
      preset = "generic";
    } else {
      preset = "chorus"; // default
    }

    // Resolve gateway URL and hooks token from OpenClaw config
    const gatewayPort = api.config?.gateway?.port ?? 18789;
    const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
    const hooksToken = api.config?.hooks?.token ?? "";

    const triggerAgent = (message: string, _metadata?: Record<string, unknown>) => {
      if (hooksToken) {
        wakeAgent(gatewayUrl, hooksToken, message, logger);
      } else {
        logger.warn(
          `Cannot wake agent — gateway.auth.token not configured. Event: ${message.slice(0, 100)}`
        );
      }
    };

    // --- SSE Listener (background service) ---
    let sseListener: ChorusSseListener | null = null;

    if (preset === "chorus") {
      // -----------------------------------------------------------------------
      // Chorus preset
      // -----------------------------------------------------------------------
      if (!config.chorusUrl || !config.apiKey) {
        logger.error("Chorus preset requires chorusUrl and apiKey in config");
        return;
      }

      const sseUrl = `${config.chorusUrl}/api/events/notifications`;
      const authHeader = "Authorization";
      const authToken = `Bearer ${config.apiKey}`;

      logger.info(
        `[Chorus] plugin initializing (chorus mode) — ${config.chorusUrl} (${config.projectUuids?.length || "all"} projects)`
      );

      // --- MCP Client ---
      const mcpClient = new ChorusMcpClient({
        chorusUrl: config.chorusUrl,
        apiKey: config.apiKey,
        logger,
      });

      // --- Event Router ---
      const eventRouter: IEventRouter = new ChorusEventRouter({
        mcpClient,
        config,
        logger,
        triggerAgent,
      });

      api.registerService({
        id: "chorus-sse",
        async start() {
          sseListener = new ChorusSseListener({
            sseUrl,
            authHeader,
            authToken,
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
    } else {
      // -----------------------------------------------------------------------
      // Generic SSE preset
      // -----------------------------------------------------------------------
      if (!config.sseUrl || !config.authToken) {
        logger.error("Generic preset requires sseUrl and authToken in config");
        return;
      }

      const sseUrl = config.sseUrl;
      const authHeader = config.authHeader ?? "Authorization";
      const authToken = config.authToken;

      logger.info(
        `[Generic SSE] plugin initializing — ${sseUrl}`
      );

      // --- Event Router (no MCP client needed) ---
      const eventRouter: IEventRouter = new GenericEventRouter({
        triggerAgent,
        logger,
      });

      api.registerService({
        id: "chorus-sse",
        async start() {
          sseListener = new ChorusSseListener({
            sseUrl,
            authHeader,
            authToken,
            logger,
            onEvent: (event) => eventRouter.dispatch(event),
            onReconnect: async () => {
              logger.info("SSE reconnected (generic mode)");
            },
          });
          await sseListener.connect();
        },
        async stop() {
          sseListener?.disconnect();
        },
      });
    }
  },
};

export default plugin;

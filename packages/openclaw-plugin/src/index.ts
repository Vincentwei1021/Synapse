// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenClawPluginApi = any;

import { synapseConfigSchema, type SynapsePluginConfig, validateConfigWithWarnings } from "./config.js";
import { SynapseMcpClient } from "./mcp-client.js";
import { SynapseSseListener } from "./sse-listener.js";
import { SynapseEventRouter } from "./event-router.js";
import { registerCommonTools } from "./tools/common-tools.js";
import { registerSynapseCommands } from "./commands.js";

/**
 * Trigger the OpenClaw agent by dispatching an isolated agent turn through
 * the gateway's /hooks/agent endpoint. This treats the Synapse assignment as
 * a primary prompt instead of a side-channel wake event.
 */
const DEFAULT_TIMEOUT_SECONDS = 24 * 3600; // 24 hours for unlimited budget

async function wakeAgent(
  gatewayUrl: string,
  hooksToken: string,
  text: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
  timeoutSeconds?: number,
) {
  try {
    const res = await fetch(`${gatewayUrl}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hooksToken}`,
      },
      body: JSON.stringify({
        message: text,
        name: "Synapse",
        wakeMode: "now",
        deliver: false,
        timeoutSeconds: timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
      }),
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
  id: "synapse-openclaw-plugin",
  name: "Synapse",
  description:
    "Synapse research orchestration platform — SSE real-time events + MCP tool integration",
  configSchema: synapseConfigSchema,

  register(api: OpenClawPluginApi) {
    const rawConfig = api.pluginConfig ?? {};
    const config: SynapsePluginConfig = {
      synapseUrl: rawConfig.synapseUrl || undefined,
      apiKey: rawConfig.apiKey || undefined,
      projectUuids: rawConfig.projectUuids ?? [],
      autoStart: rawConfig.autoStart ?? true,
    };
    const logger = api.logger;

    if (!validateConfigWithWarnings(config, logger)) {
      return;
    }

    // After validateConfigWithWarnings, synapseUrl and apiKey are guaranteed present
    const synapseUrl = config.synapseUrl!;
    const apiKey = config.apiKey!;

    // Resolve gateway URL and hooks token from OpenClaw config
    const gatewayPort = api.config?.gateway?.port ?? 18789;
    const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
    const hooksToken = api.config?.hooks?.token ?? "";

    logger.info(
      `Synapse plugin initializing — ${synapseUrl} (${config.projectUuids?.length || "all"} projects)`
    );

    // --- MCP Client ---
    const mcpClient = new SynapseMcpClient({
      synapseUrl,
      apiKey,
      logger,
    });

    // --- Event Router ---
    const eventRouter = new SynapseEventRouter({
      mcpClient,
      config,
      logger,
      triggerAgent: (message: string, metadata?: Record<string, unknown>) => {
        const timeoutSeconds = metadata?.timeoutSeconds as number | undefined;
        // Use /hooks/agent to create an isolated agent turn for Synapse work.
        if (hooksToken) {
          wakeAgent(gatewayUrl, hooksToken, message, logger, timeoutSeconds);
        } else {
          logger.warn(
            `[Synapse] Cannot wake agent — hooks.token not configured. Event: ${message.slice(0, 100)}`
          );
        }
      },
    });

    // --- SSE Listener (background service) ---
    let sseListener: SynapseSseListener | null = null;

    api.registerService({
      id: "synapse-sse",
      async start() {
        sseListener = new SynapseSseListener({
          synapseUrl,
          apiKey,
          logger,
          onEvent: (event) => eventRouter.dispatch(event),
          onReconnect: async () => {
            // Back-fill missed notifications after reconnect
            try {
              const result = (await mcpClient.callTool("synapse_get_notifications", {
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

    // --- Tools (all tools available to all agents) ---
    registerCommonTools(api, mcpClient);

    // --- Commands ---
    registerSynapseCommands(api, mcpClient, () => sseListener?.status ?? "disconnected");
  },
};

export default plugin;

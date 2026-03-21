import { z } from "zod";

export const CONFIG_FILE_PATH = "~/.openclaw/openclaw.json";
export const CONFIG_KEY_PATH = "plugins.entries.synapse-openclaw-plugin.config";

export const synapseConfigSchema = z.object({
  synapseUrl: z
    .string()
    .url()
    .optional()
    .describe("Synapse server URL (e.g. https://synapse.example.com)"),
  apiKey: z
    .string()
    .startsWith("syn_")
    .optional()
    .describe("Synapse API Key (syn_ prefix)"),
  projectUuids: z
    .array(z.string().uuid())
    .optional()
    .default([])
    .describe("Project UUIDs to monitor. Empty = all projects"),
  autoStart: z
    .boolean()
    .optional()
    .default(true)
    .describe("Auto-claim and start work on task_assigned events"),
});

export type SynapsePluginConfig = z.infer<typeof synapseConfigSchema>;

/**
 * Check required config fields and warn about missing ones.
 * Returns true if all required fields are present, false otherwise.
 */
export function validateConfigWithWarnings(
  config: SynapsePluginConfig,
  logger: { warn: (msg: string) => void },
): boolean {
  const missing: string[] = [];

  if (!config.synapseUrl) {
    missing.push(`  - "synapseUrl": set at ${CONFIG_KEY_PATH}.synapseUrl in ${CONFIG_FILE_PATH}`);
  }
  if (!config.apiKey) {
    missing.push(`  - "apiKey": set at ${CONFIG_KEY_PATH}.apiKey in ${CONFIG_FILE_PATH}`);
  }

  if (missing.length > 0) {
    logger.warn(
      `[Synapse] Plugin is missing required configuration. Features will be disabled until configured:\n` +
      missing.join("\n")
    );
    return false;
  }
  return true;
}

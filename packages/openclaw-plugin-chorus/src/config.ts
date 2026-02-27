import { z } from "zod";

export const chorusConfigSchema = z.object({
  chorusUrl: z
    .string()
    .url()
    .describe("Chorus server URL (e.g. https://chorus.example.com)"),
  apiKey: z
    .string()
    .startsWith("cho_")
    .describe("Chorus API Key (cho_ prefix)"),
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

export type ChorusPluginConfig = z.infer<typeof chorusConfigSchema>;

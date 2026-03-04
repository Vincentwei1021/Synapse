import { z } from "zod";

export const chorusConfigSchema = z.object({
  // --- Preset selector ---
  preset: z
    .enum(["chorus", "generic"])
    .optional()
    .default("chorus")
    .describe("Preset mode: 'chorus' for Chorus platform, 'generic' for any SSE source"),

  // --- Chorus preset (backward-compatible) ---
  chorusUrl: z
    .string()
    .url()
    .optional()
    .describe("Chorus server URL (e.g. https://chorus.example.com). Required for chorus preset."),
  apiKey: z
    .string()
    .optional()
    .describe("Chorus API Key. Required for chorus preset."),

  // --- Generic preset fields ---
  sseUrl: z
    .string()
    .url()
    .optional()
    .describe("Full SSE endpoint URL. Required for generic preset."),
  authHeader: z
    .string()
    .optional()
    .default("Authorization")
    .describe("HTTP header name for authentication (default: 'Authorization')"),
  authToken: z
    .string()
    .optional()
    .describe("Authentication token value (any format). Required for generic preset."),

  // --- Shared fields ---
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

import { randomUUID } from "node:crypto";

export interface SynapseAgentTriggerMetadata {
  notificationUuid?: string;
  action?: string;
  entityType?: string;
  entityUuid?: string;
  projectUuid?: string;
  timeoutSeconds?: number;
}

export interface SynapseTriggerLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface SynapseRuntimeAgentApi {
  runtime?: {
    config?: {
      loadConfig?: () => unknown;
    };
    agent?: {
      resolveAgentWorkspaceDir?: (config: unknown, agentId?: string) => string;
      ensureAgentWorkspace?: (params?: {
        dir?: string;
        ensureBootstrapFiles?: boolean;
      }) => Promise<{ dir: string }>;
      session?: {
        resolveStorePath?: (store?: string, opts?: { agentId?: string }) => string;
        loadSessionStore?: (storePath: string) => Record<string, Record<string, unknown>>;
        resolveSessionFilePath?: (
          sessionId: string,
          entry?: { sessionFile?: string },
          opts?: { agentId?: string },
        ) => string;
        saveSessionStore?: (
          storePath: string,
          store: Record<string, Record<string, unknown>>,
          opts?: { activeSessionKey?: string },
        ) => Promise<void>;
      };
      runEmbeddedPiAgent?: (params: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

const DEFAULT_TIMEOUT_SECONDS = 7 * 24 * 3600;

function normalizeIdentityPart(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

export function buildSynapseRunIdentity(metadata?: SynapseAgentTriggerMetadata): {
  lane: string;
  sessionId: string;
  sessionKey: string;
} {
  const scope = normalizeIdentityPart(metadata?.entityType ?? metadata?.action, "event");
  const subject = normalizeIdentityPart(
    metadata?.entityUuid ?? metadata?.projectUuid ?? metadata?.notificationUuid,
    "dispatch",
  );

  return {
    lane: `synapse:${scope}:${subject}`,
    sessionId: `synapse-${scope}-${subject}`,
    sessionKey: `synapse:${scope}:${subject}`,
  };
}

function resolveTimeoutMs(timeoutSeconds?: number): number {
  const seconds = typeof timeoutSeconds === "number" && timeoutSeconds > 0
    ? timeoutSeconds
    : DEFAULT_TIMEOUT_SECONDS;
  return Math.ceil(seconds * 1000);
}

export async function triggerSynapseAgentTurn(params: {
  api: SynapseRuntimeAgentApi;
  logger: SynapseTriggerLogger;
  message: string;
  metadata?: SynapseAgentTriggerMetadata;
}): Promise<void> {
  const runtimeAgent = params.api.runtime?.agent;
  const runtimeConfig = params.api.runtime?.config;

  if (
    !runtimeAgent?.resolveAgentWorkspaceDir ||
    !runtimeAgent.ensureAgentWorkspace ||
    !runtimeAgent.session?.resolveStorePath ||
    !runtimeAgent.session.loadSessionStore ||
    !runtimeAgent.session.resolveSessionFilePath ||
    !runtimeAgent.session.saveSessionStore ||
    !runtimeAgent.runEmbeddedPiAgent ||
    !runtimeConfig?.loadConfig
  ) {
    params.logger.warn("[Synapse] Embedded runtime APIs are unavailable; cannot dispatch agent turn");
    return;
  }

  const { lane, sessionId, sessionKey } = buildSynapseRunIdentity(params.metadata);
  const cfg = runtimeConfig.loadConfig();
  const workspaceDir = runtimeAgent.resolveAgentWorkspaceDir(cfg, undefined);

  await runtimeAgent.ensureAgentWorkspace({ dir: workspaceDir });

  const storePath = runtimeAgent.session.resolveStorePath(undefined, { agentId: undefined });
  const store = runtimeAgent.session.loadSessionStore(storePath);
  const existingEntry = store[sessionKey];
  const sessionFile = runtimeAgent.session.resolveSessionFilePath(
    sessionId,
    existingEntry ? { sessionFile: existingEntry.sessionFile as string | undefined } : undefined,
    { agentId: undefined },
  );

  store[sessionKey] = {
    ...existingEntry,
    sessionId,
    sessionFile,
    updatedAt: Date.now(),
    systemSent: true,
    label: "Synapse",
    channel: "synapse",
    subject: params.metadata?.entityType ?? params.metadata?.action ?? "event",
  };

  await runtimeAgent.session.saveSessionStore(storePath, store, {
    activeSessionKey: sessionKey,
  });

  await runtimeAgent.runEmbeddedPiAgent({
    sessionId,
    sessionKey,
    sessionFile,
    workspaceDir,
    config: cfg,
    prompt: params.message,
    trigger: "cron",
    timeoutMs: resolveTimeoutMs(params.metadata?.timeoutSeconds),
    runId: randomUUID(),
    lane,
  });

  params.logger.info(
    `[Synapse] Agent dispatched via embedded runtime (${sessionKey})`,
  );
}

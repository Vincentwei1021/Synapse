import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSynapseRunIdentity, triggerSynapseAgentTurn } from "./runtime-agent.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe("runtime-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a stable per-entity session identity", () => {
    expect(
      buildSynapseRunIdentity({
        entityType: "experiment",
        entityUuid: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toEqual({
      lane: "synapse:experiment:550e8400-e29b-41d4-a716-446655440000",
      sessionId: "synapse-experiment-550e8400-e29b-41d4-a716-446655440000",
      sessionKey: "synapse:experiment:550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("uses a per-notification identity for mentions", () => {
    expect(
      buildSynapseRunIdentity({
        action: "mentioned",
        entityType: "experiment",
        entityUuid: "experiment-123",
        notificationUuid: "notification-456",
      }),
    ).toEqual({
      lane: "synapse:experiment:notification-456",
      sessionId: "synapse-experiment-notification-456",
      sessionKey: "synapse:experiment:notification-456",
    });
  });

  it("dispatches through embedded runtime with a dedicated lane and session", async () => {
    const logger = createLogger();
    const loadConfig = vi.fn(() => ({ session: { store: "/tmp/sessions.json" } }));
    const resolveAgentWorkspaceDir = vi.fn(() => "/tmp/openclaw-workspace");
    const ensureAgentWorkspace = vi.fn(async () => ({ dir: "/tmp/openclaw-workspace" }));
    const resolveStorePath = vi.fn(() => "/tmp/sessions.json");
    const loadSessionStore = vi.fn(() => ({}));
    const resolveSessionFilePath = vi.fn(() => "/tmp/transcripts/session.jsonl");
    const saveSessionStore = vi.fn(async () => undefined);
    const runEmbeddedPiAgent = vi.fn(async () => ({ ok: true }));

    await triggerSynapseAgentTurn({
      api: {
        runtime: {
          config: { loadConfig },
          agent: {
            resolveAgentWorkspaceDir,
            ensureAgentWorkspace,
            session: {
              resolveStorePath,
              loadSessionStore,
              resolveSessionFilePath,
              saveSessionStore,
            },
            runEmbeddedPiAgent,
          },
        },
      },
      logger,
      message: "Run the experiment",
      metadata: {
        entityType: "experiment",
        entityUuid: "experiment-123",
        timeoutSeconds: 90,
      },
    });

    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(resolveAgentWorkspaceDir).toHaveBeenCalledWith({ session: { store: "/tmp/sessions.json" } }, undefined);
    expect(ensureAgentWorkspace).toHaveBeenCalledWith({ dir: "/tmp/openclaw-workspace" });
    expect(resolveStorePath).toHaveBeenCalledWith(undefined, { agentId: undefined });
    expect(resolveSessionFilePath).toHaveBeenCalledWith(
      "synapse-experiment-experiment-123",
      undefined,
      { agentId: undefined },
    );
    expect(saveSessionStore).toHaveBeenCalledWith(
      "/tmp/sessions.json",
      expect.objectContaining({
        "synapse:experiment:experiment-123": expect.objectContaining({
          sessionId: "synapse-experiment-experiment-123",
          sessionFile: "/tmp/transcripts/session.jsonl",
          systemSent: true,
          label: "Synapse",
        }),
      }),
      { activeSessionKey: "synapse:experiment:experiment-123" },
    );
    expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "synapse-experiment-experiment-123",
        sessionKey: "synapse:experiment:experiment-123",
        sessionFile: "/tmp/transcripts/session.jsonl",
        workspaceDir: "/tmp/openclaw-workspace",
        prompt: "Run the experiment",
        trigger: "cron",
        timeoutMs: 90000,
        lane: "synapse:experiment:experiment-123",
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "[Synapse] Agent dispatched via embedded runtime (synapse:experiment:experiment-123)",
    );
  });

  it("reuses an existing session transcript path when present", async () => {
    const logger = createLogger();
    const saveSessionStore = vi.fn(async () => undefined);
    const runEmbeddedPiAgent = vi.fn(async () => ({ ok: true }));

    await triggerSynapseAgentTurn({
      api: {
        runtime: {
          config: { loadConfig: () => ({}) },
          agent: {
            resolveAgentWorkspaceDir: () => "/tmp/openclaw-workspace",
            ensureAgentWorkspace: async () => ({ dir: "/tmp/openclaw-workspace" }),
            session: {
              resolveStorePath: () => "/tmp/sessions.json",
              loadSessionStore: () => ({
                "synapse:research_project:project-1": {
                  sessionFile: "/tmp/transcripts/existing.jsonl",
                },
              }),
              resolveSessionFilePath: vi.fn(() => "/tmp/transcripts/existing.jsonl"),
              saveSessionStore,
            },
            runEmbeddedPiAgent,
          },
        },
      },
      logger,
      message: "Analyze the project",
      metadata: {
        action: "autonomous_loop_triggered",
        entityType: "research_project",
        entityUuid: "project-1",
      },
    });

    expect(saveSessionStore).toHaveBeenCalledWith(
      "/tmp/sessions.json",
      expect.objectContaining({
        "synapse:research_project:project-1": expect.objectContaining({
          sessionFile: "/tmp/transcripts/existing.jsonl",
        }),
      }),
      { activeSessionKey: "synapse:research_project:project-1" },
    );
    expect(runEmbeddedPiAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "synapse:research_project:project-1",
        lane: "synapse:research_project:project-1",
      }),
    );
  });
});

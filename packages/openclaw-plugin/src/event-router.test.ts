import { beforeEach, describe, expect, it, vi } from "vitest";
import { SynapseEventRouter } from "./event-router.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("SynapseEventRouter", () => {
  const triggerAgent = vi.fn();
  const callTool = vi.fn();
  const logger = createLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes experiment assignments with full context and unlimited budget text", async () => {
    callTool
      .mockResolvedValueOnce({
        notifications: [
          {
            uuid: "notification-1",
            researchProjectUuid: "project-1",
            entityType: "experiment",
            entityUuid: "experiment-1",
            entityTitle: "Train the baseline",
            action: "task_assigned",
            message: "Assigned to you",
            actorType: "user",
            actorUuid: "user-1",
            actorName: "Alice",
          },
        ],
      })
      .mockResolvedValueOnce({
        experiment: {
          uuid: "experiment-1",
          researchProjectUuid: "project-1",
          title: "Train the baseline",
          description: "Run the first baseline.",
          priority: "high",
          computeBudgetHours: null,
          attachments: [{ originalName: "spec.md" }],
          researchQuestion: { uuid: "question-1", title: "Why is recall dropping?" },
          parentQuestionExperiments: [],
        },
      })
      .mockResolvedValueOnce({
        uuid: "project-1",
        name: "Recall recovery",
        description: "Improve retrieval quality",
        goal: "Raise recall by 5 points",
        datasets: ["train.jsonl"],
        evaluationMethods: ["recall@10"],
      });

    const router = new SynapseEventRouter({
      mcpClient: { callTool } as never,
      config: {
        synapseUrl: "http://synapse.local",
        apiKey: "syn_key",
        autoStart: true,
        projectUuids: [],
      },
      triggerAgent,
      logger,
    });

    await (router as unknown as { fetchAndRoute: (notificationUuid: string) => Promise<void> }).fetchAndRoute("notification-1");

    expect(triggerAgent).toHaveBeenCalledTimes(1);
    const [prompt, metadata] = triggerAgent.mock.calls[0];
    expect(prompt).toContain("Experiment assigned: Train the baseline");
    expect(prompt).toContain("Time limit: Unlimited");
    expect(prompt).toContain("post a comment on this experiment");
    expect(prompt).toContain("@[Alice](user:user-1)");
    expect(prompt).toContain("synapse_report_experiment_progress");
    expect(prompt).toContain("set up automated monitoring without cron");
    expect(prompt).toContain("sleep 60 seconds between checks");
    expect(prompt).toContain("Never let the sleep interval exceed 30 minutes");
    expect(prompt).toContain("run Python in unbuffered mode");
    expect(prompt).toContain("python -u");
    expect(prompt).toContain("PYTHONUNBUFFERED=1");
    expect(prompt).toContain("prefer launching the workload inside tmux");
    expect(prompt).toContain("prefer tmux for long jobs");
    expect(prompt).not.toContain("Create a cron job");
    expect(metadata).toMatchObject({
      action: "task_assigned",
      entityType: "experiment",
      entityUuid: "experiment-1",
      projectUuid: "project-1",
    });
  });

  it("skips notifications outside the configured project filter", async () => {
    callTool.mockResolvedValueOnce({
      notifications: [
        {
          uuid: "notification-2",
          researchProjectUuid: "project-2",
          entityType: "experiment",
          entityUuid: "experiment-2",
          entityTitle: "Ignored experiment",
          action: "task_assigned",
          message: "Assigned to you",
          actorType: "user",
          actorUuid: "user-2",
          actorName: "Bob",
        },
      ],
    });

    const router = new SynapseEventRouter({
      mcpClient: { callTool } as never,
      config: {
        synapseUrl: "http://synapse.local",
        apiKey: "syn_key",
        autoStart: true,
        projectUuids: ["project-allowed"],
      },
      triggerAgent,
      logger,
    });

    await (router as unknown as { fetchAndRoute: (notificationUuid: string) => Promise<void> }).fetchAndRoute("notification-2");

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Notification for project project-2 filtered out");
  });

  it("routes autonomous loop triggered events", async () => {
    callTool.mockResolvedValueOnce({
      notifications: [
        {
          uuid: "notification-3",
          researchProjectUuid: "project-1",
          entityType: "research_project",
          entityUuid: "project-1",
          entityTitle: "My Project",
          action: "autonomous_loop_triggered",
          message: "Queue empty",
          actorType: "system",
          actorUuid: "system",
          actorName: "Synapse",
        },
      ],
    });

    const router = new SynapseEventRouter({
      mcpClient: { callTool } as never,
      config: {
        synapseUrl: "http://synapse.local",
        apiKey: "syn_key",
        autoStart: true,
        projectUuids: [],
      },
      triggerAgent,
      logger,
    });

    await (router as unknown as { fetchAndRoute: (notificationUuid: string) => Promise<void> }).fetchAndRoute("notification-3");

    expect(triggerAgent).toHaveBeenCalledTimes(1);
    const [prompt, metadata] = triggerAgent.mock.calls[0];
    expect(prompt).toContain("Autonomous research loop triggered");
    expect(prompt).toContain("synapse_propose_experiment");
    expect(metadata).toMatchObject({
      action: "autonomous_loop_triggered",
      projectUuid: "project-1",
    });
  });

  it("routes experiment report requested events", async () => {
    callTool.mockResolvedValueOnce({
      notifications: [
        {
          uuid: "notification-4",
          researchProjectUuid: "project-1",
          entityType: "experiment",
          entityUuid: "experiment-1",
          entityTitle: "Baseline experiment",
          action: "experiment_report_requested",
          message: "Write report",
          actorType: "system",
          actorUuid: "system",
          actorName: "Synapse",
        },
      ],
    });

    const router = new SynapseEventRouter({
      mcpClient: { callTool } as never,
      config: {
        synapseUrl: "http://synapse.local",
        apiKey: "syn_key",
        autoStart: true,
        projectUuids: [],
      },
      triggerAgent,
      logger,
    });

    await (router as unknown as { fetchAndRoute: (notificationUuid: string) => Promise<void> }).fetchAndRoute("notification-4");

    expect(triggerAgent).toHaveBeenCalledTimes(1);
    const [prompt] = triggerAgent.mock.calls[0];
    expect(prompt).toContain("Baseline experiment");
    expect(prompt).toContain("synapse_save_experiment_report");
    expect(prompt).toContain("Do NOT post the report as an experiment comment");
  });

  it("routes @mention events with entity context", async () => {
    callTool.mockResolvedValueOnce({
      notifications: [
        {
          uuid: "notification-5",
          researchProjectUuid: "project-1",
          entityType: "experiment",
          entityUuid: "experiment-1",
          entityTitle: "Recall test",
          action: "mentioned",
          message: "@Agent please review",
          actorType: "user",
          actorUuid: "user-1",
          actorName: "Alice",
        },
      ],
    });

    const router = new SynapseEventRouter({
      mcpClient: { callTool } as never,
      config: {
        synapseUrl: "http://synapse.local",
        apiKey: "syn_key",
        autoStart: true,
        projectUuids: [],
      },
      triggerAgent,
      logger,
    });

    await (router as unknown as { fetchAndRoute: (notificationUuid: string) => Promise<void> }).fetchAndRoute("notification-5");

    expect(triggerAgent).toHaveBeenCalledTimes(1);
    const [prompt] = triggerAgent.mock.calls[0];
    expect(prompt).toContain("@mentioned");
    expect(prompt).toContain("synapse_get_comments");
    expect(prompt).toContain("synapse_update_experiment_status");
    expect(prompt).toContain("@[Alice](user:user-1)");
  });

  it("ignores non-new_notification event types", () => {
    const router = new SynapseEventRouter({
      mcpClient: { callTool } as never,
      config: {
        synapseUrl: "http://synapse.local",
        apiKey: "syn_key",
        autoStart: true,
        projectUuids: [],
      },
      triggerAgent,
      logger,
    });

    router.dispatch({ type: "count_update", unreadCount: 5 } as unknown as import("./sse-listener.js").SseNotificationEvent);

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('SSE event type "count_update" ignored');
  });
});

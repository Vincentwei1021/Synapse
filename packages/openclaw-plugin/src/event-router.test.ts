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

  it("routes experiment assignments with experiment-specific mention guidance and unlimited budget text", async () => {
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
    expect(prompt).toContain("Compute budget (hours): Unlimited");
    expect(prompt).toContain("post a comment on this experiment");
    expect(prompt).toContain("@[Alice](user:user-1)");
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
});

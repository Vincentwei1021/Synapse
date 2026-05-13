import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockPrisma = vi.hoisted(() => ({
  researchProject: {
    findFirst: vi.fn(),
  },
  researchQuestion: {
    findFirst: vi.fn(),
  },
  agent: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockCreateExperiment = vi.hoisted(() => vi.fn());
vi.mock("@/services/experiment.service", () => ({
  createExperiment: mockCreateExperiment,
}));

vi.mock("@/services/notification.service", () => ({
  create: vi.fn(async () => ({})),
}));

vi.mock("@/services/activity.service", () => ({}));
vi.mock("@/services/compute.service", () => ({}));
vi.mock("@/services/experiment-run.service", () => ({}));
vi.mock("@/services/experiment-progress.service", () => ({
  createProgressLog: vi.fn(),
}));
vi.mock("@/services/session.service", () => ({}));

import { registerComputeTools } from "@/mcp/tools/compute";

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

function makeServer() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    }),
  } as unknown as McpServer;

  return { server, tools };
}

describe("synapse_propose_experiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.agent.findUnique.mockResolvedValue({ ownerUuid: null, name: "Agent" });
    mockPrisma.researchQuestion.findFirst.mockResolvedValue({ uuid: "rq-1" });
    mockCreateExperiment.mockResolvedValue({
      uuid: "exp-1",
      title: "Run one",
      status: "pending_review",
    });
  });

  it("rejects non-loop proposals and points agents to the generic create tool", async () => {
    mockPrisma.researchProject.findFirst.mockImplementation(async (args) => {
      if (args.where.autonomousLoopEnabled === true) {
        return null;
      }

      return {
        uuid: "project-1",
        name: "Project",
        autonomousLoopEnabled: false,
        autonomousLoopAgentUuid: null,
        autonomousLoopMode: "human_review",
      };
    });

    const { server, tools } = makeServer();
    registerComputeTools(server, {
      type: "agent",
      companyUuid: "company-1",
      actorUuid: "agent-1",
      roles: ["experiment"],
      agentName: "Agent",
    });

    const result = await tools.get("synapse_propose_experiment")?.({
      researchProjectUuid: "project-1",
      title: "Run one",
      description: "Try the first run",
      priority: "high",
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("synapse_create_experiment");
    expect(mockCreateExperiment).not.toHaveBeenCalled();
  });

  it("creates pending-start experiments for the assigned full-auto loop agent", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({
      uuid: "project-1",
      name: "Project",
      autonomousLoopEnabled: true,
      autonomousLoopAgentUuid: "agent-1",
      autonomousLoopMode: "full_auto",
    });

    const { server, tools } = makeServer();
    registerComputeTools(server, {
      type: "agent",
      companyUuid: "company-1",
      actorUuid: "agent-1",
      roles: ["experiment"],
      agentName: "Agent",
    });

    const result = await tools.get("synapse_propose_experiment")?.({
      researchProjectUuid: "project-1",
      title: "Run one",
      description: "Try the first run",
      priority: "high",
    });

    expect(result?.isError).toBeUndefined();
    expect(mockCreateExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: "company-1",
        researchProjectUuid: "project-1",
        title: "Run one",
        description: "Try the first run",
        priority: "high",
        status: "pending_start",
        assigneeUuid: "agent-1",
        assigneeType: "agent",
        assignedByUuid: "agent-1",
        createdByUuid: "agent-1",
        createdByType: "agent",
      }),
    );
  });
});

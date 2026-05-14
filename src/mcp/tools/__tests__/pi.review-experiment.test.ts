import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("@/services/research-project.service", () => ({}));
vi.mock("@/services/research-question.service", () => ({}));
vi.mock("@/services/document.service", () => ({}));
vi.mock("@/services/activity.service", () => ({}));
vi.mock("@/services/project-group.service", () => ({}));
vi.mock("@/services/baseline.service", () => ({}));

const mockReviewExperiment = vi.hoisted(() => vi.fn());
vi.mock("@/services/experiment.service", () => ({
  reviewExperiment: mockReviewExperiment,
}));

import { registerAdminTools } from "@/mcp/tools/pi";

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

describe("synapse_review_experiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReviewExperiment.mockResolvedValue({
      uuid: "exp-1",
      status: "pending_start",
    });
  });

  it("lets PI/admin agents approve experiments from the MCP terminal flow", async () => {
    const { server, tools } = makeServer();
    registerAdminTools(server, {
      type: "agent",
      companyUuid: "company-1",
      actorUuid: "agent-pi-1",
      roles: ["pi"],
      agentName: "PI Agent",
    });

    const result = await tools.get("synapse_review_experiment")?.({
      experimentUuid: "exp-1",
      decision: "approved",
      reviewNote: "Ready to run",
      assignedAgentUuid: "agent-runner-1",
    });

    expect(result?.isError).toBeUndefined();
    expect(JSON.parse(result?.content[0]?.text ?? "{}")).toMatchObject({
      uuid: "exp-1",
      status: "pending_start",
    });
    expect(mockReviewExperiment).toHaveBeenCalledWith({
      companyUuid: "company-1",
      experimentUuid: "exp-1",
      approved: true,
      reviewNote: "Ready to run",
      assignedAgentUuid: "agent-runner-1",
      actorUuid: "agent-pi-1",
      actorType: "agent",
    });
  });
});

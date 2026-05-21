import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockSessionCheckinToExperiment = vi.hoisted(() => vi.fn());
const mockSessionCheckoutFromExperiment = vi.hoisted(() => vi.fn());

vi.mock("@/services/session.service", () => ({
  getSession: mockGetSession,
  sessionCheckinToExperiment: mockSessionCheckinToExperiment,
  sessionCheckoutFromExperiment: mockSessionCheckoutFromExperiment,
}));

import { registerSessionTools } from "@/mcp/tools/session";

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

describe("experiment session checkin tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ uuid: "session-1", agentUuid: "agent-1" });
    mockSessionCheckinToExperiment.mockResolvedValue({
      experimentUuid: "exp-1",
      checkinAt: "2026-05-21T00:00:00.000Z",
      checkoutAt: null,
    });
  });

  it("checks the current agent's session into an experiment", async () => {
    const { server, tools } = makeServer();
    registerSessionTools(server, {
      type: "agent",
      companyUuid: "company-1",
      actorUuid: "agent-1",
      roles: ["experiment"],
      agentName: "Agent",
    });

    const result = await tools.get("synapse_session_checkin_experiment")?.({
      sessionUuid: "session-1",
      experimentUuid: "exp-1",
    });

    expect(result?.isError).toBeUndefined();
    expect(mockSessionCheckinToExperiment).toHaveBeenCalledWith(
      "company-1",
      "session-1",
      "exp-1",
    );
  });

  it("checks the current agent's session out of an experiment", async () => {
    const { server, tools } = makeServer();
    registerSessionTools(server, {
      type: "agent",
      companyUuid: "company-1",
      actorUuid: "agent-1",
      roles: ["experiment"],
      agentName: "Agent",
    });

    const result = await tools.get("synapse_session_checkout_experiment")?.({
      sessionUuid: "session-1",
      experimentUuid: "exp-1",
    });

    expect(result?.isError).toBeUndefined();
    expect(mockSessionCheckoutFromExperiment).toHaveBeenCalledWith(
      "company-1",
      "session-1",
      "exp-1",
    );
  });
});

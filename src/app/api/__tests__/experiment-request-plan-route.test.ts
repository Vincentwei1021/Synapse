import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockGetAgentByUuid = vi.fn();
const mockRequestExperimentPlan = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: (auth: { type: string }) => auth.type === "user",
}));

vi.mock("@/services/agent.service", () => ({
  getAgentByUuid: (...args: unknown[]) => mockGetAgentByUuid(...args),
}));

vi.mock("@/services/experiment.service", () => ({
  requestExperimentPlan: (...args: unknown[]) => mockRequestExperimentPlan(...args),
}));

import { POST as requestPlanRoute } from "@/app/api/experiments/[uuid]/request-plan/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const experimentUuid = "experiment-0000-0000-0000-000000000001";

function makeContext(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe("experiment request-plan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid, actorUuid: "user-uuid-1" });
    mockGetAgentByUuid.mockResolvedValue({ uuid: "agent-uuid-1", ownerUuid: "user-uuid-1" });
    mockRequestExperimentPlan.mockResolvedValue({ uuid: experimentUuid, assignee: { uuid: "agent-uuid-1" } });
  });

  it("assigns the selected owned agent before requesting a plan", async () => {
    const response = await requestPlanRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}/request-plan`, "http://localhost:3000"), {
        method: "POST",
        body: JSON.stringify({ agentUuid: "agent-uuid-1" }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(200);
    expect(mockGetAgentByUuid).toHaveBeenCalledWith(companyUuid, "agent-uuid-1", "user-uuid-1");
    expect(mockRequestExperimentPlan).toHaveBeenCalledWith({
      companyUuid,
      experimentUuid,
      agentUuid: "agent-uuid-1",
      requestedByUuid: "user-uuid-1",
    });
  });
});

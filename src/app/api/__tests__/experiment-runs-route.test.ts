import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
const mockListExperimentRuns = vi.fn();
const mockCreateExperimentRun = vi.fn();
const mockResearchProjectExists = vi.fn();
const mockGetAuthContext = vi.fn();

vi.mock("@/services/experiment-run.service", () => ({
  listExperimentRuns: (...args: unknown[]) => mockListExperimentRuns(...args),
  createExperimentRun: (...args: unknown[]) => mockCreateExperimentRun(...args),
}));

vi.mock("@/services/research-project.service", () => ({
  researchProjectExists: (...args: unknown[]) => mockResearchProjectExists(...args),
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: (auth: { type: string }) => auth.type === "user",
  isResearchLead: (auth: { roles?: string[] }) => auth.roles?.includes("research_lead_agent") ?? false,
}));

import { GET } from "@/app/api/research-projects/[uuid]/experiment-runs/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";
const mockAuth = { type: "user", companyUuid, actorUuid: "user-uuid-1" };

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

function makeContext(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe("GET /api/research-projects/[uuid]/experiment-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(mockAuth);
    mockResearchProjectExists.mockResolvedValue(true);
    mockListExperimentRuns.mockResolvedValue({ tasks: [], total: 0 });
  });

  it("passes experimentDesignUuids filter to listExperimentRuns when provided", async () => {
    const req = makeRequest(
      `/api/research-projects/${researchProjectUuid}/experiment-runs?experimentDesignUuids=uuid-1,uuid-2`
    );
    const response = await GET(req, makeContext(researchProjectUuid));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(mockListExperimentRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        researchProjectUuid,
        experimentDesignUuids: ["uuid-1", "uuid-2"],
      })
    );
  });

  it("does not pass experimentDesignUuids when param is absent (backward compat)", async () => {
    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-runs`);
    await GET(req, makeContext(researchProjectUuid));

    expect(mockListExperimentRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        researchProjectUuid,
      })
    );
    // experimentDesignUuids should be undefined
    const callArg = mockListExperimentRuns.mock.calls[0][0];
    expect(callArg.experimentDesignUuids).toBeUndefined();
  });

  it("handles single designUuid correctly", async () => {
    const req = makeRequest(
      `/api/research-projects/${researchProjectUuid}/experiment-runs?experimentDesignUuids=single-uuid`
    );
    await GET(req, makeContext(researchProjectUuid));

    expect(mockListExperimentRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentDesignUuids: ["single-uuid"],
      })
    );
  });

  it("filters out empty strings from experimentDesignUuids", async () => {
    const req = makeRequest(
      `/api/research-projects/${researchProjectUuid}/experiment-runs?experimentDesignUuids=uuid-1,,uuid-2,`
    );
    await GET(req, makeContext(researchProjectUuid));

    expect(mockListExperimentRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentDesignUuids: ["uuid-1", "uuid-2"],
      })
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-runs`);
    const response = await GET(req, makeContext(researchProjectUuid));

    expect(response.status).toBe(401);
  });

  it("returns 404 when research project does not exist", async () => {
    mockResearchProjectExists.mockResolvedValue(false);

    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-runs`);
    const response = await GET(req, makeContext(researchProjectUuid));

    expect(response.status).toBe(404);
  });
});

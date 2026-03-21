import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
const mockGetProjectExperimentDesigns = vi.fn();
const mockResearchProjectExists = vi.fn();
const mockGetAuthContext = vi.fn();

vi.mock("@/services/experiment-design.service", () => ({
  getProjectExperimentDesigns: (...args: unknown[]) => mockGetProjectExperimentDesigns(...args),
}));

vi.mock("@/services/research-project.service", () => ({
  researchProjectExists: (...args: unknown[]) => mockResearchProjectExists(...args),
}));

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}));

import { GET } from "@/app/api/research-projects/[uuid]/experiment-designs/summary/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";
const mockAuth = { type: "user", companyUuid, actorUuid: "user-uuid-1" };

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

function makeContext(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe("GET /api/research-projects/[uuid]/experiment-designs/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(mockAuth);
    mockResearchProjectExists.mockResolvedValue(true);
    mockGetProjectExperimentDesigns.mockResolvedValue([]);
  });

  it("returns experiment design summary data in correct format", async () => {
    const mockData = [
      { uuid: "design-1", title: "Design One", sequenceNumber: 1, runCount: 3 },
      { uuid: "design-2", title: "Design Two", sequenceNumber: 2, runCount: 5 },
    ];
    mockGetProjectExperimentDesigns.mockResolvedValue(mockData);

    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-designs/summary`);
    const response = await GET(req, makeContext(researchProjectUuid));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(mockData);
  });

  it("calls getProjectExperimentDesigns with correct companyUuid and researchProjectUuid", async () => {
    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-designs/summary`);
    await GET(req, makeContext(researchProjectUuid));

    expect(mockGetProjectExperimentDesigns).toHaveBeenCalledWith(companyUuid, researchProjectUuid);
  });

  it("returns empty array when no approved experiment designs exist", async () => {
    mockGetProjectExperimentDesigns.mockResolvedValue([]);

    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-designs/summary`);
    const response = await GET(req, makeContext(researchProjectUuid));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-designs/summary`);
    const response = await GET(req, makeContext(researchProjectUuid));

    expect(response.status).toBe(401);
  });

  it("returns 404 when research project does not exist", async () => {
    mockResearchProjectExists.mockResolvedValue(false);

    const req = makeRequest(`/api/research-projects/${researchProjectUuid}/experiment-designs/summary`);
    const response = await GET(req, makeContext(researchProjectUuid));

    expect(response.status).toBe(404);
  });
});

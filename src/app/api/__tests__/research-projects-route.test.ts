import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockListResearchProjectsWithStats = vi.fn();
const mockGetResearchProject = vi.fn();
const mockGetProjectMetricsSnapshot = vi.fn();
const mockToProjectCompatibilityCounts = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: vi.fn(() => true),
}));

vi.mock("@/services/research-project.service", () => ({
  listResearchProjectsWithStats: (...args: unknown[]) => mockListResearchProjectsWithStats(...args),
  getResearchProject: (...args: unknown[]) => mockGetResearchProject(...args),
}));

vi.mock("@/services/project-metrics.service", () => ({
  getProjectMetricsSnapshot: (...args: unknown[]) => mockGetProjectMetricsSnapshot(...args),
  toProjectCompatibilityCounts: (...args: unknown[]) => mockToProjectCompatibilityCounts(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectGroup: { findFirst: vi.fn() },
    researchProject: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { GET as listProjects } from "@/app/api/research-projects/route";
import { GET as getProjectDetail } from "@/app/api/research-projects/[uuid]/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const projectUuid = "project-0000-0000-0000-000000000001";
const mockAuth = { type: "user", companyUuid, actorUuid: "user-uuid-1" };
const now = new Date("2026-03-28T00:00:00Z");

function makeRequest(url: string) {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

function makeContext(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe("research projects routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(mockAuth);
    mockToProjectCompatibilityCounts.mockReturnValue({
      researchQuestions: 8,
      openResearchQuestions: 5,
      documents: 3,
      experiments: 10,
      doneExperiments: 4,
      experimentDesigns: 2,
      activeExperimentDesigns: 1,
      experimentRuns: 0,
      doneExperimentRuns: 0,
      ideas: 8,
      tasks: 10,
      doneTasks: 4,
      proposals: 2,
    });
  });

  it("GET /api/research-projects returns paginated projects with compatibility counts", async () => {
    mockListResearchProjectsWithStats.mockResolvedValue({
      projects: [
        {
          uuid: projectUuid,
          name: "Test Project",
          description: "A test project",
          goal: "Improve accuracy",
          datasets: ["dataset-a"],
          evaluationMethods: ["pass@1"],
          latestSynthesisAt: now,
          latestSynthesisIdeaCount: 2,
          latestSynthesisSummary: "Latest synthesis",
          groupUuid: null,
          createdAt: now,
          updatedAt: now,
          metrics: { researchProjectUuid: projectUuid },
        },
      ],
      total: 1,
    });

    const response = await listProjects(makeRequest("/api/research-projects?page=1&pageSize=20"), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].counts).toEqual(
      expect.objectContaining({
        ideas: 8,
        tasks: 10,
        doneTasks: 4,
        proposals: 2,
      })
    );
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(mockListResearchProjectsWithStats).toHaveBeenCalledWith({
      companyUuid,
      skip: 0,
      take: 20,
    });
  });

  it("GET /api/research-projects/[uuid] returns project detail with counts and activities", async () => {
    mockGetResearchProject.mockResolvedValue({
      uuid: projectUuid,
      name: "Test Project",
      description: "A test project",
      createdAt: now,
      updatedAt: now,
      _count: { activities: 12 },
    });
    mockGetProjectMetricsSnapshot.mockResolvedValue({ researchProjectUuid: projectUuid });

    const response = await getProjectDetail(makeRequest(`/api/research-projects/${projectUuid}`), makeContext(projectUuid));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.counts).toEqual(
      expect.objectContaining({
        ideas: 8,
        tasks: 10,
        doneTasks: 4,
        proposals: 2,
        activities: 12,
      })
    );
    expect(mockGetProjectMetricsSnapshot).toHaveBeenCalledWith(companyUuid, projectUuid);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const response = await listProjects(makeRequest("/api/research-projects"), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(401);
  });
});

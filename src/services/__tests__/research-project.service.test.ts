import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  researchProject: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  experiment: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  experimentDesign: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  experimentRun: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  researchQuestion: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  document: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  listResearchProjects,
  getResearchProject,
  getResearchProjectDetailRef,
  createResearchProject,
  updateResearchProject,
  deleteResearchProject,
  researchProjectExists,
  getResearchProjectByUuid,
  getResearchProjectDashboardData,
  getResearchProjectExportData,
  getCompanyOverviewStats,
  getResearchProjectInsightsData,
  getResearchProjectStats,
  listResearchProjectsWithStats,
} from "@/services/research-project.service";

// ===== Helpers =====
const now = new Date("2026-03-13T00:00:00Z");
const companyUuid = "company-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    uuid: researchProjectUuid,
    name: "Test Project",
    description: "A test project",
    groupUuid: null,
    createdAt: now,
    updatedAt: now,
    goal: "Improve retrieval accuracy",
    datasets: ["dataset-a"],
    evaluationMethods: ["pass@1"],
    latestSynthesisAt: null,
    latestSynthesisIdeaCount: null,
    latestSynthesisSummary: null,
    _count: { researchQuestions: 5, documents: 3, experiments: 10, activities: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.researchQuestion.groupBy.mockResolvedValue([]);
  mockPrisma.experiment.groupBy.mockResolvedValue([]);
  mockPrisma.experimentDesign.groupBy.mockResolvedValue([]);
  mockPrisma.experimentRun.groupBy.mockResolvedValue([]);
  mockPrisma.document.groupBy.mockResolvedValue([]);
});

// ===== listResearchProjects =====
describe("listResearchProjects", () => {
  it("should return paginated projects with counts", async () => {
    const project = makeProject();
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.researchProject.count.mockResolvedValue(1);

    const result = await listResearchProjects({ companyUuid, skip: 0, take: 20 });

    expect(result.projects).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.projects[0].uuid).toBe(researchProjectUuid);
    expect(result.projects[0]._count.experiments).toBe(10);
  });

  it("should pass skip and take to prisma", async () => {
    mockPrisma.researchProject.findMany.mockResolvedValue([]);
    mockPrisma.researchProject.count.mockResolvedValue(0);

    await listResearchProjects({ companyUuid, skip: 10, take: 5 });

    expect(mockPrisma.researchProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });
});

// ===== getResearchProject =====
describe("getResearchProject", () => {
  it("should return project with activity count", async () => {
    const project = makeProject({ _count: { researchQuestions: 5, documents: 3, experiments: 10, activities: 100 } });
    mockPrisma.researchProject.findFirst.mockResolvedValue(project);

    const result = await getResearchProject(companyUuid, researchProjectUuid);

    expect(result).not.toBeNull();
    expect(result!.uuid).toBe(researchProjectUuid);
    expect(result!._count.activities).toBe(100);
  });

  it("should return null when project not found", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);

    const result = await getResearchProject(companyUuid, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("getResearchProjectDetailRef", () => {
  it("should return project uuid when project exists", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({ uuid: researchProjectUuid });

    const result = await getResearchProjectDetailRef(companyUuid, researchProjectUuid);

    expect(result).toEqual({ uuid: researchProjectUuid });
    expect(mockPrisma.researchProject.findFirst).toHaveBeenCalledWith({
      where: { uuid: researchProjectUuid, companyUuid },
      select: { uuid: true },
    });
  });
});

// ===== createResearchProject =====
describe("createResearchProject", () => {
  it("should create project and return it", async () => {
    const project = makeProject();
    mockPrisma.researchProject.create.mockResolvedValue(project);

    const result = await createResearchProject({
      companyUuid,
      name: "Test Project",
      description: "A test project",
    });

    expect(result.uuid).toBe(researchProjectUuid);
    expect(result.name).toBe("Test Project");
    expect(mockPrisma.researchProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyUuid,
          name: "Test Project",
          groupUuid: null,
        }),
      })
    );
  });

  it("should pass groupUuid when provided", async () => {
    const groupUuid = "group-0000-0000-0000-000000000001";
    mockPrisma.researchProject.create.mockResolvedValue(makeProject({ groupUuid }));

    await createResearchProject({
      companyUuid,
      name: "Grouped Project",
      groupUuid,
    });

    expect(mockPrisma.researchProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ groupUuid }),
      })
    );
  });

  it("should pass normalized optional fields through to prisma", async () => {
    mockPrisma.researchProject.create.mockResolvedValue(makeProject({
      description: null,
      goal: null,
      datasets: [],
      evaluationMethods: [],
      groupUuid: null,
    }));

    await createResearchProject({
      companyUuid,
      name: "Minimal Project",
      description: null,
      goal: null,
      datasets: [],
      evaluationMethods: [],
      groupUuid: null,
    });

    expect(mockPrisma.researchProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: null,
          goal: null,
          datasets: [],
          evaluationMethods: [],
          groupUuid: null,
        }),
      })
    );
  });
});

// ===== updateResearchProject =====
describe("updateResearchProject", () => {
  it("should update project fields", async () => {
    const updated = makeProject({ name: "Updated Name" });
    mockPrisma.researchProject.update.mockResolvedValue(updated);

    const result = await updateResearchProject(researchProjectUuid, { name: "Updated Name" });

    expect(result.name).toBe("Updated Name");
    expect(mockPrisma.researchProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: researchProjectUuid },
        data: { name: "Updated Name" },
      })
    );
  });
});

// ===== deleteResearchProject =====
describe("deleteResearchProject", () => {
  it("should delete project by uuid", async () => {
    mockPrisma.researchProject.delete.mockResolvedValue(makeProject());

    await deleteResearchProject(researchProjectUuid);

    expect(mockPrisma.researchProject.delete).toHaveBeenCalledWith({
      where: { uuid: researchProjectUuid },
    });
  });
});

// ===== researchProjectExists =====
describe("researchProjectExists", () => {
  it("should return true when project exists", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({ uuid: researchProjectUuid });

    const result = await researchProjectExists(companyUuid, researchProjectUuid);
    expect(result).toBe(true);
  });

  it("should return false when project does not exist", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);

    const result = await researchProjectExists(companyUuid, "missing");
    expect(result).toBe(false);
  });
});

describe("getResearchProjectDashboardData", () => {
  it("should return project, stats, recent experiments, and recent questions", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(makeProject());
    mockPrisma.experiment.findMany = vi.fn().mockResolvedValue([
      { uuid: "exp-1", title: "Recent experiment", status: "in_progress", outcome: null },
    ]);
    mockPrisma.researchQuestion.findMany = vi.fn().mockResolvedValue([
      { uuid: "rq-1", title: "Recent question", status: "open", reviewStatus: "approved" },
    ]);

    const result = await getResearchProjectDashboardData(companyUuid, researchProjectUuid);

    expect(result).not.toBeNull();
    expect(result!.project.uuid).toBe(researchProjectUuid);
    expect(result!.recentExperiments).toHaveLength(1);
    expect(result!.recentQuestions).toHaveLength(1);
  });

  it("should return null when project does not exist", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);
    mockPrisma.experiment.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.researchQuestion.findMany = vi.fn().mockResolvedValue([]);

    const result = await getResearchProjectDashboardData(companyUuid, "missing");

    expect(result).toBeNull();
  });
});

describe("getResearchProjectInsightsData", () => {
  it("should return synthesis metadata and recent completed experiments", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(
      makeProject({
        latestSynthesisAt: now,
        latestSynthesisIdeaCount: 4,
        latestSynthesisSummary: "Summary",
      }),
    );
    mockPrisma.experiment.findMany.mockResolvedValue([
      {
        uuid: "exp-1",
        title: "Completed experiment",
        outcome: "accepted",
        completedAt: now,
        researchQuestion: { title: "Question A" },
      },
    ]);

    const result = await getResearchProjectInsightsData(companyUuid, researchProjectUuid);

    expect(result).not.toBeNull();
    expect(result!.project.latestSynthesisIdeaCount).toBe(4);
    expect(result!.completedExperiments).toHaveLength(1);
  });

  it("should return null when project is missing", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);
    mockPrisma.experiment.findMany.mockResolvedValue([]);

    const result = await getResearchProjectInsightsData(companyUuid, "missing");

    expect(result).toBeNull();
  });
});

describe("getResearchProjectExportData", () => {
  it("should return export data bundles for an existing project", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(makeProject());
    mockPrisma.experimentDesign.findMany.mockResolvedValue([
      { uuid: "design-1", title: "Design 1" },
    ]);
    mockPrisma.researchQuestion.findMany.mockResolvedValue([
      { uuid: "rq-1", title: "Question 1", status: "open" },
    ]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([
      {
        uuid: "run-1",
        title: "Run 1",
        experimentDesignUuid: "design-1",
        experimentResults: { accuracy: 0.9 },
        outcome: "accepted",
      },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      { title: "RDR 1", content: "Decision", createdAt: now },
    ]);

    const result = await getResearchProjectExportData(companyUuid, researchProjectUuid);

    expect(result).not.toBeNull();
    expect(result!.designs).toHaveLength(1);
    expect(result!.questions).toHaveLength(1);
    expect(result!.runs).toHaveLength(1);
    expect(result!.rdrDocs).toHaveLength(1);
  });

  it("should return null when project is missing", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);
    mockPrisma.experimentDesign.findMany.mockResolvedValue([]);
    mockPrisma.researchQuestion.findMany.mockResolvedValue([]);
    mockPrisma.experimentRun.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await getResearchProjectExportData(companyUuid, "missing");

    expect(result).toBeNull();
  });
});

// ===== getResearchProjectByUuid =====
describe("getResearchProjectByUuid", () => {
  it("should return basic project info", async () => {
    const project = {
      uuid: researchProjectUuid,
      name: "Test Project",
      description: "A test project",
      goal: "Improve retrieval accuracy",
      datasets: ["dataset-a"],
      evaluationMethods: ["pass@1"],
      latestSynthesisAt: null,
      latestSynthesisIdeaCount: null,
      latestSynthesisSummary: null,
    };
    mockPrisma.researchProject.findFirst.mockResolvedValue(project);

    const result = await getResearchProjectByUuid(companyUuid, researchProjectUuid);

    expect(result).toEqual(project);
    expect(mockPrisma.researchProject.findFirst).toHaveBeenCalledWith({
      where: { uuid: researchProjectUuid, companyUuid },
      select: {
        uuid: true,
        name: true,
        description: true,
        goal: true,
        datasets: true,
        evaluationMethods: true,
        latestSynthesisAt: true,
        latestSynthesisIdeaCount: true,
        latestSynthesisSummary: true,
      },
    });
  });

  it("should return null when project not found", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);

    const result = await getResearchProjectByUuid(companyUuid, "nonexistent");
    expect(result).toBeNull();
  });
});

// ===== getCompanyOverviewStats =====
describe("getCompanyOverviewStats", () => {
  it("should return aggregated company stats", async () => {
    mockPrisma.researchProject.count.mockResolvedValue(3);
    mockPrisma.experiment.count
      .mockResolvedValueOnce(25)
      .mockResolvedValueOnce(2);
    mockPrisma.researchQuestion.count.mockResolvedValue(10);

    const result = await getCompanyOverviewStats(companyUuid);

    expect(result).toEqual({
      researchProjects: 3,
      experimentRuns: 25,
      openExperimentDesigns: 2,
      researchQuestions: 10,
    });
  });
});

// ===== getResearchProjectStats =====
describe("getResearchProjectStats", () => {
  it("should return per-project stats grouped by status", async () => {
    mockPrisma.researchQuestion.groupBy.mockResolvedValue([
      { researchProjectUuid, status: "open", _count: { _all: 5 } },
      { researchProjectUuid, status: "elaborating", _count: { _all: 3 } },
      { researchProjectUuid, status: "proposal_created", _count: { _all: 2 } },
      { researchProjectUuid, status: "completed", _count: { _all: 1 } },
    ]);
    mockPrisma.experiment.groupBy.mockResolvedValue([
      { researchProjectUuid, status: "draft", _count: { _all: 2 } },
      { researchProjectUuid, status: "pending_review", _count: { _all: 1 } },
      { researchProjectUuid, status: "pending_start", _count: { _all: 2 } },
      { researchProjectUuid, status: "in_progress", _count: { _all: 4 } },
      { researchProjectUuid, status: "completed", _count: { _all: 6 } },
    ]);
    mockPrisma.document.groupBy.mockResolvedValue([{ researchProjectUuid, _count: { _all: 8 } }]);

    const result = await getResearchProjectStats(companyUuid, researchProjectUuid);

    expect(result.researchQuestions).toEqual({
      total: 11,
      open: 8,
      elaborating: 3,
      proposalCreated: 2,
      completed: 1,
    });
    expect(result.experimentRuns).toEqual({ total: 15, inProgress: 4, todo: 2, toVerify: 3, done: 6 });
    expect(result.experimentDesigns).toEqual({ total: 15, pending: 1 });
    expect(result.experiments).toEqual({
      total: 15,
      draft: 2,
      pendingReview: 1,
      pendingStart: 2,
      inProgress: 4,
      completed: 6,
    });
    expect(result.documents).toEqual({ total: 8 });
  });
});

// ===== listResearchProjectsWithStats =====
describe("listResearchProjectsWithStats", () => {
  it("should return projects with task completion stats", async () => {
    const project1 = makeProject({ uuid: "project-0000-0000-0000-000000000001" });
    const project2 = makeProject({ uuid: "project-0000-0000-0000-000000000002" });

    mockPrisma.researchProject.findMany.mockResolvedValue([project1, project2]);
    mockPrisma.researchProject.count.mockResolvedValue(2);
    mockPrisma.experiment.groupBy.mockResolvedValue([
      { researchProjectUuid: "project-0000-0000-0000-000000000001", status: "completed", _count: { _all: 5 } },
      { researchProjectUuid: "project-0000-0000-0000-000000000002", status: "completed", _count: { _all: 3 } },
    ]);

    const result = await listResearchProjectsWithStats({ companyUuid, skip: 0, take: 20 });

    expect(result.projects).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.projects[0].experimentRunsDone).toBe(5);
    expect(result.projects[1].experimentRunsDone).toBe(3);
    expect(mockPrisma.experiment.groupBy).toHaveBeenCalledWith({
      by: ["researchProjectUuid", "status"],
      where: {
        companyUuid,
        researchProjectUuid: { in: [project1.uuid, project2.uuid] },
      },
      _count: { _all: true },
    });
  });

  it("should handle projects with no completed tasks", async () => {
    const project = makeProject();
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.researchProject.count.mockResolvedValue(1);
    mockPrisma.experiment.groupBy.mockResolvedValue([{ researchProjectUuid, status: "draft", _count: { _all: 10 } }]);

    const result = await listResearchProjectsWithStats({ companyUuid, skip: 0, take: 20 });

    expect(result.projects[0].experimentRunsDone).toBe(0);
  });
});

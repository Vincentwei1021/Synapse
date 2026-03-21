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
  experimentRun: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  experimentDesign: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  researchQuestion: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  document: {
    count: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  listResearchProjects,
  getResearchProject,
  createResearchProject,
  updateResearchProject,
  deleteResearchProject,
  researchProjectExists,
  getResearchProjectByUuid,
  getCompanyOverviewStats,
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
    _count: { researchQuestions: 5, documents: 3, experimentRuns: 10, experimentDesigns: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(result.projects[0]._count.experimentRuns).toBe(10);
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
    const project = makeProject({ _count: { researchQuestions: 5, documents: 3, experimentRuns: 10, experimentDesigns: 2, activities: 100 } });
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

// ===== getResearchProjectByUuid =====
describe("getResearchProjectByUuid", () => {
  it("should return basic project info", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({
      uuid: researchProjectUuid,
      name: "Test Project",
    });

    const result = await getResearchProjectByUuid(companyUuid, researchProjectUuid);

    expect(result).toEqual({
      uuid: researchProjectUuid,
      name: "Test Project",
    });
    expect(mockPrisma.researchProject.findFirst).toHaveBeenCalledWith({
      where: { uuid: researchProjectUuid, companyUuid },
      select: { uuid: true, name: true },
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
    mockPrisma.experimentRun.count.mockResolvedValue(25);
    mockPrisma.experimentDesign.count.mockResolvedValue(2);
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
      { status: "open", _count: 5 },
      { status: "claimed", _count: 3 },
    ]);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([
      { status: "open", _count: 2 },
      { status: "assigned", _count: 1 },
      { status: "in_progress", _count: 4 },
      { status: "to_verify", _count: 2 },
      { status: "done", _count: 6 },
      { status: "closed", _count: 1 },
    ]);
    mockPrisma.experimentDesign.groupBy.mockResolvedValue([
      { status: "pending", _count: 2 },
      { status: "approved", _count: 5 },
    ]);
    mockPrisma.document.count.mockResolvedValue(8);

    const result = await getResearchProjectStats(companyUuid, researchProjectUuid);

    expect(result.researchQuestions).toEqual({ total: 8, open: 5 });
    expect(result.experimentRuns).toEqual({ total: 16, inProgress: 4, todo: 3, toVerify: 2, done: 7 });
    expect(result.experimentDesigns).toEqual({ total: 7, pending: 2 });
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
    mockPrisma.experimentRun.groupBy.mockResolvedValue([
      { researchProjectUuid: "project-0000-0000-0000-000000000001", _count: 5 },
      { researchProjectUuid: "project-0000-0000-0000-000000000002", _count: 3 },
    ]);

    const result = await listResearchProjectsWithStats({ companyUuid, skip: 0, take: 20 });

    expect(result.projects).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.projects[0].experimentRunsDone).toBe(5);
    expect(result.projects[1].experimentRunsDone).toBe(3);
    expect(mockPrisma.experimentRun.groupBy).toHaveBeenCalledWith({
      by: ["researchProjectUuid"],
      where: {
        companyUuid,
        researchProjectUuid: { in: [project1.uuid, project2.uuid] },
        status: "done",
      },
      _count: true,
    });
  });

  it("should handle projects with no completed tasks", async () => {
    const project = makeProject();
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.researchProject.count.mockResolvedValue(1);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([]);

    const result = await listResearchProjectsWithStats({ companyUuid, skip: 0, take: 20 });

    expect(result.projects[0].experimentRunsDone).toBe(0);
  });
});

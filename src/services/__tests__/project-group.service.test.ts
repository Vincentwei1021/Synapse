import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  projectGroup: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  researchProject: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  experimentRun: {
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  researchQuestion: {
    count: vi.fn(),
  },
  experimentDesign: {
    count: vi.fn(),
  },
  activity: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockEventBus = vi.hoisted(() => ({
  emitChange: vi.fn(),
}));
vi.mock("@/lib/event-bus", () => ({ eventBus: mockEventBus }));

import {
  createProjectGroup,
  updateProjectGroup,
  deleteProjectGroup,
  getProjectGroup,
  listProjectGroups,
  moveProjectToGroup,
  getGroupDashboard,
} from "@/services/project-group.service";

// ===== Helpers =====
const now = new Date("2026-03-13T00:00:00Z");
const companyUuid = "company-0000-0000-0000-000000000001";
const groupUuid = "group-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";

function makeProjectGroup(overrides: Record<string, unknown> = {}) {
  return {
    uuid: groupUuid,
    name: "Test Group",
    description: "A test group",
    companyUuid,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    uuid: researchProjectUuid,
    name: "Test Project",
    description: "A test project",
    groupUuid,
    companyUuid,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== createProjectGroup =====
describe("createProjectGroup", () => {
  it("should create project group and return formatted response", async () => {
    const group = makeProjectGroup();
    mockPrisma.projectGroup.create.mockResolvedValue(group);

    const result = await createProjectGroup({
      companyUuid,
      name: "Test Group",
      description: "A test group",
    });

    expect(result.uuid).toBe(groupUuid);
    expect(result.name).toBe("Test Group");
    expect(result.description).toBe("A test group");
    expect(result.projectCount).toBe(0);
    expect(result.createdAt).toBe(now.toISOString());

    expect(mockPrisma.projectGroup.create).toHaveBeenCalledWith({
      data: {
        companyUuid,
        name: "Test Group",
        description: "A test group",
      },
    });
  });

  it("should use empty string when description is null", async () => {
    const group = makeProjectGroup({ description: "" });
    mockPrisma.projectGroup.create.mockResolvedValue(group);

    await createProjectGroup({
      companyUuid,
      name: "Test Group",
      description: null,
    });

    expect(mockPrisma.projectGroup.create).toHaveBeenCalledWith({
      data: {
        companyUuid,
        name: "Test Group",
        description: "",
      },
    });
  });

  it("should use empty string when description is undefined", async () => {
    const group = makeProjectGroup({ description: "" });
    mockPrisma.projectGroup.create.mockResolvedValue(group);

    await createProjectGroup({
      companyUuid,
      name: "Test Group",
    });

    expect(mockPrisma.projectGroup.create).toHaveBeenCalledWith({
      data: {
        companyUuid,
        name: "Test Group",
        description: "",
      },
    });
  });
});

// ===== updateProjectGroup =====
describe("updateProjectGroup", () => {
  it("should update group and return with project count", async () => {
    const existing = makeProjectGroup();
    const updated = makeProjectGroup({ name: "Updated Group" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(existing);
    mockPrisma.projectGroup.update.mockResolvedValue(updated);
    mockPrisma.researchProject.count.mockResolvedValue(5);

    const result = await updateProjectGroup({
      companyUuid,
      groupUuid,
      name: "Updated Group",
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Updated Group");
    expect(result!.projectCount).toBe(5);

    expect(mockPrisma.projectGroup.update).toHaveBeenCalledWith({
      where: { uuid: groupUuid },
      data: { name: "Updated Group" },
    });
  });

  it("should return null when group not found", async () => {
    mockPrisma.projectGroup.findFirst.mockResolvedValue(null);

    const result = await updateProjectGroup({
      companyUuid,
      groupUuid,
      name: "Updated",
    });

    expect(result).toBeNull();
    expect(mockPrisma.projectGroup.update).not.toHaveBeenCalled();
  });

  it("should update only name when description not provided", async () => {
    const existing = makeProjectGroup();
    const updated = makeProjectGroup({ name: "New Name" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(existing);
    mockPrisma.projectGroup.update.mockResolvedValue(updated);
    mockPrisma.researchProject.count.mockResolvedValue(0);

    await updateProjectGroup({
      companyUuid,
      groupUuid,
      name: "New Name",
    });

    expect(mockPrisma.projectGroup.update).toHaveBeenCalledWith({
      where: { uuid: groupUuid },
      data: { name: "New Name" },
    });
  });

  it("should update only description when name not provided", async () => {
    const existing = makeProjectGroup();
    const updated = makeProjectGroup({ description: "New desc" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(existing);
    mockPrisma.projectGroup.update.mockResolvedValue(updated);
    mockPrisma.researchProject.count.mockResolvedValue(0);

    await updateProjectGroup({
      companyUuid,
      groupUuid,
      description: "New desc",
    });

    expect(mockPrisma.projectGroup.update).toHaveBeenCalledWith({
      where: { uuid: groupUuid },
      data: { description: "New desc" },
    });
  });

  it("should update both name and description", async () => {
    const existing = makeProjectGroup();
    const updated = makeProjectGroup({ name: "New Name", description: "New desc" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(existing);
    mockPrisma.projectGroup.update.mockResolvedValue(updated);
    mockPrisma.researchProject.count.mockResolvedValue(0);

    await updateProjectGroup({
      companyUuid,
      groupUuid,
      name: "New Name",
      description: "New desc",
    });

    expect(mockPrisma.projectGroup.update).toHaveBeenCalledWith({
      where: { uuid: groupUuid },
      data: { name: "New Name", description: "New desc" },
    });
  });
});

// ===== deleteProjectGroup =====
describe("deleteProjectGroup", () => {
  it("should unassign projects and delete group", async () => {
    const group = makeProjectGroup();
    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.projectGroup.delete.mockResolvedValue(group);

    const result = await deleteProjectGroup(companyUuid, groupUuid);

    expect(result).toBe(true);
    expect(mockPrisma.researchProject.updateMany).toHaveBeenCalledWith({
      where: { groupUuid, companyUuid },
      data: { groupUuid: null },
    });
    expect(mockPrisma.projectGroup.delete).toHaveBeenCalledWith({
      where: { uuid: groupUuid },
    });
  });

  it("should return false when group not found", async () => {
    mockPrisma.projectGroup.findFirst.mockResolvedValue(null);

    const result = await deleteProjectGroup(companyUuid, groupUuid);

    expect(result).toBe(false);
    expect(mockPrisma.researchProject.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.projectGroup.delete).not.toHaveBeenCalled();
  });
});

// ===== getProjectGroup =====
describe("getProjectGroup", () => {
  it("should return group with projects list", async () => {
    const group = makeProjectGroup();
    const project = makeProject();

    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);

    const result = await getProjectGroup(companyUuid, groupUuid);

    expect(result).not.toBeNull();
    expect(result!.uuid).toBe(groupUuid);
    expect(result!.projectCount).toBe(1);
    expect(result!.projects).toHaveLength(1);
    expect(result!.projects[0].uuid).toBe(projectUuid);
  });

  it("should return null when group not found", async () => {
    mockPrisma.projectGroup.findFirst.mockResolvedValue(null);

    const result = await getProjectGroup(companyUuid, groupUuid);

    expect(result).toBeNull();
    expect(mockPrisma.researchProject.findMany).not.toHaveBeenCalled();
  });

  it("should order projects by updatedAt desc", async () => {
    const group = makeProjectGroup();
    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([]);

    await getProjectGroup(companyUuid, groupUuid);

    expect(mockPrisma.researchProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: "desc" },
      })
    );
  });
});

// ===== listProjectGroups =====
describe("listProjectGroups", () => {
  it("should return groups with project counts and ungrouped count", async () => {
    const group1 = makeProjectGroup({ uuid: "group-1" });
    const group2 = makeProjectGroup({ uuid: "group-2", name: "Group 2" });

    mockPrisma.projectGroup.findMany.mockResolvedValue([group1, group2]);
    mockPrisma.researchProject.groupBy.mockResolvedValue([
      { groupUuid: "group-1", _count: { _all: 3 } },
      { groupUuid: "group-2", _count: { _all: 5 } },
    ]);
    mockPrisma.researchProject.count.mockResolvedValue(2);

    const result = await listProjectGroups(companyUuid);

    expect(result.groups).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.ungroupedCount).toBe(2);
    expect(result.groups[0].projectCount).toBe(3);
    expect(result.groups[1].projectCount).toBe(5);
  });

  it("should handle groups with zero projects", async () => {
    const group = makeProjectGroup();
    mockPrisma.projectGroup.findMany.mockResolvedValue([group]);
    mockPrisma.researchProject.groupBy.mockResolvedValue([]);
    mockPrisma.researchProject.count.mockResolvedValue(0);

    const result = await listProjectGroups(companyUuid);

    expect(result.groups[0].projectCount).toBe(0);
  });

  it("should order groups by createdAt asc", async () => {
    mockPrisma.projectGroup.findMany.mockResolvedValue([]);
    mockPrisma.researchProject.groupBy.mockResolvedValue([]);
    mockPrisma.researchProject.count.mockResolvedValue(0);

    await listProjectGroups(companyUuid);

    expect(mockPrisma.projectGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("should handle empty groups list", async () => {
    mockPrisma.projectGroup.findMany.mockResolvedValue([]);
    mockPrisma.researchProject.groupBy.mockResolvedValue([]);
    mockPrisma.researchProject.count.mockResolvedValue(10);

    const result = await listProjectGroups(companyUuid);

    expect(result.groups).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.ungroupedCount).toBe(10);
  });
});

// ===== moveProjectToGroup =====
describe("moveProjectToGroup", () => {
  it("should move project to group and emit event", async () => {
    const project = makeProject({ groupUuid: null });
    const updatedProject = makeProject({ groupUuid });

    mockPrisma.researchProject.findFirst.mockResolvedValueOnce(project);
    mockPrisma.projectGroup.findFirst.mockResolvedValue(makeProjectGroup());
    mockPrisma.researchProject.update.mockResolvedValue(updatedProject);

    const result = await moveProjectToGroup(companyUuid, researchProjectUuid, groupUuid);

    expect(result).not.toBeNull();
    expect(result!.groupUuid).toBe(groupUuid);

    expect(mockPrisma.researchProject.update).toHaveBeenCalledWith({
      where: { uuid: projectUuid },
      data: { groupUuid },
    });

    expect(mockEventBus.emitChange).toHaveBeenCalledWith({
      companyUuid,
      researchProjectUuid,
      entityType: "research_project",
      entityUuid: researchProjectUuid,
      action: "updated",
    });
  });

  it("should move project to ungrouped (null)", async () => {
    const project = makeProject({ groupUuid: "group-old" });
    const updatedProject = makeProject({ groupUuid: null });

    mockPrisma.researchProject.findFirst.mockResolvedValue(project);
    mockPrisma.researchProject.update.mockResolvedValue(updatedProject);

    const result = await moveProjectToGroup(companyUuid, researchProjectUuid, null);

    expect(result).not.toBeNull();
    expect(result!.groupUuid).toBeNull();

    expect(mockPrisma.researchProject.update).toHaveBeenCalledWith({
      where: { uuid: projectUuid },
      data: { groupUuid: null },
    });
  });

  it("should return null when project not found", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);

    const result = await moveProjectToGroup(companyUuid, researchProjectUuid, groupUuid);

    expect(result).toBeNull();
    expect(mockPrisma.researchProject.update).not.toHaveBeenCalled();
  });

  it("should return null when target group not found", async () => {
    const project = makeProject();
    mockPrisma.researchProject.findFirst.mockResolvedValue(project);
    mockPrisma.projectGroup.findFirst.mockResolvedValue(null);

    const result = await moveProjectToGroup(companyUuid, researchProjectUuid, groupUuid);

    expect(result).toBeNull();
    expect(mockPrisma.researchProject.update).not.toHaveBeenCalled();
  });

  it("should not verify group when target is null", async () => {
    const project = makeProject();
    const updatedProject = makeProject({ groupUuid: null });

    mockPrisma.researchProject.findFirst.mockResolvedValue(project);
    mockPrisma.researchProject.update.mockResolvedValue(updatedProject);

    await moveProjectToGroup(companyUuid, researchProjectUuid, null);

    expect(mockPrisma.projectGroup.findFirst).not.toHaveBeenCalled();
  });
});

// ===== getGroupDashboard =====
describe("getGroupDashboard", () => {
  it("should return group dashboard with stats and activity", async () => {
    const group = makeProjectGroup();
    const project1 = makeProject({ uuid: "proj-1", name: "Project 1" });
    const project2 = makeProject({ uuid: "proj-2", name: "Project 2" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([project1, project2]);

    // Task stats
    mockPrisma.experimentRun.count
      .mockResolvedValueOnce(20) // total tasks
      .mockResolvedValueOnce(12); // completed tasks

    // Idea and proposal stats
    mockPrisma.researchQuestion.count.mockResolvedValue(5);
    mockPrisma.experimentDesign.count.mockResolvedValue(3);

    // Per-project stats
    mockPrisma.experimentRun.groupBy
      .mockResolvedValueOnce([
        { researchProjectUuid: "proj-1", _count: { _all: 10 } },
        { researchProjectUuid: "proj-2", _count: { _all: 10 } },
      ])
      .mockResolvedValueOnce([
        { researchProjectUuid: "proj-1", _count: { _all: 6 } },
        { researchProjectUuid: "proj-2", _count: { _all: 6 } },
      ]);

    mockPrisma.activity.findMany.mockResolvedValue([
      {
        uuid: "act-1",
        researchProjectUuid: "proj-1",
        targetType: "experiment_run",
        targetUuid: "task-1",
        action: "created",
        value: null,
        actorType: "user",
        actorUuid: "user-1",
        createdAt: now,
      },
    ]);

    const result = await getGroupDashboard(companyUuid, groupUuid);

    expect(result).not.toBeNull();
    expect(result!.group.uuid).toBe(groupUuid);
    expect(result!.stats.projectCount).toBe(2);
    expect(result!.stats.totalExperimentRuns).toBe(20);
    expect(result!.stats.completedExperimentRuns).toBe(12);
    expect(result!.stats.completionRate).toBe(60);
    expect(result!.stats.openResearchQuestions).toBe(5);
    expect(result!.stats.activeExperimentDesigns).toBe(3);
    expect(result!.projects).toHaveLength(2);
    expect(result!.projects[0].completionRate).toBe(60);
    expect(result!.recentActivity).toHaveLength(1);
  });

  it("should return null when group not found", async () => {
    mockPrisma.projectGroup.findFirst.mockResolvedValue(null);

    const result = await getGroupDashboard(companyUuid, groupUuid);

    expect(result).toBeNull();
  });

  it("should handle group with no projects", async () => {
    const group = makeProjectGroup();
    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([]);

    const result = await getGroupDashboard(companyUuid, groupUuid);

    expect(result).not.toBeNull();
    expect(result!.stats.projectCount).toBe(0);
    expect(result!.stats.totalExperimentRuns).toBe(0);
    expect(result!.stats.completedExperimentRuns).toBe(0);
    expect(result!.stats.completionRate).toBe(0);
    expect(result!.projects).toEqual([]);
    expect(result!.recentActivity).toEqual([]);
  });

  it("should calculate completion rate as 0 when no tasks", async () => {
    const group = makeProjectGroup();
    const project = makeProject();

    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.experimentRun.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.researchQuestion.count.mockResolvedValue(0);
    mockPrisma.experimentDesign.count.mockResolvedValue(0);
    mockPrisma.experimentRun.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const result = await getGroupDashboard(companyUuid, groupUuid);

    expect(result!.stats.completionRate).toBe(0);
  });

  it("should limit recent activity to 20 items", async () => {
    const group = makeProjectGroup();
    const project = makeProject();

    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);
    mockPrisma.researchQuestion.count.mockResolvedValue(0);
    mockPrisma.experimentDesign.count.mockResolvedValue(0);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([]);

    await getGroupDashboard(companyUuid, groupUuid);

    expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
      })
    );
  });

  it("should resolve project names in activity", async () => {
    const group = makeProjectGroup();
    const project = makeProject({ uuid: researchProjectUuid, name: "My Project" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);
    mockPrisma.researchQuestion.count.mockResolvedValue(0);
    mockPrisma.experimentDesign.count.mockResolvedValue(0);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([
      {
        uuid: "act-1",
        researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: "task-1",
        action: "created",
        value: null,
        actorType: "user",
        actorUuid: "user-1",
        createdAt: now,
      },
    ]);

    const result = await getGroupDashboard(companyUuid, groupUuid);

    expect(result!.recentActivity[0].projectName).toBe("My Project");
  });

  it("should use Unknown for missing project names in activity", async () => {
    const group = makeProjectGroup();
    const project = makeProject({ uuid: "proj-1", name: "Project 1" });

    mockPrisma.projectGroup.findFirst.mockResolvedValue(group);
    mockPrisma.researchProject.findMany.mockResolvedValue([project]);
    mockPrisma.experimentRun.count.mockResolvedValue(0);
    mockPrisma.researchQuestion.count.mockResolvedValue(0);
    mockPrisma.experimentDesign.count.mockResolvedValue(0);
    mockPrisma.experimentRun.groupBy.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([
      {
        uuid: "act-1",
        researchProjectUuid: "unknown-project",
        targetType: "experiment_run",
        targetUuid: "task-1",
        action: "created",
        value: null,
        actorType: "user",
        actorUuid: "user-1",
        createdAt: now,
      },
    ]);

    const result = await getGroupDashboard(companyUuid, groupUuid);

    expect(result!.recentActivity[0].projectName).toBe("Unknown");
  });
});

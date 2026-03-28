import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { getProjectMetricsSnapshots } from "@/services/project-metrics.service";

// ============================================================
// Interfaces
// ============================================================

export interface ProjectGroupCreateParams {
  companyUuid: string;
  name: string;
  description?: string | null;
}

export interface ProjectGroupUpdateParams {
  companyUuid: string;
  groupUuid: string;
  name?: string;
  description?: string | null;
}

export interface ProjectGroupResponse {
  uuid: string;
  name: string;
  description: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectGroupDetailResponse extends ProjectGroupResponse {
  projects: {
    uuid: string;
    name: string;
    description: string | null;
  }[];
}

export interface GroupDashboardResponse {
  group: {
    uuid: string;
    name: string;
    description: string | null;
  };
  stats: {
    projectCount: number;
    totalExperimentRuns: number;
    completedExperimentRuns: number;
    completionRate: number;
    openResearchQuestions: number;
    activeExperimentDesigns: number;
    totalTasks: number;
    completedTasks: number;
    openIdeas: number;
    activeProposals: number;
  };
  projects: {
    uuid: string;
    name: string;
    experimentRunCount: number;
    taskCount: number;
    completionRate: number;
  }[];
  recentActivity: {
    uuid: string;
    researchProjectUuid: string;
    projectUuid: string;
    projectName: string;
    targetType: string;
    targetUuid: string;
    action: string;
    value: unknown;
    actorType: string;
    actorUuid: string;
    createdAt: string;
  }[];
}

// ============================================================
// CRUD
// ============================================================

export async function createProjectGroup(
  params: ProjectGroupCreateParams
): Promise<ProjectGroupResponse> {
  const group = await prisma.projectGroup.create({
    data: {
      companyUuid: params.companyUuid,
      name: params.name,
      description: params.description ?? "",
    },
  });

  return {
    uuid: group.uuid,
    name: group.name,
    description: group.description,
    projectCount: 0,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export async function updateProjectGroup(
  params: ProjectGroupUpdateParams
): Promise<ProjectGroupResponse | null> {
  const existing = await prisma.projectGroup.findFirst({
    where: { uuid: params.groupUuid, companyUuid: params.companyUuid },
  });
  if (!existing) return null;

  const updated = await prisma.projectGroup.update({
    where: { uuid: params.groupUuid },
    data: {
      ...(params.name !== undefined && { name: params.name }),
      ...(params.description !== undefined && { description: params.description }),
    },
  });

  const projectCount = await prisma.researchProject.count({
    where: { groupUuid: params.groupUuid, companyUuid: params.companyUuid },
  });

  return {
    uuid: updated.uuid,
    name: updated.name,
    description: updated.description,
    projectCount,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function deleteProjectGroup(
  companyUuid: string,
  groupUuid: string
): Promise<boolean> {
  const existing = await prisma.projectGroup.findFirst({
    where: { uuid: groupUuid, companyUuid },
  });
  if (!existing) return false;

  // Unassign all projects from this group
  await prisma.researchProject.updateMany({
    where: { groupUuid, companyUuid },
    data: { groupUuid: null },
  });

  await prisma.projectGroup.delete({
    where: { uuid: groupUuid },
  });

  return true;
}

export async function getProjectGroup(
  companyUuid: string,
  groupUuid: string
): Promise<ProjectGroupDetailResponse | null> {
  const group = await prisma.projectGroup.findFirst({
    where: { uuid: groupUuid, companyUuid },
  });
  if (!group) return null;

  const projects = await prisma.researchProject.findMany({
    where: { groupUuid, companyUuid },
    select: { uuid: true, name: true, description: true },
    orderBy: { updatedAt: "desc" },
  });

  return {
    uuid: group.uuid,
    name: group.name,
    description: group.description,
    projectCount: projects.length,
    projects,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export async function listProjectGroups(
  companyUuid: string
): Promise<{ groups: ProjectGroupResponse[]; total: number; ungroupedCount: number }> {
  const groups = await prisma.projectGroup.findMany({
    where: { companyUuid },
    orderBy: { createdAt: "asc" },
  });

  // Batch count projects per group
  const groupUuids = groups.map((g) => g.uuid);
  const projectCounts =
    groupUuids.length > 0
      ? await prisma.researchProject.groupBy({
          by: ["groupUuid"],
          where: { companyUuid, groupUuid: { in: groupUuids } },
          _count: { _all: true },
        })
      : [];

  const countMap = new Map(
    projectCounts.map((pc) => [pc.groupUuid, pc._count._all])
  );

  const result: ProjectGroupResponse[] = groups.map((g) => ({
    uuid: g.uuid,
    name: g.name,
    description: g.description,
    projectCount: countMap.get(g.uuid) ?? 0,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  }));

  // Count ungrouped projects
  const ungroupedCount = await prisma.researchProject.count({
    where: { companyUuid, groupUuid: null },
  });

  return { groups: result, total: groups.length, ungroupedCount };
}

// ============================================================
// Project ↔ Group
// ============================================================

export async function moveProjectToGroup(
  companyUuid: string,
  researchProjectUuid: string,
  targetGroupUuid: string | null
): Promise<{ uuid: string; name: string; groupUuid: string | null } | null> {
  // Verify project belongs to company
  const project = await prisma.researchProject.findFirst({
    where: { uuid: researchProjectUuid, companyUuid },
  });
  if (!project) return null;

  // Verify target group belongs to company (if not null)
  if (targetGroupUuid) {
    const group = await prisma.projectGroup.findFirst({
      where: { uuid: targetGroupUuid, companyUuid },
    });
    if (!group) return null;
  }

  const updated = await prisma.researchProject.update({
    where: { uuid: researchProjectUuid },
    data: { groupUuid: targetGroupUuid },
  });

  eventBus.emitChange({
    companyUuid,
    researchProjectUuid,
    entityType: "research_project",
    entityUuid: researchProjectUuid,
    action: "updated",
  });

  return {
    uuid: updated.uuid,
    name: updated.name,
    groupUuid: updated.groupUuid,
  };
}

// ============================================================
// Dashboard (aggregated stats)
// ============================================================

export async function getGroupDashboard(
  companyUuid: string,
  groupUuid: string
): Promise<GroupDashboardResponse | null> {
  const group = await prisma.projectGroup.findFirst({
    where: { uuid: groupUuid, companyUuid },
  });
  if (!group) return null;

  // Get all projects in this group
  const projects = await prisma.researchProject.findMany({
    where: { groupUuid, companyUuid },
    select: { uuid: true, name: true },
  });

  const researchProjectUuids = projects.map((p) => p.uuid);

  if (researchProjectUuids.length === 0) {
    return {
      group: { uuid: group.uuid, name: group.name, description: group.description },
      stats: {
        projectCount: 0,
        totalExperimentRuns: 0,
        completedExperimentRuns: 0,
        completionRate: 0,
        openResearchQuestions: 0,
        activeExperimentDesigns: 0,
        totalTasks: 0,
        completedTasks: 0,
        openIdeas: 0,
        activeProposals: 0,
      },
      projects: [],
      recentActivity: [],
    };
  }

  const metricsMap = await getProjectMetricsSnapshots(companyUuid, researchProjectUuids);

  const projectStats = projects.map((p) => {
    const metrics = metricsMap.get(p.uuid);
    const tc = metrics?.experimentRuns.total ?? 0;
    const dc = metrics?.experimentRuns.completed ?? 0;
    return {
      uuid: p.uuid,
      name: p.name,
      experimentRunCount: tc,
      taskCount: tc,
      completionRate: tc > 0 ? Math.round((dc / tc) * 100) : 0,
    };
  });

  const aggregateStats = Array.from(metricsMap.values()).reduce(
    (acc, metrics) => {
      acc.totalExperimentRuns += metrics.experimentRuns.total;
      acc.completedExperimentRuns += metrics.experimentRuns.completed;
      acc.openResearchQuestions += metrics.researchQuestions.open + metrics.researchQuestions.elaborating;
      acc.activeExperimentDesigns += metrics.experimentDesigns.active;
      return acc;
    },
    {
      totalExperimentRuns: 0,
      completedExperimentRuns: 0,
      openResearchQuestions: 0,
      activeExperimentDesigns: 0,
    }
  );

  // Recent activity across all projects in the group
  const recentActivity = await prisma.activity.findMany({
    where: { researchProjectUuid: { in: researchProjectUuids }, companyUuid },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Resolve project names for activity
  const projectNameMap = new Map(projects.map((p) => [p.uuid, p.name]));

  return {
    group: { uuid: group.uuid, name: group.name, description: group.description },
    stats: {
      projectCount: projects.length,
      totalExperimentRuns: aggregateStats.totalExperimentRuns,
      completedExperimentRuns: aggregateStats.completedExperimentRuns,
      completionRate:
        aggregateStats.totalExperimentRuns > 0
          ? Math.round((aggregateStats.completedExperimentRuns / aggregateStats.totalExperimentRuns) * 100)
          : 0,
      openResearchQuestions: aggregateStats.openResearchQuestions,
      activeExperimentDesigns: aggregateStats.activeExperimentDesigns,
      totalTasks: aggregateStats.totalExperimentRuns,
      completedTasks: aggregateStats.completedExperimentRuns,
      openIdeas: aggregateStats.openResearchQuestions,
      activeProposals: aggregateStats.activeExperimentDesigns,
    },
    projects: projectStats,
    recentActivity: recentActivity.map((a) => ({
      uuid: a.uuid,
      researchProjectUuid: a.researchProjectUuid,
      projectUuid: a.researchProjectUuid,
      projectName: projectNameMap.get(a.researchProjectUuid) ?? "Unknown",
      targetType: a.targetType,
      targetUuid: a.targetUuid,
      action: a.action,
      value: a.value,
      actorType: a.actorType,
      actorUuid: a.actorUuid,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

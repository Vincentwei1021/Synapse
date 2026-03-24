// src/services/research-project.service.ts
// ResearchProject Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface ResearchProjectListParams {
  companyUuid: string;
  skip: number;
  take: number;
}

export interface ResearchProjectCreateParams {
  companyUuid: string;
  name: string;
  description?: string | null;
  goal?: string | null;
  datasets?: string[] | null;
  evaluationMethods?: string[] | null;
  groupUuid?: string | null;
}

export interface ResearchProjectUpdateParams {
  name?: string;
  description?: string | null;
  goal?: string | null;
  datasets?: string[] | null;
  evaluationMethods?: string[] | null;
}

// List projects query
export async function listResearchProjects({ companyUuid, skip, take }: ResearchProjectListParams) {
  const [projects, total] = await Promise.all([
    prisma.researchProject.findMany({
      where: { companyUuid },
      skip,
      take,
      orderBy: { updatedAt: "desc" },
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
        groupUuid: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            researchQuestions: true,
            documents: true,
            experimentRuns: true,
            experimentDesigns: true,
          },
        },
      },
    }),
    prisma.researchProject.count({ where: { companyUuid } }),
  ]);

  return { projects, total };
}

// Get project details
export async function getResearchProject(companyUuid: string, uuid: string) {
  return prisma.researchProject.findFirst({
    where: { uuid, companyUuid },
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
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          researchQuestions: true,
          documents: true,
          experimentRuns: true,
          experimentDesigns: true,
          activities: true,
        },
      },
    },
  });
}

// Verify if project exists
export async function researchProjectExists(companyUuid: string, researchProjectUuid: string): Promise<boolean> {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: researchProjectUuid, companyUuid },
    select: { uuid: true },
  });
  return !!project;
}

// Get basic project info by UUID
export async function getResearchProjectByUuid(companyUuid: string, uuid: string) {
  return prisma.researchProject.findFirst({
    where: { uuid, companyUuid },
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
}

// Get project UUIDs by group UUID
export async function getResearchProjectUuidsByGroup(companyUuid: string, groupUuid: string): Promise<string[]> {
  const projects = await prisma.researchProject.findMany({
    where: {
      companyUuid,
      groupUuid,
    },
    select: { uuid: true },
  });
  return projects.map((p) => p.uuid);
}

// Create project
export async function createResearchProject({
  companyUuid,
  name,
  description,
  goal,
  datasets,
  evaluationMethods,
  groupUuid,
}: ResearchProjectCreateParams) {
  return prisma.researchProject.create({
    data: {
      companyUuid,
      name,
      description,
      goal: goal ?? null,
      datasets: datasets ?? [],
      evaluationMethods: evaluationMethods ?? [],
      groupUuid: groupUuid ?? null,
    },
    select: {
      uuid: true,
      name: true,
      description: true,
      goal: true,
      datasets: true,
      evaluationMethods: true,
      groupUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// Update project
export async function updateResearchProject(uuid: string, data: ResearchProjectUpdateParams) {
  const updateData: Record<string, unknown> = { ...data };

  if (data.datasets !== undefined) {
    updateData.datasets = data.datasets === null ? Prisma.JsonNull : data.datasets;
  }

  if (data.evaluationMethods !== undefined) {
    updateData.evaluationMethods =
      data.evaluationMethods === null ? Prisma.JsonNull : data.evaluationMethods;
  }

  return prisma.researchProject.update({
    where: { uuid },
    data: updateData,
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
      createdAt: true,
      updatedAt: true,
    },
  });
}

// Delete project
export async function deleteResearchProject(uuid: string) {
  return prisma.researchProject.delete({ where: { uuid } });
}

// Get company-level overview stats (for Projects list page)
export async function getCompanyOverviewStats(companyUuid: string) {
  const [researchProjectCount, experimentRunCount, openExperimentDesignCount, researchQuestionCount] = await Promise.all([
    prisma.researchProject.count({ where: { companyUuid } }),
    prisma.experimentRun.count({ where: { companyUuid } }),
    prisma.experimentDesign.count({ where: { companyUuid, status: "pending" } }),
    prisma.researchQuestion.count({ where: { companyUuid } }),
  ]);

  return {
    researchProjects: researchProjectCount,
    experimentRuns: experimentRunCount,
    openExperimentDesigns: openExperimentDesignCount,
    researchQuestions: researchQuestionCount,
  };
}

// Get project list with task completion stats (for Projects list page)
export async function listResearchProjectsWithStats({ companyUuid, skip, take }: ResearchProjectListParams) {
  const { projects, total } = await listResearchProjects({ companyUuid, skip, take });

  // Batch query completed task count for each project
  const researchProjectUuids = projects.map((p) => p.uuid);
  const doneCounts = await prisma.experimentRun.groupBy({
    by: ["researchProjectUuid"],
    where: { companyUuid, researchProjectUuid: { in: researchProjectUuids }, status: "done" },
    _count: true,
  });
  const doneMap = new Map(doneCounts.map((d) => [d.researchProjectUuid, d._count]));

  return {
    projects: projects.map((p) => ({
      ...p,
      experimentRunsDone: doneMap.get(p.uuid) || 0,
    })),
    total,
  };
}

// Get project statistics (for Dashboard)
export async function getResearchProjectStats(companyUuid: string, researchProjectUuid: string) {
  const [researchQuestionsStats, experimentRunsStats, experimentDesignsStats, documentsCount] = await Promise.all([
    // Ideas stats
    prisma.researchQuestion.groupBy({
      by: ["status"],
      where: { researchProjectUuid, companyUuid },
      _count: true,
    }),
    // Tasks stats
    prisma.experimentRun.groupBy({
      by: ["status"],
      where: { researchProjectUuid, companyUuid },
      _count: true,
    }),
    // Proposals stats
    prisma.experimentDesign.groupBy({
      by: ["status"],
      where: { researchProjectUuid, companyUuid },
      _count: true,
    }),
    // Documents total count
    prisma.document.count({
      where: { researchProjectUuid, companyUuid },
    }),
  ]);

  // Parse Ideas stats
  const researchQuestionStatusMap = new Map(researchQuestionsStats.map((s) => [s.status, s._count]));
  const researchQuestionsTotal = researchQuestionsStats.reduce((sum, s) => sum + s._count, 0);
  const researchQuestionsOpen = researchQuestionStatusMap.get("open") || 0;

  // Parse Tasks stats (per-status for pipeline visualization)
  const experimentRunStatusMap = new Map(experimentRunsStats.map((s) => [s.status, s._count]));
  const experimentRunsTotal = experimentRunsStats.reduce((sum, s) => sum + s._count, 0);
  const experimentRunsInProgress = experimentRunStatusMap.get("in_progress") || 0;
  const experimentRunsTodo = (experimentRunStatusMap.get("open") || 0) + (experimentRunStatusMap.get("assigned") || 0);
  const experimentRunsToVerify = experimentRunStatusMap.get("to_verify") || 0;
  const experimentRunsDone = (experimentRunStatusMap.get("done") || 0) + (experimentRunStatusMap.get("closed") || 0);

  // Parse Proposals stats
  const experimentDesignStatusMap = new Map(experimentDesignsStats.map((s) => [s.status, s._count]));
  const experimentDesignsTotal = experimentDesignsStats.reduce((sum, s) => sum + s._count, 0);
  const experimentDesignsPending = experimentDesignStatusMap.get("pending") || 0;

  return {
    researchQuestions: { total: researchQuestionsTotal, open: researchQuestionsOpen },
    experimentRuns: { total: experimentRunsTotal, inProgress: experimentRunsInProgress, todo: experimentRunsTodo, toVerify: experimentRunsToVerify, done: experimentRunsDone },
    experimentDesigns: { total: experimentDesignsTotal, pending: experimentDesignsPending },
    documents: { total: documentsCount },
  };
}

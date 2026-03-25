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
            experiments: true,
            activities: true,
          },
        },
      },
    }),
    prisma.researchProject.count({ where: { companyUuid } }),
  ]);

  return { projects, total };
}

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
          experiments: true,
          activities: true,
        },
      },
    },
  });
}

export async function researchProjectExists(companyUuid: string, researchProjectUuid: string): Promise<boolean> {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: researchProjectUuid, companyUuid },
    select: { uuid: true },
  });
  return !!project;
}

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

export async function getResearchProjectUuidsByGroup(companyUuid: string, groupUuid: string): Promise<string[]> {
  const projects = await prisma.researchProject.findMany({
    where: {
      companyUuid,
      groupUuid,
    },
    select: { uuid: true },
  });
  return projects.map((project) => project.uuid);
}

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

export async function deleteResearchProject(uuid: string) {
  return prisma.researchProject.delete({ where: { uuid } });
}

export async function getCompanyOverviewStats(companyUuid: string) {
  const [researchProjectCount, experimentCount, pendingReviewCount, researchQuestionCount] = await Promise.all([
    prisma.researchProject.count({ where: { companyUuid } }),
    prisma.experiment.count({ where: { companyUuid } }),
    prisma.experiment.count({ where: { companyUuid, status: "pending_review" } }),
    prisma.researchQuestion.count({ where: { companyUuid } }),
  ]);

  return {
    researchProjects: researchProjectCount,
    experimentRuns: experimentCount,
    openExperimentDesigns: pendingReviewCount,
    researchQuestions: researchQuestionCount,
  };
}

export async function listResearchProjectsWithStats({ companyUuid, skip, take }: ResearchProjectListParams) {
  const { projects, total } = await listResearchProjects({ companyUuid, skip, take });

  const researchProjectUuids = projects.map((project) => project.uuid);
  const doneCounts = researchProjectUuids.length
    ? await prisma.experiment.groupBy({
        by: ["researchProjectUuid"],
        where: { companyUuid, researchProjectUuid: { in: researchProjectUuids }, status: "completed" },
        _count: true,
      })
    : [];
  const doneMap = new Map(doneCounts.map((count) => [count.researchProjectUuid, count._count]));

  return {
    projects: projects.map((project) => ({
      ...project,
      experimentRunsDone: doneMap.get(project.uuid) || 0,
    })),
    total,
  };
}

export async function getResearchProjectStats(companyUuid: string, researchProjectUuid: string) {
  const [researchQuestionStats, experimentStats, documentsCount] = await Promise.all([
    prisma.researchQuestion.groupBy({
      by: ["status"],
      where: { researchProjectUuid, companyUuid },
      _count: true,
    }),
    prisma.experiment.groupBy({
      by: ["status"],
      where: { researchProjectUuid, companyUuid },
      _count: true,
    }),
    prisma.document.count({
      where: { researchProjectUuid, companyUuid },
    }),
  ]);

  const researchQuestionStatusMap = new Map(researchQuestionStats.map((stat) => [stat.status, stat._count]));
  const experimentStatusMap = new Map(experimentStats.map((stat) => [stat.status, stat._count]));

  const researchQuestionsTotal = researchQuestionStats.reduce((sum, stat) => sum + stat._count, 0);
  const researchQuestionsOpen =
    (researchQuestionStatusMap.get("open") || 0) + (researchQuestionStatusMap.get("elaborating") || 0);

  const experimentsTotal = experimentStats.reduce((sum, stat) => sum + stat._count, 0);
  const experimentsDraft = experimentStatusMap.get("draft") || 0;
  const experimentsPendingReview = experimentStatusMap.get("pending_review") || 0;
  const experimentsPendingStart = experimentStatusMap.get("pending_start") || 0;
  const experimentsInProgress = experimentStatusMap.get("in_progress") || 0;
  const experimentsDone = experimentStatusMap.get("completed") || 0;

  return {
    researchQuestions: {
      total: researchQuestionsTotal,
      open: researchQuestionsOpen,
      elaborating: researchQuestionStatusMap.get("elaborating") || 0,
      experimentCreated: researchQuestionStatusMap.get("experiment_created") || 0,
      completed: researchQuestionStatusMap.get("completed") || 0,
    },
    experimentRuns: {
      total: experimentsTotal,
      inProgress: experimentsInProgress,
      todo: experimentsDraft,
      toVerify: experimentsPendingReview + experimentsPendingStart,
      done: experimentsDone,
    },
    experimentDesigns: {
      total: experimentsTotal,
      pending: experimentsPendingReview,
    },
    experiments: {
      total: experimentsTotal,
      draft: experimentsDraft,
      pendingReview: experimentsPendingReview,
      pendingStart: experimentsPendingStart,
      inProgress: experimentsInProgress,
      completed: experimentsDone,
    },
    documents: { total: documentsCount },
  };
}

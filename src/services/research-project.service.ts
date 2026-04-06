// src/services/research-project.service.ts
// ResearchProject Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getProjectMetricsSnapshot, getProjectMetricsSnapshots } from "@/services/project-metrics.service";

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
  computePoolUuid?: string | null;
}

export interface ResearchProjectUpdateParams {
  name?: string;
  description?: string | null;
  goal?: string | null;
  datasets?: string[] | null;
  evaluationMethods?: string[] | null;
  computePoolUuid?: string | null;
  autonomousLoopEnabled?: boolean;
  autonomousLoopAgentUuid?: string | null;
  autoSearchEnabled?: boolean;
  autoSearchAgentUuid?: string | null;
  deepResearchDocUuid?: string | null;
  repoUrl?: string | null;
  githubUsername?: string | null;
  githubToken?: string | null;
}

export interface ResearchProjectDashboardData {
  project: NonNullable<Awaited<ReturnType<typeof getResearchProject>>>;
  stats: Awaited<ReturnType<typeof getResearchProjectStats>>;
  recentExperiments: Array<{
    uuid: string;
    title: string;
    status: string;
    outcome: string | null;
  }>;
  recentQuestions: Array<{
    uuid: string;
    title: string;
    status: string;
    reviewStatus: string;
  }>;
}

export interface ResearchProjectInsightsData {
  project: {
    latestSynthesisAt: Date | null;
    latestSynthesisIdeaCount: number | null;
    latestSynthesisSummary: string | null;
  };
  completedExperiments: Array<{
    uuid: string;
    title: string;
    outcome: string | null;
    completedAt: Date | null;
    researchQuestion: {
      title: string;
    } | null;
  }>;
}

export interface ResearchProjectExportData {
  project: NonNullable<Awaited<ReturnType<typeof getResearchProject>>>;
  designs: Array<{ uuid: string; title: string }>;
  questions: Array<{ uuid: string; title: string; status: string }>;
  runs: Array<{
    uuid: string;
    title: string;
    experimentDesignUuid: string | null;
    experimentResults: unknown;
    outcome: string | null;
  }>;
  rdrDocs: Array<{ title: string; content: string | null; createdAt: Date }>;
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

export async function getResearchProjectDetailRef(companyUuid: string, uuid: string) {
  return prisma.researchProject.findFirst({
    where: { uuid, companyUuid },
    select: { uuid: true },
  });
}

export async function researchProjectExists(companyUuid: string, researchProjectUuid: string): Promise<boolean> {
  const project = await getResearchProjectDetailRef(companyUuid, researchProjectUuid);
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
      repoUrl: true,
      githubUsername: true,
      githubToken: true,
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
  computePoolUuid,
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
      computePoolUuid: computePoolUuid ?? null,
    },
    select: {
      uuid: true,
      name: true,
      description: true,
      goal: true,
      datasets: true,
      evaluationMethods: true,
      groupUuid: true,
      computePoolUuid: true,
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

  // Allow clearing the compute pool binding by passing null
  if (data.computePoolUuid !== undefined) {
    updateData.computePoolUuid = data.computePoolUuid ?? null;
  }

  // Allow clearing agent UUID bindings by passing null
  if (data.autonomousLoopAgentUuid !== undefined) {
    updateData.autonomousLoopAgentUuid = data.autonomousLoopAgentUuid ?? null;
  }

  if (data.autoSearchAgentUuid !== undefined) {
    updateData.autoSearchAgentUuid = data.autoSearchAgentUuid ?? null;
  }

  if (data.deepResearchDocUuid !== undefined) {
    updateData.deepResearchDocUuid = data.deepResearchDocUuid ?? null;
  }

  if (data.repoUrl !== undefined) {
    updateData.repoUrl = data.repoUrl ?? null;
  }

  if (data.githubUsername !== undefined) {
    updateData.githubUsername = data.githubUsername ?? null;
  }

  // Only update githubToken if a non-empty string is provided
  if (data.githubToken && data.githubToken.trim() !== "") {
    updateData.githubToken = data.githubToken.trim();
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
      computePoolUuid: true,
      autonomousLoopEnabled: true,
      autonomousLoopAgentUuid: true,
      autoSearchEnabled: true,
      autoSearchAgentUuid: true,
      deepResearchDocUuid: true,
      repoUrl: true,
      githubUsername: true,
      latestSynthesisAt: true,
      latestSynthesisIdeaCount: true,
      latestSynthesisSummary: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteResearchProject(uuid: string) {
  // Clear self-referencing parent links on research questions first
  // (parentQuestionUuid has onDelete: Restrict which blocks cascade)
  await prisma.researchQuestion.updateMany({
    where: { researchProjectUuid: uuid, parentQuestionUuid: { not: null } },
    data: { parentQuestionUuid: null },
  });
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
  const metrics = await getProjectMetricsSnapshots(companyUuid, researchProjectUuids);

  return {
    projects: projects.map((project) => {
      const projectMetrics = metrics.get(project.uuid) ?? {
        researchProjectUuid: project.uuid,
        researchQuestions: { total: 0, open: 0, elaborating: 0, proposalCreated: 0, completed: 0, closed: 0 },
        experiments: { total: 0, draft: 0, pendingReview: 0, pendingStart: 0, inProgress: 0, completed: 0 },
        experimentDesigns: { total: 0, draft: 0, pending: 0, approved: 0, rejected: 0, closed: 0, active: 0 },
        experimentRuns: { total: 0, open: 0, assigned: 0, inProgress: 0, toVerify: 0, done: 0, closed: 0, completed: 0 },
        documents: { total: 0 },
        completionRate: 0,
      };

      return {
        ...project,
        experimentRunsDone: projectMetrics.experiments.completed,
        metrics: projectMetrics,
      };
    }),
    total,
  };
}

export async function getResearchProjectStats(companyUuid: string, researchProjectUuid: string) {
  const metrics = await getProjectMetricsSnapshot(companyUuid, researchProjectUuid);

  return {
    researchQuestions: {
      total: metrics.researchQuestions.total,
      open: metrics.researchQuestions.open + metrics.researchQuestions.elaborating,
      elaborating: metrics.researchQuestions.elaborating,
      proposalCreated: metrics.researchQuestions.proposalCreated,
      completed: metrics.researchQuestions.completed,
    },
    experimentRuns: {
      total: metrics.experiments.total,
      inProgress: metrics.experiments.inProgress,
      todo: metrics.experiments.draft,
      toVerify: metrics.experiments.pendingReview + metrics.experiments.pendingStart,
      done: metrics.experiments.completed,
    },
    experimentDesigns: {
      total: metrics.experiments.total,
      pending: metrics.experiments.pendingReview,
    },
    experiments: {
      total: metrics.experiments.total,
      draft: metrics.experiments.draft,
      pendingReview: metrics.experiments.pendingReview,
      pendingStart: metrics.experiments.pendingStart,
      inProgress: metrics.experiments.inProgress,
      completed: metrics.experiments.completed,
    },
    documents: { total: metrics.documents.total },
    completionRate: metrics.completionRate,
  };
}

export async function getResearchProjectDashboardData(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<ResearchProjectDashboardData | null> {
  const [project, stats, recentExperiments, recentQuestions] = await Promise.all([
    getResearchProject(companyUuid, researchProjectUuid),
    getResearchProjectStats(companyUuid, researchProjectUuid),
    prisma.experiment.findMany({
      where: { companyUuid, researchProjectUuid },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        uuid: true,
        title: true,
        status: true,
        outcome: true,
      },
    }),
    prisma.researchQuestion.findMany({
      where: {
        companyUuid,
        researchProjectUuid,
        reviewStatus: { not: "rejected" },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        uuid: true,
        title: true,
        status: true,
        reviewStatus: true,
      },
    }),
  ]);

  if (!project) {
    return null;
  }

  return {
    project,
    stats,
    recentExperiments,
    recentQuestions,
  };
}

export async function getResearchProjectInsightsData(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<ResearchProjectInsightsData | null> {
  const [project, completedExperiments] = await Promise.all([
    prisma.researchProject.findFirst({
      where: { uuid: researchProjectUuid, companyUuid },
      select: {
        latestSynthesisAt: true,
        latestSynthesisIdeaCount: true,
        latestSynthesisSummary: true,
      },
    }),
    prisma.experiment.findMany({
      where: {
        companyUuid,
        researchProjectUuid,
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      take: 8,
      select: {
        uuid: true,
        title: true,
        outcome: true,
        completedAt: true,
        researchQuestion: {
          select: {
            title: true,
          },
        },
      },
    }),
  ]);

  if (!project) {
    return null;
  }

  return {
    project,
    completedExperiments,
  };
}

export async function getResearchProjectExportData(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<ResearchProjectExportData | null> {
  const [project, designs, questions, runs, rdrDocs] = await Promise.all([
    getResearchProject(companyUuid, researchProjectUuid),
    prisma.experimentDesign.findMany({
      where: {
        companyUuid,
        researchProjectUuid,
      },
      select: { uuid: true, title: true },
    }),
    prisma.researchQuestion.findMany({
      where: {
        companyUuid,
        researchProjectUuid,
      },
      select: { uuid: true, title: true, status: true },
    }),
    prisma.experimentRun.findMany({
      where: {
        companyUuid,
        researchProjectUuid,
      },
      select: {
        uuid: true,
        title: true,
        experimentDesignUuid: true,
        experimentResults: true,
        outcome: true,
      },
    }),
    prisma.document.findMany({
      where: {
        companyUuid,
        researchProjectUuid,
        type: "rdr",
      },
      select: { title: true, content: true, createdAt: true },
    }),
  ]);

  if (!project) {
    return null;
  }

  return {
    project,
    designs,
    questions,
    runs,
    rdrDocs,
  };
}

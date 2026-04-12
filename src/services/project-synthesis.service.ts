import { prisma } from "@/lib/prisma";
import * as notificationService from "@/services/notification.service";

function stringifyMetricBlock(results: unknown): string[] {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    return [];
  }

  return Object.entries(results as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number" || typeof value === "string" || typeof value === "boolean")
    .map(([key, value]) => `- ${key}: ${String(value)}`);
}

function summarizeExperiments(
  completedIdeas: Array<{
    title: string;
    experiments: Array<{
      title: string;
      outcome: string | null;
      results: unknown;
    }>;
  }>,
) {
  const experiments = completedIdeas.flatMap((idea) =>
    idea.experiments.map((experiment) => ({
      ideaTitle: idea.title,
      ...experiment,
    })),
  );

  const successCount = experiments.filter((experiment) => experiment.outcome?.toLowerCase().includes("success")).length;
  const failedCount = experiments.filter((experiment) => experiment.outcome?.toLowerCase().includes("fail")).length;
  const summary = `${completedIdeas.length} idea(s), ${experiments.length} completed experiment(s), ${successCount} marked as successes, ${failedCount} marked as failures or regressions.`;

  return { experiments, summary };
}

function buildMarkdown(
  projectName: string,
  completedIdeas: Array<{
    title: string;
    content: string | null;
    sourceType: string;
    experiments: Array<{
      title: string;
      outcome: string | null;
      results: unknown;
    }>;
  }>,
) {
  const { summary } = summarizeExperiments(completedIdeas);

  const sections = completedIdeas.map((idea) => {
    const experimentSections = idea.experiments
      .map((experiment) => {
        const metrics = stringifyMetricBlock(experiment.results);
        return [
          `### ${experiment.title}`,
          experiment.outcome ? `Outcome: ${experiment.outcome}` : "Outcome: pending explicit write-up",
          ...(metrics.length > 0 ? ["Metrics:", ...metrics] : []),
        ].join("\n");
      })
      .join("\n\n");

    return [
      `## ${idea.title}`,
      `Source: ${idea.sourceType}`,
      idea.content || "",
      experimentSections,
    ]
      .filter(Boolean)
      .join("\n\n");
  });

  return [
    `# Rolling Synthesis for ${projectName}`,
    "",
    `Updated: ${new Date().toISOString()}`,
    "",
    "## Executive Summary",
    summary,
    "",
    "## Cross-Idea Analysis",
    sections.join("\n\n"),
  ].join("\n");
}

export async function getLatestProjectSynthesisDocument(companyUuid: string, researchProjectUuid: string) {
  return prisma.document.findFirst({
    where: {
      companyUuid,
      researchProjectUuid,
      type: "project_synthesis",
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function refreshProjectSynthesis(
  companyUuid: string,
  researchProjectUuid: string,
  actorUuid: string,
) {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: researchProjectUuid, companyUuid },
    select: {
      uuid: true,
      name: true,
      researchQuestions: {
        where: {
          reviewStatus: "accepted",
        },
        select: {
          uuid: true,
          title: true,
          content: true,
          sourceType: true,
        },
      },
      experiments: {
        where: {
          status: "completed",
        },
        select: {
          uuid: true,
          title: true,
          outcome: true,
          results: true,
          researchQuestionUuid: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Research Project not found");
  }

  const completedIdeas = project.researchQuestions
    .map((idea) => {
      const relatedExperiments = project.experiments.filter((experiment) => experiment.researchQuestionUuid === idea.uuid);
      if (relatedExperiments.length === 0) {
        return null;
      }

      return {
        title: idea.title,
        content: idea.content,
        sourceType: idea.sourceType,
        experiments: relatedExperiments.map((experiment) => ({
          title: experiment.title,
          outcome: experiment.outcome,
          results: experiment.results,
        })),
      };
    })
    .filter((idea): idea is NonNullable<typeof idea> => Boolean(idea));

  if (completedIdeas.length === 0) {
    await prisma.researchProject.update({
      where: { uuid: researchProjectUuid },
      data: {
        latestSynthesisAt: null,
        latestSynthesisIdeaCount: 0,
        latestSynthesisSummary: null,
      },
    });
    return null;
  }

  const markdown = buildMarkdown(project.name, completedIdeas);
  const { summary } = summarizeExperiments(completedIdeas);
  const now = new Date();

  const existing = await getLatestProjectSynthesisDocument(companyUuid, researchProjectUuid);

  if (existing) {
    await prisma.document.update({
      where: { uuid: existing.uuid },
      data: {
        title: `${project.name} Rolling Synthesis`,
        content: markdown,
        version: { increment: 1 },
      },
    });
  } else {
    await prisma.document.create({
      data: {
        companyUuid,
        researchProjectUuid,
        type: "project_synthesis",
        title: `${project.name} Rolling Synthesis`,
        content: markdown,
        version: 1,
        createdByUuid: actorUuid,
      },
    });
  }

  await prisma.researchProject.update({
    where: { uuid: researchProjectUuid },
    data: {
      latestSynthesisAt: now,
      latestSynthesisIdeaCount: completedIdeas.length,
      latestSynthesisSummary: summary,
    },
  });

  // Notify the autonomous loop agent's owner that synthesis was updated
  try {
    const projectForNotif = await prisma.researchProject.findFirst({
      where: { uuid: researchProjectUuid, companyUuid },
      select: { name: true, autonomousLoopAgentUuid: true },
    });
    if (projectForNotif?.autonomousLoopAgentUuid) {
      const loopAgent = await prisma.agent.findUnique({
        where: { uuid: projectForNotif.autonomousLoopAgentUuid },
        select: { ownerUuid: true, name: true },
      });
      if (loopAgent?.ownerUuid) {
        await notificationService.create({
          companyUuid,
          researchProjectUuid,
          recipientType: "user",
          recipientUuid: loopAgent.ownerUuid,
          entityType: "research_project",
          entityUuid: researchProjectUuid,
          entityTitle: projectForNotif.name,
          projectName: projectForNotif.name,
          action: "synthesis_updated",
          message: `Project synthesis updated: ${summary}`,
          actorType: "agent",
          actorUuid: actorUuid,
          actorName: loopAgent.name ?? "Agent",
        });
      }
    }
  } catch { /* ignore notification errors */ }

  return {
    generatedAt: now.toISOString(),
    ideaCount: completedIdeas.length,
    summary,
  };
}

import { prisma } from "@/lib/prisma";

function stringifyMetricBlock(results: unknown): string[] {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    return [];
  }

  return Object.entries(results as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number" || typeof value === "string" || typeof value === "boolean")
    .map(([key, value]) => `- ${key}: ${String(value)}`);
}

function summarizeRuns(
  completedIdeas: Array<{
    title: string;
    designs: Array<{
      title: string;
      runs: Array<{
        title: string;
        status: string;
        outcome: string | null;
        experimentResults: unknown;
      }>;
    }>;
  }>
) {
  const runs = completedIdeas.flatMap((idea) =>
    idea.designs.flatMap((design) =>
      design.runs.map((run) => ({
        ideaTitle: idea.title,
        designTitle: design.title,
        ...run,
      }))
    )
  );

  const successCount = runs.filter((run) => run.outcome?.toLowerCase().includes("success")).length;
  const failedCount = runs.filter((run) => run.outcome?.toLowerCase().includes("fail")).length;
  const summary = `${completedIdeas.length} idea(s), ${runs.length} completed run(s), ${successCount} marked as successes, ${failedCount} marked as failures or regressions.`;

  return { runs, summary };
}

function buildMarkdown(projectName: string, completedIdeas: Array<{
  title: string;
  content: string | null;
  sourceType: string;
  designs: Array<{
    title: string;
    description: string | null;
    runs: Array<{
      title: string;
      status: string;
      outcome: string | null;
      experimentResults: unknown;
    }>;
  }>;
}>) {
  const { summary } = summarizeRuns(completedIdeas);

  const sections = completedIdeas.map((idea) => {
    const designSections = idea.designs
      .map((design) => {
        const runSections = design.runs
          .map((run) => {
            const metrics = stringifyMetricBlock(run.experimentResults);
            return [
              `#### ${run.title}`,
              run.outcome ? `Outcome: ${run.outcome}` : "Outcome: pending explicit write-up",
              ...(metrics.length > 0 ? ["Metrics:", ...metrics] : []),
            ].join("\n");
          })
          .join("\n\n");

        return [
          `### ${design.title}`,
          design.description || "",
          runSections,
        ]
          .filter(Boolean)
          .join("\n\n");
      })
      .join("\n\n");

    return [
      `## ${idea.title}`,
      `Source: ${idea.sourceType}`,
      idea.content || "",
      designSections,
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

export async function refreshProjectSynthesis(
  companyUuid: string,
  researchProjectUuid: string,
  actorUuid: string
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
      experimentDesigns: {
        where: {
          status: "approved",
          inputType: "research_question",
        },
        select: {
          uuid: true,
          title: true,
          description: true,
          inputUuids: true,
        },
      },
      experimentRuns: {
        select: {
          uuid: true,
          title: true,
          status: true,
          outcome: true,
          experimentResults: true,
          experimentDesignUuid: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Research Project not found");
  }

  const completedIdeas = project.researchQuestions
    .map((idea) => {
      const relatedDesigns = project.experimentDesigns
        .filter((design) => Array.isArray(design.inputUuids) && (design.inputUuids as string[]).includes(idea.uuid))
        .map((design) => ({
          title: design.title,
          description: design.description,
          runs: project.experimentRuns.filter((run) => run.experimentDesignUuid === design.uuid),
        }))
        .filter((design) => design.runs.length > 0);

      const allRunsDone =
        relatedDesigns.length > 0 &&
        relatedDesigns.every((design) =>
          design.runs.every((run) => run.status === "done" || run.status === "closed")
        );

      if (!allRunsDone) {
        return null;
      }

      return {
        title: idea.title,
        content: idea.content,
        sourceType: idea.sourceType,
        designs: relatedDesigns,
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
  const { summary } = summarizeRuns(completedIdeas);
  const now = new Date();

  const existing = await prisma.document.findFirst({
    where: {
      companyUuid,
      researchProjectUuid,
      type: "project_synthesis",
    },
    orderBy: { updatedAt: "desc" },
    select: { uuid: true, version: true },
  });

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

  return {
    generatedAt: now.toISOString(),
    ideaCount: completedIdeas.length,
    summary,
  };
}

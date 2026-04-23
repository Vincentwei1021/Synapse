import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getLatestProjectSynthesisDocument } from "@/services/project-synthesis.service";
import { getResearchProjectInsightsData } from "@/services/research-project.service";
import { listRealtimeAgentSummaries } from "@/services/agent.service";
import { InsightsClient } from "./insights-client";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function InsightsPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const t = await getTranslations();

  const [insightsData, synthesis, agents, projectMeta] = await Promise.all([
    getResearchProjectInsightsData(auth.companyUuid, projectUuid),
    getLatestProjectSynthesisDocument(auth.companyUuid, projectUuid),
    listRealtimeAgentSummaries(auth.companyUuid),
    prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { synthesisActiveAgentUuid: true },
    }),
  ]);

  if (!insightsData) {
    redirect("/research-projects");
  }

  const { project, completedExperiments } = insightsData;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <InsightsClient
        projectUuid={projectUuid}
        agents={agents.map((a) => ({ uuid: a.uuid, name: a.name, type: a.type }))}
        synthesisActiveAgentUuid={projectMeta?.synthesisActiveAgentUuid ?? null}
        synthesisContent={synthesis?.content ?? null}
        latestSynthesisAt={project.latestSynthesisAt?.toISOString() ?? null}
        latestSynthesisIdeaCount={project.latestSynthesisIdeaCount ?? 0}
        latestSynthesisSummary={project.latestSynthesisSummary ?? null}
        completedExperiments={completedExperiments.map((e) => ({
          uuid: e.uuid,
          title: e.title,
          outcome: e.outcome,
          researchQuestionTitle: e.researchQuestion?.title ?? null,
        }))}
        labels={{
          title: t("insights.title"),
          subtitle: t("insights.subtitle"),
          latestUpdate: t("insights.latestUpdate"),
          coveredIdeas: t("insights.coveredIdeas"),
          summary: t("insights.summary"),
          analysis: t("insights.analysis"),
          recentExperiments: t("insights.recentExperiments"),
          empty: t("insights.empty"),
          notAvailable: t("insights.notAvailable"),
          selectAgent: t("insights.selectAgent"),
          analyze: t("insights.analyze"),
          analyzing: t("insights.analyzing"),
          sent: t("insights.sent"),
          editPrompt: t("insights.editPrompt"),
          promptDialogTitle: t("insights.promptDialogTitle"),
          promptDialogDesc: t("insights.promptDialogDesc"),
          promptPlaceholder: t("insights.promptPlaceholder"),
          promptSave: t("common.save"),
          promptCancel: t("common.cancel"),
          unlinked: t("experiments.card.unlinked"),
        }}
      />
    </div>
  );
}

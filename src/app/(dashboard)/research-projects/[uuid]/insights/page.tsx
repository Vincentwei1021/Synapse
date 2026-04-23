import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { MarkdownContent } from "@/components/markdown-content";
import { getServerAuthContext } from "@/lib/auth-server";
import { getLatestProjectSynthesisDocument } from "@/services/project-synthesis.service";
import { getResearchProjectInsightsData } from "@/services/research-project.service";
import { RefreshSynthesisButton } from "./refresh-synthesis-button";

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
  const [insightsData, synthesis] = await Promise.all([
    getResearchProjectInsightsData(auth.companyUuid, projectUuid),
    getLatestProjectSynthesisDocument(auth.companyUuid, projectUuid),
  ]);

  if (!insightsData) {
    redirect("/research-projects");
  }

  const { project, completedExperiments } = insightsData;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("insights.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("insights.subtitle")}</p>
        </div>
        <RefreshSynthesisButton projectUuid={projectUuid} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("insights.latestUpdate")}</p>
          <p className="mt-3 text-lg font-semibold text-foreground">
            {project.latestSynthesisAt ? new Date(project.latestSynthesisAt).toLocaleString() : t("insights.notAvailable")}
          </p>
        </Card>
        <Card className="rounded-3xl border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("insights.coveredIdeas")}</p>
          <p className="mt-3 text-lg font-semibold text-foreground">{project.latestSynthesisIdeaCount ?? 0}</p>
        </Card>
        <Card className="rounded-3xl border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t("insights.summary")}</p>
          <p className="mt-3 text-sm leading-6 text-foreground">
            {project.latestSynthesisSummary || t("insights.empty")}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <Card className="rounded-3xl border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("insights.analysis")}</h2>
          {synthesis?.content ? (
            <div className="mt-4 max-w-none text-sm leading-7 text-foreground">
              <MarkdownContent>{synthesis.content}</MarkdownContent>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("insights.empty")}</p>
          )}
        </Card>

        <Card className="rounded-3xl border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("insights.recentExperiments")}</h2>
          <div className="mt-4 space-y-3">
            {completedExperiments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("insights.empty")}</p>
            ) : (
              completedExperiments.map((experiment) => (
                <div key={experiment.uuid} className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-sm font-medium text-foreground">{experiment.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {experiment.researchQuestion?.title || t("experiments.card.unlinked")}
                  </p>
                  {experiment.outcome ? <p className="mt-2 text-xs text-muted-foreground">{experiment.outcome}</p> : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { MarkdownContent } from "@/components/markdown-content";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getLatestProjectSynthesisDocument } from "@/services/project-synthesis.service";
import { researchProjectExists } from "@/services/research-project.service";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function InsightsPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const exists = await researchProjectExists(auth.companyUuid, projectUuid);
  if (!exists) {
    redirect("/research-projects");
  }

  const t = await getTranslations();
  const [project, synthesis, completedExperiments] = await Promise.all([
    prisma.researchProject.findUniqueOrThrow({
      where: { uuid: projectUuid },
      select: {
        latestSynthesisAt: true,
        latestSynthesisIdeaCount: true,
        latestSynthesisSummary: true,
      },
    }),
    getLatestProjectSynthesisDocument(auth.companyUuid, projectUuid),
    prisma.experiment.findMany({
      where: {
        companyUuid: auth.companyUuid,
        researchProjectUuid: projectUuid,
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

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#2C2C2C]">{t("insights.title")}</h1>
        <p className="mt-1 text-sm text-[#6B6B6B]">{t("insights.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-[#E5DED3] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#9A8F81]">{t("insights.latestUpdate")}</p>
          <p className="mt-3 text-lg font-semibold text-[#2C2C2C]">
            {project.latestSynthesisAt ? new Date(project.latestSynthesisAt).toLocaleString() : t("insights.notAvailable")}
          </p>
        </Card>
        <Card className="rounded-3xl border-[#E5DED3] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#9A8F81]">{t("insights.coveredIdeas")}</p>
          <p className="mt-3 text-lg font-semibold text-[#2C2C2C]">{project.latestSynthesisIdeaCount ?? 0}</p>
        </Card>
        <Card className="rounded-3xl border-[#E5DED3] p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[#9A8F81]">{t("insights.summary")}</p>
          <p className="mt-3 text-sm leading-6 text-[#2C2C2C]">
            {project.latestSynthesisSummary || t("insights.empty")}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <Card className="rounded-3xl border-[#E5DED3] p-6">
          <h2 className="text-lg font-semibold text-[#2C2C2C]">{t("insights.analysis")}</h2>
          {synthesis?.content ? (
            <div className="mt-4 max-w-none text-sm leading-7 text-[#2C2C2C]">
              <MarkdownContent>{synthesis.content}</MarkdownContent>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6B6B6B]">{t("insights.empty")}</p>
          )}
        </Card>

        <Card className="rounded-3xl border-[#E5DED3] p-6">
          <h2 className="text-lg font-semibold text-[#2C2C2C]">{t("insights.recentExperiments")}</h2>
          <div className="mt-4 space-y-3">
            {completedExperiments.length === 0 ? (
              <p className="text-sm text-[#6B6B6B]">{t("insights.empty")}</p>
            ) : (
              completedExperiments.map((experiment) => (
                <div key={experiment.uuid} className="rounded-2xl bg-[#FBF8F3] p-4">
                  <p className="text-sm font-medium text-[#2C2C2C]">{experiment.title}</p>
                  <p className="mt-1 text-xs text-[#8E8478]">
                    {experiment.researchQuestion?.title || t("experiments.card.unlinked")}
                  </p>
                  {experiment.outcome ? <p className="mt-2 text-xs text-[#6B6B6B]">{experiment.outcome}</p> : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

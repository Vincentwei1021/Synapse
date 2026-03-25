import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, FileText, FlaskConical, Lightbulb, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getResearchProject, getResearchProjectStats } from "@/services/research-project.service";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const t = await getTranslations();

  const project = await getResearchProject(auth.companyUuid, projectUuid);
  if (!project) {
    redirect("/research-projects");
  }

  const [stats, recentExperiments, recentQuestions] = await Promise.all([
    getResearchProjectStats(auth.companyUuid, projectUuid),
    prisma.experiment.findMany({
      where: { companyUuid: auth.companyUuid, researchProjectUuid: projectUuid },
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
        companyUuid: auth.companyUuid,
        researchProjectUuid: projectUuid,
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

  const statCards = [
    {
      title: t("dashboard.questions"),
      value: stats.researchQuestions.total,
      helper: t("dashboard.questionsHelper", { count: stats.researchQuestions.open }),
      href: `/research-projects/${projectUuid}/research-questions`,
      icon: Lightbulb,
      iconBg: "bg-[#FFF3E0]",
      iconColor: "text-[#E65100]",
    },
    {
      title: t("dashboard.experiments"),
      value: stats.experiments.total,
      helper: t("dashboard.experimentsHelper", { count: stats.experiments.inProgress }),
      href: `/research-projects/${projectUuid}/experiments`,
      icon: FlaskConical,
      iconBg: "bg-[#EEF7F1]",
      iconColor: "text-[#2F7D5D]",
    },
    {
      title: t("dashboard.insights"),
      value: project.latestSynthesisIdeaCount ?? 0,
      helper: project.latestSynthesisSummary || t("dashboard.insightsHelper"),
      href: `/research-projects/${projectUuid}/insights`,
      icon: Sparkles,
      iconBg: "bg-[#F7F0FF]",
      iconColor: "text-[#8E6BBF]",
    },
    {
      title: t("dashboard.documents"),
      value: stats.documents.total,
      helper: t("dashboard.documentsHelper"),
      href: `/research-projects/${projectUuid}/documents`,
      icon: FileText,
      iconBg: "bg-[#EDF5FF]",
      iconColor: "text-[#1976D2]",
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="rounded-[32px] border border-[#E4DBD0] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,244,238,0.96))] p-7 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A39787]">
              {t("dashboard.brief")}
            </p>
            <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-[#2C2C2C]">{project.name}</h1>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
              {project.description || t("dashboard.noDescription")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-[#C67A52] text-white hover:bg-[#B56A42]">
              <Link href={`/research-projects/${projectUuid}/experiments/new`}>{t("dashboard.newExperiment")}</Link>
            </Button>
            <Button asChild variant="outline" className="border-[#D7CCBE] bg-white">
              <Link href={`/research-projects/${projectUuid}/insights`}>{t("nav.insights")}</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <BriefCard title={t("dashboard.goal")} body={project.goal || t("dashboard.noGoal")} />
          <ListBriefCard
            title={t("dashboard.datasets")}
            items={Array.isArray(project.datasets) ? (project.datasets as string[]) : []}
            empty={t("dashboard.noDatasets")}
          />
          <ListBriefCard
            title={t("dashboard.evaluation")}
            items={Array.isArray(project.evaluationMethods) ? (project.evaluationMethods as string[]) : []}
            empty={t("dashboard.noEvaluation")}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <Card className="h-full rounded-[28px] border-[#E7DFD2] p-5 transition hover:border-[#D6C9B8] hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#6B6B6B]">{card.title}</p>
                    <p className="mt-3 text-[30px] font-semibold leading-none text-[#2C2C2C]">{card.value}</p>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#6B6B6B]">{card.helper}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${card.iconBg}`}>
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-[28px] border-[#E7DFD2] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#2C2C2C]">{t("dashboard.pipelineTitle")}</h2>
              <p className="mt-1 text-sm text-[#6B6B6B]">{t("dashboard.pipelineSubtitle")}</p>
            </div>
            <Link href={`/research-projects/${projectUuid}/experiments`} className="text-sm text-[#C67A52]">
              {t("common.viewAll")}
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <PipelineCell title={t("experiments.columns.draft")} value={stats.experiments.draft} />
            <PipelineCell title={t("experiments.columns.pendingReview")} value={stats.experiments.pendingReview} />
            <PipelineCell title={t("experiments.columns.pendingStart")} value={stats.experiments.pendingStart} />
            <PipelineCell title={t("experiments.columns.inProgress")} value={stats.experiments.inProgress} />
            <PipelineCell title={t("experiments.columns.completed")} value={stats.experiments.completed} />
          </div>

          <div className="mt-5 space-y-3">
            {recentExperiments.length === 0 ? (
              <p className="text-sm text-[#6B6B6B]">{t("dashboard.noExperiments")}</p>
            ) : (
              recentExperiments.map((experiment) => (
                <div key={experiment.uuid} className="flex items-center justify-between rounded-2xl bg-[#FBF8F3] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[#2C2C2C]">{experiment.title}</p>
                    {experiment.outcome ? (
                      <p className="mt-1 text-xs text-[#7C7368]">{experiment.outcome}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-[#6B6B6B]">
                    {t(`experiments.columns.${statusKey(experiment.status)}`)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[28px] border-[#E7DFD2] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#2C2C2C]">{t("dashboard.researchQuestionsTitle")}</h2>
              <p className="mt-1 text-sm text-[#6B6B6B]">{t("dashboard.researchQuestionsSubtitle")}</p>
            </div>
            <Link href={`/research-projects/${projectUuid}/research-questions`} className="text-sm text-[#C67A52]">
              {t("common.viewAll")}
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {recentQuestions.length === 0 ? (
              <p className="text-sm text-[#6B6B6B]">{t("dashboard.noQuestions")}</p>
            ) : (
              recentQuestions.map((question) => (
                <div key={question.uuid} className="rounded-2xl bg-[#FBF8F3] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-[#2C2C2C]">{question.title}</p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-[#6B6B6B]">
                      {question.reviewStatus === "pending" ? t("ideas.pendingReview") : t(`ideas.columns.${questionStatusKey(question.status)}`)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <Link
            href={`/research-projects/${projectUuid}/insights`}
            className="mt-6 flex items-center justify-between rounded-2xl border border-[#E7DFD2] bg-white px-4 py-4 transition hover:border-[#D6C9B8]"
          >
            <div>
              <p className="text-sm font-medium text-[#2C2C2C]">{t("dashboard.latestInsight")}</p>
              <p className="mt-1 text-sm text-[#6B6B6B]">
                {project.latestSynthesisSummary || t("dashboard.insightsHelper")}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#C67A52]" />
          </Link>
        </Card>
      </div>
    </div>
  );
}

function BriefCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[20px] bg-[#FBF8F3] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A39787]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#2C2C2C]">{body}</p>
    </div>
  );
}

function ListBriefCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-[20px] bg-[#FBF8F3] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A39787]">{title}</p>
      <div className="mt-2 space-y-1.5 text-sm leading-6 text-[#2C2C2C]">
        {items.length > 0 ? items.map((item) => <p key={item}>• {item}</p>) : <p>{empty}</p>}
      </div>
    </div>
  );
}

function PipelineCell({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-[20px] bg-[#FBF8F3] p-4 text-center">
      <p className="text-sm text-[#6B6B6B]">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[#2C2C2C]">{value}</p>
    </div>
  );
}

function statusKey(status: string) {
  switch (status) {
    case "pending_review":
      return "pendingReview";
    case "pending_start":
      return "pendingStart";
    case "in_progress":
      return "inProgress";
    default:
      return status;
  }
}

function questionStatusKey(status: string) {
  switch (status) {
    case "experiment_created":
      return "experimentCreated";
    default:
      return status;
  }
}

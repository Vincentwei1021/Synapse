import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { listResearchQuestions } from "@/services/research-question.service";
import { listExperiments } from "@/services/experiment.service";
import { researchProjectExists } from "@/services/research-project.service";
import { ResearchQuestionsBoard } from "./research-questions-board";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function ResearchQuestionsPage({ params }: PageProps) {
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
  const [{ researchQuestions }, { experiments }] = await Promise.all([
    listResearchQuestions({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      skip: 0,
      take: 1000,
    }),
    listExperiments({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      skip: 0,
      take: 1000,
    }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("ideas.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ideas.subtitle")}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("ideas.canvasHint")}</p>
        </div>
      </div>

      <ResearchQuestionsBoard
        projectUuid={projectUuid}
        researchQuestions={researchQuestions}
        experiments={experiments}
      />
    </div>
  );
}

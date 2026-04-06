import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listExperiments } from "@/services/experiment.service";
import { researchProjectExists } from "@/services/research-project.service";
import { listResearchQuestions } from "@/services/research-question.service";
import { CreateExperimentForm } from "./create-experiment-form";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function NewExperimentPage({ params }: PageProps) {
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
  const [{ researchQuestions }, { experiments: existingExperiments }, project] = await Promise.all([
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
      take: 200,
    }),
    prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { repoUrl: true },
    }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t("experiments.createTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("experiments.createSubtitle")}</p>
      </div>

      <CreateExperimentForm
        projectUuid={projectUuid}
        hasRepo={!!project?.repoUrl}
        researchQuestions={researchQuestions.map((question) => ({
          uuid: question.uuid,
          title: question.title,
        }))}
        existingExperiments={existingExperiments.map((e) => ({
          uuid: e.uuid,
          title: e.title,
          description: e.description,
        }))}
      />
    </div>
  );
}

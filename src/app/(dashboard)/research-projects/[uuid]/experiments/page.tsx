import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { researchProjectExists } from "@/services/research-project.service";
import { listExperiments } from "@/services/experiment.service";
import { ExperimentsBoard } from "./experiments-board";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function ExperimentsPage({ params }: PageProps) {
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
  const [{ experiments }, agents] = await Promise.all([
    listExperiments({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      skip: 0,
      take: 1000,
    }),
    prisma.agent.findMany({
      where: { companyUuid: auth.companyUuid },
      select: { uuid: true, name: true, roles: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2C2C2C]">{t("experiments.title")}</h1>
          <p className="mt-1 text-sm text-[#6B6B6B]">{t("experiments.subtitle")}</p>
        </div>
      </div>

      <ExperimentsBoard
        projectUuid={projectUuid}
        experiments={experiments}
        agents={agents.map((agent) => ({ uuid: agent.uuid, name: agent.name }))}
      />
    </div>
  );
}

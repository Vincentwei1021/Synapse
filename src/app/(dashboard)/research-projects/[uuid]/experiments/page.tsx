import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { researchProjectExists } from "@/services/research-project.service";
import { listExperiments } from "@/services/experiment.service";
import { ExperimentsBoard } from "./experiments-board";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams?: Promise<{ selected?: string }>;
}

export default async function ExperimentsPage({ params, searchParams }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("experiments.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("experiments.subtitle")}</p>
        </div>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link href={`/research-projects/${projectUuid}/experiments/new`} prefetch>
            <Plus className="mr-2 h-4 w-4" />
            {t("experiments.create")}
          </Link>
        </Button>
      </div>

      <ExperimentsBoard
        experiments={experiments}
        agents={agents.map((agent) => ({ uuid: agent.uuid, name: agent.name }))}
        initialSelectedExperimentUuid={resolvedSearchParams?.selected || null}
      />
    </div>
  );
}

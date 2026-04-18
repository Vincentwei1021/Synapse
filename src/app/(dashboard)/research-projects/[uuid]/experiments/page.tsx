import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listAgentSummaries, listRealtimeAgentSummaries } from "@/services/agent.service";
import { listResearchQuestions } from "@/services/research-question.service";
import { researchProjectExists } from "@/services/research-project.service";
import { listExperiments } from "@/services/experiment.service";
import { ExperimentsBoard } from "./experiments-board";

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

  const [{ experiments }, allAgents, realtimeAgents, project, { researchQuestions }] = await Promise.all([
    listExperiments({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      skip: 0,
      take: 1000,
    }),
    listAgentSummaries(auth.companyUuid),
    listRealtimeAgentSummaries(auth.companyUuid),
    prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { autonomousLoopEnabled: true, autonomousLoopAgentUuid: true, autonomousLoopMode: true, repoUrl: true },
    }),
    listResearchQuestions({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      skip: 0,
      take: 1000,
    }),
  ]);

  return (
    <div className="p-4 md:p-8">
      <ExperimentsBoard
        experiments={experiments}
        agents={allAgents.map((agent) => ({
          uuid: agent.uuid,
          name: agent.name,
          type: agent.type,
          lastActiveAt: agent.lastActiveAt?.toISOString() ?? null,
        }))}
        realtimeAgents={realtimeAgents.map((agent) => ({
          uuid: agent.uuid,
          name: agent.name,
          type: agent.type,
          lastActiveAt: agent.lastActiveAt?.toISOString() ?? null,
        }))}
        initialSelectedExperimentUuid={resolvedSearchParams?.selected || null}
        viewerUuid={auth.actorUuid}
        viewerType={auth.type}
        projectUuid={projectUuid}
        autonomousLoopEnabled={project?.autonomousLoopEnabled ?? false}
        autonomousLoopAgentUuid={project?.autonomousLoopAgentUuid ?? null}
        autonomousLoopMode={project?.autonomousLoopMode ?? null}
        repoUrl={project?.repoUrl ?? null}
        researchQuestions={researchQuestions.map((question) => ({
          uuid: question.uuid,
          title: question.title,
        }))}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listComputePools } from "@/services/compute.service";
import { listRealtimeAgentSummaries } from "@/services/agent.service";
import { ProjectSettingsClient } from "./project-settings-client";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function ProjectSettingsPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");

  const { uuid: projectUuid } = await params;

  const [project, pools, realtimeAgents] = await Promise.all([
    prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: {
        uuid: true,
        name: true,
        description: true,
        datasets: true,
        evaluationMethods: true,
        computePoolUuid: true,
        repoUrl: true,
        githubUsername: true,
        githubToken: true,
        autoSearchActiveAgentUuid: true,
        deepResearchActiveAgentUuid: true,
        autonomousLoopEnabled: true,
        autonomousLoopAgentUuid: true,
        autonomousLoopMode: true,
        autoSearchEnabled: true,
        autoSearchAgentUuid: true,
        experiments: {
          select: { uuid: true, title: true, status: true },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          select: { uuid: true, title: true, type: true, version: true },
          orderBy: { updatedAt: "desc" },
        },
        researchQuestions: {
          select: { uuid: true, title: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    listComputePools(auth.companyUuid),
    listRealtimeAgentSummaries(auth.companyUuid),
  ]);

  if (!project) redirect("/research-projects");

  const projectForClient = {
    uuid: project.uuid,
    name: project.name,
    description: project.description,
    datasets: project.datasets,
    evaluationMethods: project.evaluationMethods,
    computePoolUuid: project.computePoolUuid,
    repoUrl: project.repoUrl,
    githubUsername: project.githubUsername,
    githubConfigured: !!project.githubToken,
    autoSearchActive: !!project.autoSearchActiveAgentUuid,
    deepResearchActive: !!project.deepResearchActiveAgentUuid,
    autonomousLoopEnabled: project.autonomousLoopEnabled ?? false,
    autonomousLoopAgentUuid: project.autonomousLoopAgentUuid ?? null,
    autonomousLoopMode: (project.autonomousLoopMode ?? "human_review") as "human_review" | "full_auto",
    autoSearchEnabled: project.autoSearchEnabled ?? false,
    autoSearchAgentUuid: project.autoSearchAgentUuid ?? null,
    experiments: project.experiments,
    documents: project.documents,
    researchQuestions: project.researchQuestions,
  };

  return (
    <div className="space-y-6 overflow-y-auto p-4 md:p-8">
      <ProjectSettingsClient
        project={projectForClient}
        pools={pools.map((p) => ({ uuid: p.uuid, name: p.name }))}
        realtimeAgents={realtimeAgents.map((agent) => ({
          uuid: agent.uuid,
          name: agent.name,
          type: agent.type,
        }))}
      />
    </div>
  );
}

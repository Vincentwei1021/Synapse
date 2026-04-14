import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listComputePools } from "@/services/compute.service";
import { ProjectSettingsClient } from "./project-settings-client";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function ProjectSettingsPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");

  const { uuid: projectUuid } = await params;

  const project = await prisma.researchProject.findFirst({
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
      experiments: {
        select: { uuid: true, title: true, status: true },
        orderBy: { createdAt: "desc" },
      },
      researchQuestions: {
        select: { uuid: true, title: true, status: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) redirect("/research-projects");

  const pools = await listComputePools(auth.companyUuid);

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
    experiments: project.experiments,
    researchQuestions: project.researchQuestions,
  };

  return (
    <div className="space-y-6 overflow-y-auto p-4 md:p-8">
      <ProjectSettingsClient
        project={projectForClient}
        pools={pools.map((p) => ({ uuid: p.uuid, name: p.name }))}
      />
    </div>
  );
}

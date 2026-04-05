import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listRelatedWorks } from "@/services/related-work.service";
import { listAgentSummaries } from "@/services/agent.service";
import { RelatedWorksClient } from "./related-works-client";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function RelatedWorksPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");
  const { uuid: projectUuid } = await params;

  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid: auth.companyUuid },
    select: {
      uuid: true,
      deepResearchDocUuid: true,
    },
  });
  if (!project) redirect("/research-projects");

  // Fetch deep research doc metadata if it exists
  let deepResearchDoc: { uuid: string; version: number; updatedAt: string } | null = null;
  if (project.deepResearchDocUuid) {
    const doc = await prisma.document.findFirst({
      where: { uuid: project.deepResearchDocUuid },
      select: { uuid: true, version: true, updatedAt: true },
    });
    if (doc) {
      deepResearchDoc = { uuid: doc.uuid, version: doc.version, updatedAt: doc.updatedAt.toISOString() };
    }
  }

  const [works, agents] = await Promise.all([
    listRelatedWorks(auth.companyUuid, projectUuid),
    listAgentSummaries(auth.companyUuid),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <RelatedWorksClient
        projectUuid={projectUuid}
        initialWorks={works}
        agents={agents.map((a) => ({ uuid: a.uuid, name: a.name }))}
        deepResearchDoc={deepResearchDoc}
      />
    </div>
  );
}

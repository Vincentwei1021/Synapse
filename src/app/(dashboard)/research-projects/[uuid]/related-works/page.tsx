import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listRelatedWorks } from "@/services/related-work.service";
import { listRealtimeAgentSummaries } from "@/services/agent.service";
import { RelatedWorksClient } from "./related-works-client";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

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
      autoSearchActiveAgentUuid: true,
      autoSearchStartedAt: true,
      deepResearchActiveAgentUuid: true,
      deepResearchStartedAt: true,
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
    listRealtimeAgentSummaries(auth.companyUuid),
  ]);

  // Staleness: running 30+ min AND no recent output in 30 min
  const now = Date.now();

  let autoSearchIsStale = false;
  if (project.autoSearchActiveAgentUuid && project.autoSearchStartedAt) {
    const runningMs = now - project.autoSearchStartedAt.getTime();
    const latestPaperAt = works.length > 0 ? new Date(works[0].createdAt).getTime() : 0;
    const outputAgeMs = latestPaperAt > 0 ? now - latestPaperAt : Infinity;
    autoSearchIsStale = runningMs > STALE_THRESHOLD_MS && outputAgeMs > STALE_THRESHOLD_MS;
  }

  let deepResearchIsStale = false;
  if (project.deepResearchActiveAgentUuid && project.deepResearchStartedAt) {
    const runningMs = now - project.deepResearchStartedAt.getTime();
    const docUpdatedAt = deepResearchDoc ? new Date(deepResearchDoc.updatedAt).getTime() : 0;
    const outputAgeMs = docUpdatedAt > 0 ? now - docUpdatedAt : Infinity;
    deepResearchIsStale = runningMs > STALE_THRESHOLD_MS && outputAgeMs > STALE_THRESHOLD_MS;
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <RelatedWorksClient
        projectUuid={projectUuid}
        initialWorks={works}
        agents={agents.map((a) => ({ uuid: a.uuid, name: a.name }))}
        deepResearchDoc={deepResearchDoc}
        autoSearchState={{
          agentUuid: project.autoSearchActiveAgentUuid,
          stale: autoSearchIsStale,
        }}
        deepResearchState={{
          agentUuid: project.deepResearchActiveAgentUuid,
          stale: deepResearchIsStale,
        }}
      />
    </div>
  );
}

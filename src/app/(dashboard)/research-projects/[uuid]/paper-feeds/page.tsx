import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listPaperFeedItems } from "@/services/paper-feed.service";
import { listRealtimeAgentSummaries } from "@/services/agent.service";
import { PaperFeedsClient } from "./paper-feeds-client";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function PaperFeedsPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");
  const { uuid: projectUuid } = await params;

  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid: auth.companyUuid },
    select: {
      uuid: true,
      paperFeedEnabled: true,
      paperFeedAgentUuid: true,
      paperFeedActiveAgentUuid: true,
      paperFeedStartedAt: true,
      paperFeedLastRunAt: true,
    },
  });
  if (!project) redirect("/research-projects");

  const [itemsByDate, runs, allAgents] = await Promise.all([
    listPaperFeedItems({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
    }),
    prisma.paperFeedRun.findMany({
      where: {
        companyUuid: auth.companyUuid,
        researchProjectUuid: projectUuid,
      },
      orderBy: { feedDate: "desc" },
      take: 30,
      select: {
        uuid: true,
        feedDate: true,
        status: true,
        paperCount: true,
        errorMessage: true,
        triggeredBy: true,
        startedAt: true,
        completedAt: true,
      },
    }),
    listRealtimeAgentSummaries(auth.companyUuid),
  ]);

  const eligibleAgents = allAgents
    .filter((a) => a.roles.includes("paper_feeds"))
    .map((a) => ({ uuid: a.uuid, name: a.name, type: a.type, color: a.color }));

  const initialConfig = {
    paperFeedEnabled: project.paperFeedEnabled,
    paperFeedAgentUuid: project.paperFeedAgentUuid,
    paperFeedActiveAgentUuid: project.paperFeedActiveAgentUuid,
    paperFeedStartedAt: project.paperFeedStartedAt
      ? project.paperFeedStartedAt.toISOString()
      : null,
    paperFeedLastRunAt: project.paperFeedLastRunAt
      ? project.paperFeedLastRunAt.toISOString()
      : null,
  };

  const initialRuns = runs.map((r) => ({
    uuid: r.uuid,
    feedDate: r.feedDate.toISOString().slice(0, 10),
    status: r.status,
    paperCount: r.paperCount,
    errorMessage: r.errorMessage,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PaperFeedsClient
        projectUuid={projectUuid}
        initialConfig={initialConfig}
        initialItemsByDate={itemsByDate}
        initialRuns={initialRuns}
        agents={eligibleAgents}
      />
    </div>
  );
}

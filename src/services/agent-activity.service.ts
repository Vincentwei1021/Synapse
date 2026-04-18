import { prisma } from "@/lib/prisma";

const LIVE_EXPERIMENT_STATES = [
  "sent",
  "ack",
  "checking_resources",
  "queuing",
  "running",
] as const;

export interface AgentSummary {
  uuid: string;
  name: string;
  color: string | null;
}

export interface AgentActivitySummary {
  relatedWorks: AgentSummary[];
  experiments: AgentSummary[];
  researchQuestions: AgentSummary[];
  insights: AgentSummary[];
  documents: AgentSummary[];
}

const EMPTY_ACTIVITY: AgentActivitySummary = {
  relatedWorks: [],
  experiments: [],
  researchQuestions: [],
  insights: [],
  documents: [],
};

function dedupeAgents(list: AgentSummary[]): AgentSummary[] {
  const seen = new Set<string>();
  const out: AgentSummary[] = [];
  for (const agent of list) {
    if (seen.has(agent.uuid)) continue;
    seen.add(agent.uuid);
    out.push(agent);
  }
  return out;
}

export async function getProjectAgentActivity({
  companyUuid,
  projectUuid,
}: {
  companyUuid: string;
  projectUuid: string;
}): Promise<AgentActivitySummary> {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid },
    select: {
      uuid: true,
      autoSearchActiveAgentUuid: true,
      deepResearchActiveAgentUuid: true,
    },
  });
  if (!project) {
    return { ...EMPTY_ACTIVITY };
  }

  // Experiments: any live-state experiment → assigned agent
  const liveExperiments = await prisma.experiment.findMany({
    where: {
      companyUuid,
      researchProjectUuid: projectUuid,
      liveStatus: { in: LIVE_EXPERIMENT_STATES as unknown as string[] },
      assigneeType: "agent",
      assigneeUuid: { not: null },
    },
    select: { assigneeUuid: true },
  });
  const experimentAgentUuids = liveExperiments
    .map((e) => e.assigneeUuid)
    .filter((u): u is string => Boolean(u));

  // Related works: active auto-search or deep research agent
  const relatedWorksAgentUuids: string[] = [];
  if (project.autoSearchActiveAgentUuid) {
    relatedWorksAgentUuids.push(project.autoSearchActiveAgentUuid);
  }
  if (project.deepResearchActiveAgentUuid) {
    relatedWorksAgentUuids.push(project.deepResearchActiveAgentUuid);
  }

  const allAgentUuids = Array.from(
    new Set([...experimentAgentUuids, ...relatedWorksAgentUuids])
  );
  if (allAgentUuids.length === 0) {
    return { ...EMPTY_ACTIVITY };
  }

  const agents = await prisma.agent.findMany({
    where: { companyUuid, uuid: { in: allAgentUuids } },
    select: { uuid: true, name: true, color: true },
  });
  const byUuid = new Map(agents.map((a) => [a.uuid, a]));

  const pick = (uuids: string[]): AgentSummary[] =>
    dedupeAgents(
      uuids
        .map((u) => byUuid.get(u))
        .filter(
          (a): a is { uuid: string; name: string; color: string | null } =>
            Boolean(a)
        )
        .map((a) => ({ uuid: a.uuid, name: a.name, color: a.color }))
    );

  return {
    ...EMPTY_ACTIVITY,
    experiments: pick(experimentAgentUuids),
    relatedWorks: pick(relatedWorksAgentUuids),
  };
}

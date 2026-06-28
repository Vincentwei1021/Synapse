// Orchestrates the in-memory connection registry with Prisma metadata.
// All company/owner scoping happens here; the registry itself is scope-agnostic.
import { prisma } from "@/lib/prisma";
import {
  upsertConnection,
  listConnections,
  livenessOf,
  type ConnectionRecord,
} from "@/lib/connection-registry";

export interface RecordHeartbeatParams {
  companyUuid: string;
  agentUuid: string;
  host: string;
  cwd: string;
  pid?: number | null;
  clientType: string;
  now?: number;
}

export async function recordHeartbeat(
  params: RecordHeartbeatParams,
): Promise<{ connectionKey: string }> {
  const agent = await prisma.agent.findFirst({
    where: { companyUuid: params.companyUuid, uuid: params.agentUuid },
    select: { uuid: true, companyUuid: true },
  });
  if (!agent) {
    throw new Error("Agent not found for company");
  }
  const record = upsertConnection({
    agentUuid: params.agentUuid,
    companyUuid: params.companyUuid,
    host: params.host,
    cwd: params.cwd,
    pid: params.pid ?? null,
    clientType: params.clientType,
    now: params.now ?? Date.now(),
  });
  return { connectionKey: record.connectionKey };
}

export interface ExecutionView {
  experimentUuid: string;
  title: string;
  researchProjectUuid: string;
  liveStatus: string;
  liveMessage: string | null;
  liveUpdatedAt: string | null;
}

export interface ConnectionView {
  connectionKey: string;
  agentUuid: string;
  agentName: string;
  clientType: string;
  host: string;
  cwd: string;
  status: "online" | "offline";
  connectedAt: string;
  lastSeenAt: string;
  executions: ExecutionView[];
}

export async function listOwnerConnections(params: {
  companyUuid: string;
  ownerUuid: string;
  now?: number;
}): Promise<ConnectionView[]> {
  const now = params.now ?? Date.now();

  // Which agents does this user own?
  const ownedAgents = await prisma.agent.findMany({
    where: { companyUuid: params.companyUuid, ownerUuid: params.ownerUuid },
    select: { uuid: true, name: true, type: true },
  });
  if (ownedAgents.length === 0) return [];

  const ownedUuids = ownedAgents.map((a) => a.uuid);
  const agentByUuid = new Map(ownedAgents.map((a) => [a.uuid, a]));

  // Live connections for those agents. Recently-offline records are still
  // returned (surfaced with status "offline"); only truly absent records drop.
  const records: ConnectionRecord[] = listConnections(now, {
    agentUuids: ownedUuids,
  });
  if (records.length === 0) return [];

  // Running/queued experiments assigned to any of these agents.
  const experiments = await prisma.experiment.findMany({
    where: {
      companyUuid: params.companyUuid,
      assigneeType: "agent",
      assigneeUuid: { in: ownedUuids },
      liveStatus: { not: null },
    },
    select: {
      uuid: true, title: true, researchProjectUuid: true,
      liveStatus: true, liveMessage: true, liveUpdatedAt: true, assigneeUuid: true,
    },
    orderBy: { liveUpdatedAt: "desc" },
  });

  // Group experiments by their assignee agent. The query already filters on
  // `assigneeUuid in ownedUuids` and selects assigneeUuid, so every row has one;
  // defensively skip any row without an assigneeUuid rather than fanning it out.
  const execByAgent = new Map<string, ExecutionView[]>();
  const attach = (agentUuid: string, view: ExecutionView) => {
    const list = execByAgent.get(agentUuid) ?? [];
    list.push(view);
    execByAgent.set(agentUuid, list);
  };
  for (const e of experiments) {
    if (!e.assigneeUuid) continue;
    const view: ExecutionView = {
      experimentUuid: e.uuid,
      title: e.title,
      researchProjectUuid: e.researchProjectUuid,
      liveStatus: e.liveStatus as string,
      liveMessage: e.liveMessage ?? null,
      liveUpdatedAt: e.liveUpdatedAt ? e.liveUpdatedAt.toISOString() : null,
    };
    attach(e.assigneeUuid, view);
  }

  return records.map((r) => {
    const agent = agentByUuid.get(r.agentUuid);
    return {
      connectionKey: r.connectionKey,
      agentUuid: r.agentUuid,
      agentName: agent?.name ?? "",
      clientType: r.clientType,
      host: r.host,
      cwd: r.cwd,
      status: livenessOf(r, now),
      connectedAt: new Date(r.connectedAt).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      executions: execByAgent.get(r.agentUuid) ?? [],
    };
  });
}

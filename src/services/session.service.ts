// src/services/session.service.ts
// Agent Session Service Layer — sub-session management (swarm mode observability)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { claimExperimentRun } from "@/services/experiment-run.service";

// ===== Type Definitions =====

export interface SessionCreateParams {
  companyUuid: string;
  agentUuid: string;
  name: string;
  description?: string | null;
  expiresAt?: Date | null;
}

export interface SessionRunCheckinInfo {
  runUuid: string;
  checkinAt: string;
  checkoutAt: string | null;
}

export interface SessionResponse {
  uuid: string;
  agentUuid: string;
  name: string;
  description: string | null;
  status: string;
  lastActiveAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  checkins: SessionRunCheckinInfo[];
}

export interface RunSessionInfo {
  sessionUuid: string;
  sessionName: string;
  agentUuid: string;
  agentName: string;
  checkinAt: string;
}

// ===== Internal Helper Functions =====

function formatSessionResponse(
  session: {
    uuid: string;
    agentUuid: string;
    name: string;
    description: string | null;
    status: string;
    lastActiveAt: Date;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    runCheckins?: Array<{
      runUuid: string;
      checkinAt: Date;
      checkoutAt: Date | null;
    }>;
  }
): SessionResponse {
  return {
    uuid: session.uuid,
    agentUuid: session.agentUuid,
    name: session.name,
    description: session.description,
    status: session.status,
    lastActiveAt: session.lastActiveAt.toISOString(),
    expiresAt: session.expiresAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    checkins: (session.runCheckins || []).map((c) => ({
      runUuid: c.runUuid,
      checkinAt: c.checkinAt.toISOString(),
      checkoutAt: c.checkoutAt?.toISOString() ?? null,
    })),
  };
}

// ===== Service Methods =====

// Create Session
export async function createSession(params: SessionCreateParams): Promise<SessionResponse> {
  const session = await prisma.agentSession.create({
    data: {
      companyUuid: params.companyUuid,
      agentUuid: params.agentUuid,
      name: params.name,
      description: params.description ?? null,
      status: "active",
      expiresAt: params.expiresAt ?? null,
    },
  });

  eventBus.emitChange({
    companyUuid: params.companyUuid,
    researchProjectUuid: "",
    entityType: "agent_session",
    entityUuid: session.uuid,
    action: "created",
    actorUuid: params.agentUuid,
  });

  return formatSessionResponse(session);
}

// Get Session details (including active checkins)
export async function getSession(
  companyUuid: string,
  sessionUuid: string
): Promise<SessionResponse | null> {
  const session = await prisma.agentSession.findFirst({
    where: { uuid: sessionUuid, companyUuid },
    include: {
      runCheckins: {
        where: { checkoutAt: null },
        select: { runUuid: true, checkinAt: true, checkoutAt: true },
      },
    },
  });

  if (!session) return null;
  return formatSessionResponse(session);
}

// List Agent's Sessions
export async function listAgentSessions(
  companyUuid: string,
  agentUuid: string,
  status?: string
): Promise<SessionResponse[]> {
  const sessions = await prisma.agentSession.findMany({
    where: {
      companyUuid,
      agentUuid,
      ...(status && { status }),
    },
    include: {
      runCheckins: {
        where: { checkoutAt: null },
        select: { runUuid: true, checkinAt: true, checkoutAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return sessions.map(formatSessionResponse);
}

// Close Session (status->closed, batch checkout all checkins)
export async function closeSession(
  companyUuid: string,
  sessionUuid: string
): Promise<SessionResponse> {
  const session = await prisma.agentSession.findFirst({
    where: { uuid: sessionUuid, companyUuid },
  });

  if (!session) throw new Error("Session not found");

  // Query active checkins before batch checkout for event emission
  const activeCheckins = await prisma.sessionRunCheckin.findMany({
    where: { sessionUuid, checkoutAt: null },
    select: { run: { select: { uuid: true, researchProjectUuid: true } } },
  });

  // Batch checkout all active checkins
  await prisma.sessionRunCheckin.updateMany({
    where: { sessionUuid, checkoutAt: null },
    data: { checkoutAt: new Date() },
  });

  const updated = await prisma.agentSession.update({
    where: { uuid: sessionUuid },
    data: { status: "closed" },
    include: {
      runCheckins: {
        select: { runUuid: true, checkinAt: true, checkoutAt: true },
      },
    },
  });

  for (const checkin of activeCheckins) {
    eventBus.emitChange({ companyUuid: session.companyUuid, researchProjectUuid: checkin.run.researchProjectUuid, entityType: "experiment_run", entityUuid: checkin.run.uuid, action: "updated" });
  }

  return formatSessionResponse(updated);
}

// Session checkin to Experiment Run
export async function sessionCheckinToRun(
  companyUuid: string,
  sessionUuid: string,
  runUuid: string
): Promise<SessionRunCheckinInfo> {
  // Verify session exists and belongs to this company
  const session = await prisma.agentSession.findFirst({
    where: { uuid: sessionUuid, companyUuid, status: "active" },
  });
  if (!session) throw new Error("Session not found or not active");

  // Verify task exists and belongs to this company
  const task = await prisma.experimentRun.findFirst({
    where: { uuid: runUuid, companyUuid },
  });
  if (!task) throw new Error("Experiment run not found");

  // Auto-claim: if task has no assignee, claim it for the session's agent
  if (!task.assigneeUuid) {
    try {
      await claimExperimentRun({
        runUuid,
        companyUuid,
        assigneeType: "agent",
        assigneeUuid: session.agentUuid,
      });
    } catch {
      // Claim may fail if task was concurrently claimed — safe to ignore
    }
  }

  // Upsert: reactivate if already exists
  const checkin = await prisma.sessionRunCheckin.upsert({
    where: {
      sessionUuid_runUuid: { sessionUuid, runUuid },
    },
    create: { sessionUuid, runUuid },
    update: { checkoutAt: null, checkinAt: new Date() },
  });

  // Update lastActiveAt
  await prisma.agentSession.update({
    where: { uuid: sessionUuid },
    data: { lastActiveAt: new Date() },
  });

  eventBus.emitChange({ companyUuid, researchProjectUuid: task.researchProjectUuid, entityType: "experiment_run", entityUuid: runUuid, action: "updated" });

  return {
    runUuid: checkin.runUuid,
    checkinAt: checkin.checkinAt.toISOString(),
    checkoutAt: checkin.checkoutAt?.toISOString() ?? null,
  };
}

// Session checkout from Experiment Run
export async function sessionCheckoutFromRun(
  companyUuid: string,
  sessionUuid: string,
  runUuid: string
): Promise<void> {
  // Verify session belongs to this company
  const session = await prisma.agentSession.findFirst({
    where: { uuid: sessionUuid, companyUuid },
  });
  if (!session) throw new Error("Session not found");

  const task = await prisma.experimentRun.findFirst({
    where: { uuid: runUuid, companyUuid },
    select: { researchProjectUuid: true },
  });

  await prisma.sessionRunCheckin.updateMany({
    where: { sessionUuid, runUuid, checkoutAt: null },
    data: { checkoutAt: new Date() },
  });

  if (task) {
    eventBus.emitChange({ companyUuid, researchProjectUuid: task.researchProjectUuid, entityType: "experiment_run", entityUuid: runUuid, action: "updated" });
  }
}

// Get all active Sessions for an Experiment Run
export async function getSessionsForRun(
  companyUuid: string,
  runUuid: string
): Promise<RunSessionInfo[]> {
  const checkins = await prisma.sessionRunCheckin.findMany({
    where: {
      runUuid,
      checkoutAt: null,
      session: { companyUuid, status: { in: ["active", "inactive"] } },
    },
    include: {
      session: {
        select: {
          uuid: true,
          name: true,
          agentUuid: true,
          agent: { select: { name: true } },
        },
      },
    },
  });

  return checkins.map((c) => ({
    sessionUuid: c.session.uuid,
    sessionName: c.session.name,
    agentUuid: c.session.agentUuid,
    agentName: c.session.agent.name,
    checkinAt: c.checkinAt.toISOString(),
  }));
}

// Heartbeat update lastActiveAt
export async function heartbeatSession(
  companyUuid: string,
  sessionUuid: string
): Promise<void> {
  const session = await prisma.agentSession.findFirst({
    where: { uuid: sessionUuid, companyUuid },
  });
  if (!session) throw new Error("Session not found");

  await prisma.agentSession.update({
    where: { uuid: sessionUuid },
    data: {
      lastActiveAt: new Date(),
      // If status is inactive, restore to active after heartbeat
      ...(session.status === "inactive" && { status: "active" }),
    },
  });
}

// Reopen a closed Session (closed -> active)
export async function reopenSession(
  companyUuid: string,
  sessionUuid: string
): Promise<SessionResponse> {
  const session = await prisma.agentSession.findFirst({
    where: { uuid: sessionUuid, companyUuid },
  });

  if (!session) throw new Error("Session not found");
  if (session.status !== "closed") throw new Error("Only closed sessions can be reopened");

  const updated = await prisma.agentSession.update({
    where: { uuid: sessionUuid },
    data: {
      status: "active",
      lastActiveAt: new Date(),
    },
    include: {
      runCheckins: {
        where: { checkoutAt: null },
        select: { runUuid: true, checkinAt: true, checkoutAt: true },
      },
    },
  });

  return formatSessionResponse(updated);
}

// Batch get active worker counts for multiple experiment runs (1 groupBy query instead of N individual queries)
export async function batchGetWorkerCountsForRuns(
  companyUuid: string,
  runUuids: string[]
): Promise<Record<string, number>> {
  if (runUuids.length === 0) return {};

  const checkins = await prisma.sessionRunCheckin.groupBy({
    by: ["runUuid"],
    where: {
      runUuid: { in: runUuids },
      checkoutAt: null,
      session: { companyUuid, status: { in: ["active", "inactive"] } },
    },
    _count: { runUuid: true },
  });

  const result: Record<string, number> = {};
  for (const checkin of checkins) {
    result[checkin.runUuid] = checkin._count.runUuid;
  }
  return result;
}

// Batch mark inactive sessions (no heartbeat for 1 hour)
export async function markInactiveSessions(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const result = await prisma.agentSession.updateMany({
    where: {
      status: "active",
      lastActiveAt: { lt: oneHourAgo },
    },
    data: { status: "inactive" },
  });

  return result.count;
}

// Get Session name (for Activity display)
export async function getSessionName(sessionUuid: string): Promise<string | null> {
  const session = await prisma.agentSession.findUnique({
    where: { uuid: sessionUuid },
    select: { name: true },
  });
  return session?.name ?? null;
}

/**
 * Get all active workers for a project's PixelCanvas.
 * Returns up to 5 unique workers (for PixelCanvas slots).
 *
 * Sources (merged, session-based workers listed first):
 * 1. Session-based: each unique session with active checkins = one sub-agent worker
 * 2. Sessionless: agents with in_progress tasks that have NO active session checkin
 *    on those tasks = the main agent working directly (e.g. OpenClaw single-agent mode).
 *    Even if the same agent has sessions on other tasks, the main agent still counts
 *    as a separate worker when it works on tasks without delegating to a session.
 */
export async function getActiveSessionsForProject(
  companyUuid: string,
  researchProjectUuid: string
): Promise<RunSessionInfo[]> {
  // 1. Session-based workers: each unique session = one sub-agent worker
  const checkins = await prisma.sessionRunCheckin.findMany({
    where: {
      checkoutAt: null,
      run: { researchProjectUuid },
      session: { companyUuid, status: { in: ["active", "inactive"] } },
    },
    include: {
      session: {
        select: {
          uuid: true,
          name: true,
          agentUuid: true,
          agent: { select: { name: true } },
        },
      },
    },
    orderBy: { checkinAt: "asc" },
  });

  // Deduplicate by session UUID, keep first checkin per session
  const seenSessions = new Set<string>();
  const results: RunSessionInfo[] = [];
  // Collect task UUIDs that have active session checkins
  const runsWithCheckins = new Set<string>();
  for (const c of checkins) {
    runsWithCheckins.add(c.runUuid);
    if (seenSessions.has(c.session.uuid)) continue;
    seenSessions.add(c.session.uuid);
    results.push({
      sessionUuid: c.session.uuid,
      sessionName: c.session.name,
      agentUuid: c.session.agentUuid,
      agentName: c.session.agent.name,
      checkinAt: c.checkinAt.toISOString(),
    });
    if (results.length >= 7) return results;
  }

  // 2. Sessionless workers: agents doing in_progress tasks without a session
  //    (the main agent working directly, not via a sub-agent session)
  const sessionlessRuns = await prisma.experimentRun.findMany({
    where: {
      researchProjectUuid,
      companyUuid,
      status: "in_progress",
      assigneeType: "agent",
      assigneeUuid: { not: null },
      // Exclude tasks that already have active session checkins
      ...(runsWithCheckins.size > 0
        ? { uuid: { notIn: [...runsWithCheckins] } }
        : {}),
    },
    select: {
      uuid: true,
      assigneeUuid: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  // Deduplicate by agent UUID — one entry per "main agent" working directly
  const seenDirectAgents = new Set<string>();
  const uniqueAgentRuns: typeof sessionlessRuns = [];
  for (const run of sessionlessRuns) {
    if (!run.assigneeUuid || seenDirectAgents.has(run.assigneeUuid)) continue;
    seenDirectAgents.add(run.assigneeUuid);
    uniqueAgentRuns.push(run);
    if (results.length + uniqueAgentRuns.length >= 7) break;
  }

  if (uniqueAgentRuns.length > 0) {
    // Batch-fetch agent names
    const agents = await prisma.agent.findMany({
      where: { uuid: { in: uniqueAgentRuns.map((t) => t.assigneeUuid!) } },
      select: { uuid: true, name: true },
    });
    const agentMap = new Map(agents.map((a) => [a.uuid, a.name]));

    for (const run of uniqueAgentRuns) {
      const agentName = agentMap.get(run.assigneeUuid!);
      if (!agentName) continue;
      results.push({
        sessionUuid: "",
        sessionName: agentName,
        agentUuid: run.assigneeUuid!,
        agentName,
        checkinAt: run.updatedAt.toISOString(),
      });
    }
  }

  return results;
}

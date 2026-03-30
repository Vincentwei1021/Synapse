import { prisma } from "@/lib/prisma";
import { normalizeResearchQuestionStatus } from "@/services/research-question.service";

export interface ProjectMetricsSnapshot {
  researchProjectUuid: string;
  researchQuestions: {
    total: number;
    open: number;
    elaborating: number;
    proposalCreated: number;
    completed: number;
    closed: number;
  };
  experiments: {
    total: number;
    draft: number;
    pendingReview: number;
    pendingStart: number;
    inProgress: number;
    completed: number;
  };
  experimentDesigns: {
    total: number;
    draft: number;
    pending: number;
    approved: number;
    rejected: number;
    closed: number;
    active: number;
  };
  experimentRuns: {
    total: number;
    open: number;
    assigned: number;
    inProgress: number;
    toVerify: number;
    done: number;
    closed: number;
    completed: number;
  };
  documents: {
    total: number;
  };
  completionRate: number;
}

type StatusCountRow = {
  researchProjectUuid: string;
  status: string | null;
  _count: { _all: number };
};

type CountRow = {
  researchProjectUuid: string;
  _count: { _all: number };
};

function createEmptySnapshot(researchProjectUuid: string): ProjectMetricsSnapshot {
  return {
    researchProjectUuid,
    researchQuestions: {
      total: 0,
      open: 0,
      elaborating: 0,
      proposalCreated: 0,
      completed: 0,
      closed: 0,
    },
    experiments: {
      total: 0,
      draft: 0,
      pendingReview: 0,
      pendingStart: 0,
      inProgress: 0,
      completed: 0,
    },
    experimentDesigns: {
      total: 0,
      draft: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      closed: 0,
      active: 0,
    },
    experimentRuns: {
      total: 0,
      open: 0,
      assigned: 0,
      inProgress: 0,
      toVerify: 0,
      done: 0,
      closed: 0,
      completed: 0,
    },
    documents: {
      total: 0,
    },
    completionRate: 0,
  };
}

function statusCountMap(rows: StatusCountRow[]) {
  const map = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const projectMap = map.get(row.researchProjectUuid) ?? new Map<string, number>();
    projectMap.set(row.status ?? "", row._count._all);
    map.set(row.researchProjectUuid, projectMap);
  }

  return map;
}

function countMap(rows: CountRow[]) {
  return new Map(rows.map((row) => [row.researchProjectUuid, row._count._all]));
}

function questionMetricsForProject(projectUuid: string, map: Map<string, Map<string, number>>) {
  const projectMap = map.get(projectUuid) ?? new Map<string, number>();
  const normalized = new Map<string, number>();

  for (const [status, count] of projectMap.entries()) {
    const key = normalizeResearchQuestionStatus(status);
    normalized.set(key, (normalized.get(key) ?? 0) + count);
  }

  return {
    total: Array.from(normalized.values()).reduce((sum, count) => sum + count, 0),
    open: normalized.get("open") ?? 0,
    elaborating: normalized.get("elaborating") ?? 0,
    proposalCreated: normalized.get("proposal_created") ?? 0,
    completed: normalized.get("completed") ?? 0,
    closed: normalized.get("closed") ?? 0,
  };
}

function experimentMetricsForProject(projectUuid: string, map: Map<string, Map<string, number>>) {
  const projectMap = map.get(projectUuid) ?? new Map<string, number>();
  const total = Array.from(projectMap.values()).reduce((sum, count) => sum + count, 0);
  const draft = projectMap.get("draft") ?? 0;
  const pendingReview = projectMap.get("pending_review") ?? 0;
  const pendingStart = projectMap.get("pending_start") ?? 0;
  const inProgress = projectMap.get("in_progress") ?? 0;
  const completed = projectMap.get("completed") ?? 0;

  return {
    total,
    draft,
    pendingReview,
    pendingStart,
    inProgress,
    completed,
  };
}

function experimentDesignMetricsForProject(projectUuid: string, map: Map<string, Map<string, number>>) {
  const projectMap = map.get(projectUuid) ?? new Map<string, number>();
  const total = Array.from(projectMap.values()).reduce((sum, count) => sum + count, 0);
  const draft = projectMap.get("draft") ?? 0;
  const pending = projectMap.get("pending") ?? 0;
  const approved = projectMap.get("approved") ?? 0;
  const rejected = projectMap.get("rejected") ?? 0;
  const closed = projectMap.get("closed") ?? 0;

  return {
    total,
    draft,
    pending,
    approved,
    rejected,
    closed,
    active: draft + pending,
  };
}

function experimentRunMetricsForProject(projectUuid: string, map: Map<string, Map<string, number>>) {
  const projectMap = map.get(projectUuid) ?? new Map<string, number>();
  const total = Array.from(projectMap.values()).reduce((sum, count) => sum + count, 0);
  const open = projectMap.get("open") ?? 0;
  const assigned = projectMap.get("assigned") ?? 0;
  const inProgress = projectMap.get("in_progress") ?? 0;
  const toVerify = projectMap.get("to_verify") ?? 0;
  const done = projectMap.get("done") ?? 0;
  const closed = projectMap.get("closed") ?? 0;

  return {
    total,
    open,
    assigned,
    inProgress,
    toVerify,
    done,
    closed,
    completed: done + closed,
  };
}

function completionRateForSnapshot(snapshot: Pick<ProjectMetricsSnapshot, "experiments" | "experimentRuns">) {
  if (snapshot.experiments.total > 0) {
    return Math.round((snapshot.experiments.completed / snapshot.experiments.total) * 100);
  }

  if (snapshot.experimentRuns.total > 0) {
    return Math.round((snapshot.experimentRuns.completed / snapshot.experimentRuns.total) * 100);
  }

  return 0;
}

export function toProjectCompatibilityCounts(snapshot: ProjectMetricsSnapshot) {
  return {
    researchQuestions: snapshot.researchQuestions.total,
    openResearchQuestions: snapshot.researchQuestions.open,
    documents: snapshot.documents.total,
    experiments: snapshot.experiments.total,
    doneExperiments: snapshot.experiments.completed,
    experimentDesigns: snapshot.experimentDesigns.total,
    activeExperimentDesigns: snapshot.experimentDesigns.active,
    experimentRuns: snapshot.experimentRuns.total,
    doneExperimentRuns: snapshot.experimentRuns.completed,
    ideas: snapshot.researchQuestions.total,
    tasks: snapshot.experiments.total,
    doneTasks: snapshot.experiments.completed,
    proposals: snapshot.experimentDesigns.total,
  };
}

export async function getProjectMetricsSnapshots(
  companyUuid: string,
  researchProjectUuids: string[]
): Promise<Map<string, ProjectMetricsSnapshot>> {
  const snapshots = new Map(
    researchProjectUuids.map((researchProjectUuid) => [researchProjectUuid, createEmptySnapshot(researchProjectUuid)])
  );

  if (researchProjectUuids.length === 0) {
    return snapshots;
  }

  const [questionRows, experimentRows, designRows, runRows, documentRows] = await Promise.all([
    prisma.researchQuestion.groupBy({
      by: ["researchProjectUuid", "status"],
      where: { companyUuid, researchProjectUuid: { in: researchProjectUuids } },
      _count: { _all: true },
    }),
    prisma.experiment.groupBy({
      by: ["researchProjectUuid", "status"],
      where: { companyUuid, researchProjectUuid: { in: researchProjectUuids } },
      _count: { _all: true },
    }),
    prisma.experimentDesign.groupBy({
      by: ["researchProjectUuid", "status"],
      where: { companyUuid, researchProjectUuid: { in: researchProjectUuids } },
      _count: { _all: true },
    }),
    prisma.experimentRun.groupBy({
      by: ["researchProjectUuid", "status"],
      where: { companyUuid, researchProjectUuid: { in: researchProjectUuids } },
      _count: { _all: true },
    }),
    prisma.document.groupBy({
      by: ["researchProjectUuid"],
      where: { companyUuid, researchProjectUuid: { in: researchProjectUuids } },
      _count: { _all: true },
    }),
  ]);

  const questionMap = statusCountMap(questionRows as StatusCountRow[]);
  const experimentMap = statusCountMap(experimentRows as StatusCountRow[]);
  const designMap = statusCountMap(designRows as StatusCountRow[]);
  const runMap = statusCountMap(runRows as StatusCountRow[]);
  const documentCountMap = countMap(documentRows as CountRow[]);

  for (const projectUuid of researchProjectUuids) {
    const snapshot = createEmptySnapshot(projectUuid);
    snapshot.researchQuestions = questionMetricsForProject(projectUuid, questionMap);
    snapshot.experiments = experimentMetricsForProject(projectUuid, experimentMap);
    snapshot.experimentDesigns = experimentDesignMetricsForProject(projectUuid, designMap);
    snapshot.experimentRuns = experimentRunMetricsForProject(projectUuid, runMap);
    snapshot.documents.total = documentCountMap.get(projectUuid) ?? 0;
    snapshot.completionRate = completionRateForSnapshot(snapshot);
    snapshots.set(projectUuid, snapshot);
  }

  return snapshots;
}

export async function getProjectMetricsSnapshot(companyUuid: string, researchProjectUuid: string) {
  const snapshots = await getProjectMetricsSnapshots(companyUuid, [researchProjectUuid]);
  return snapshots.get(researchProjectUuid) ?? createEmptySnapshot(researchProjectUuid);
}

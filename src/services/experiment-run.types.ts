export interface ExperimentRunListParams {
  companyUuid: string;
  researchProjectUuid: string;
  skip: number;
  take: number;
  status?: string;
  priority?: string;
  experimentDesignUuids?: string[];
}

export interface ExperimentRunCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  title: string;
  description?: string | null;
  priority?: string;
  computeBudgetHours?: number | null;
  acceptanceCriteria?: string | null;
  experimentDesignUuid?: string | null;
  createdByUuid: string;
}

export interface ExperimentRunClaimParams {
  runUuid: string;
  companyUuid: string;
  assigneeType: string;
  assigneeUuid: string;
  assignedByUuid?: string | null;
}

export interface ExperimentRunUpdateParams {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  computeBudgetHours?: number | null;
  acceptanceCriteria?: string | null;
  outcome?: string | null;
  experimentResults?: unknown;
}

export interface RunDependencyInfo {
  uuid: string;
  title: string;
  status: string;
}

export interface AcceptanceCriterionResponse {
  uuid: string;
  description: string;
  required: boolean;
  devStatus: string;
  devEvidence: string | null;
  devMarkedByType: string | null;
  devMarkedBy: string | null;
  devMarkedAt: string | null;
  status: string;
  evidence: string | null;
  markedByType: string | null;
  markedBy: string | null;
  markedAt: string | null;
  sortOrder: number;
}

export interface AcceptanceSummary {
  total: number;
  required: number;
  passed: number;
  failed: number;
  pending: number;
  requiredPassed: number;
  requiredFailed: number;
  requiredPending: number;
}

export interface ExperimentRunResponse {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  computeBudgetHours: number | null;
  acceptanceCriteria: string | null;
  outcome: string | null;
  experimentResults: unknown;
  acceptanceCriteriaItems: AcceptanceCriterionResponse[];
  acceptanceStatus: string;
  acceptanceSummary: AcceptanceSummary;
  assignee: {
    type: string;
    uuid: string;
    name: string;
    assignedAt: string | null;
    assignedBy: { type: string; uuid: string; name: string } | null;
  } | null;
  experimentDesignUuid: string | null;
  project?: { uuid: string; name: string };
  createdBy: { type: string; uuid: string; name: string } | null;
  dependsOn: RunDependencyInfo[];
  dependedBy: RunDependencyInfo[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlockerInfo {
  uuid: string;
  title: string;
  status: string;
  assignee: { type: string; uuid: string; name: string } | null;
  sessionCheckin: { sessionUuid: string; sessionName: string } | null;
}

export const EXPERIMENT_RUN_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["to_verify", "closed"],
  to_verify: ["done", "in_progress", "closed"],
  done: ["closed"],
  closed: [],
};

export function isValidExperimentRunStatusTransition(from: string, to: string): boolean {
  const allowed = EXPERIMENT_RUN_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

const emptySummary: AcceptanceSummary = {
  total: 0,
  required: 0,
  passed: 0,
  failed: 0,
  pending: 0,
  requiredPassed: 0,
  requiredFailed: 0,
  requiredPending: 0,
};

export function computeAcceptanceStatus(
  items: Array<{ required: boolean; status: string }>,
): { status: string; summary: AcceptanceSummary } {
  if (items.length === 0) {
    return { status: "not_started", summary: { ...emptySummary } };
  }

  const summary: AcceptanceSummary = { ...emptySummary, total: items.length };
  for (const item of items) {
    if (item.required) summary.required++;
    if (item.status === "passed") {
      summary.passed++;
      if (item.required) summary.requiredPassed++;
    } else if (item.status === "failed") {
      summary.failed++;
      if (item.required) summary.requiredFailed++;
    } else {
      summary.pending++;
      if (item.required) summary.requiredPending++;
    }
  }

  if (summary.requiredFailed > 0) return { status: "failed", summary };
  if (summary.requiredPassed === summary.required && summary.required > 0) return { status: "passed", summary };
  if (summary.passed > 0 || summary.failed > 0) return { status: "in_progress", summary };
  return { status: "not_started", summary };
}

export type AcceptanceCriterionRecord = {
  uuid: string;
  description: string;
  required: boolean;
  devStatus: string;
  devEvidence: string | null;
  devMarkedByType: string | null;
  devMarkedBy: string | null;
  devMarkedAt: Date | null;
  status: string;
  evidence: string | null;
  markedByType: string | null;
  markedBy: string | null;
  markedAt: Date | null;
  sortOrder: number;
};

export function formatCriterionResponse(c: AcceptanceCriterionRecord): AcceptanceCriterionResponse {
  return {
    uuid: c.uuid,
    description: c.description,
    required: c.required,
    devStatus: c.devStatus,
    devEvidence: c.devEvidence,
    devMarkedByType: c.devMarkedByType,
    devMarkedBy: c.devMarkedBy,
    devMarkedAt: c.devMarkedAt?.toISOString() ?? null,
    status: c.status,
    evidence: c.evidence,
    markedByType: c.markedByType,
    markedBy: c.markedBy,
    markedAt: c.markedAt?.toISOString() ?? null,
    sortOrder: c.sortOrder,
  };
}

export const dependencyInclude = {
  dependsOn: {
    select: {
      dependsOnRun: { select: { uuid: true, title: true, status: true } },
    },
  },
  dependedBy: {
    select: {
      run: { select: { uuid: true, title: true, status: true } },
    },
  },
  acceptanceCriteriaItems: {
    orderBy: { sortOrder: "asc" as const },
  },
} as const;

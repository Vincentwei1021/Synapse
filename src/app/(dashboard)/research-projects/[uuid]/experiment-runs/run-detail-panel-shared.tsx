import { Fragment } from "react";
import type { ActivityResponse } from "@/services/activity.service";

export interface DependencyTask {
  uuid: string;
  title: string;
  status: string;
}

export interface AcceptanceCriterionItem {
  uuid: string;
  description: string;
  required: boolean;
  devStatus: string;
  devEvidence: string | null;
  status: string;
  evidence: string | null;
  sortOrder: number;
  metricName: string | null;
  operator: string | null;
  threshold: number | null;
  isEarlyStop: boolean;
  actualValue: number | null;
}

export interface AcceptanceSummaryData {
  total: number;
  required: number;
  passed: number;
  failed: number;
  pending: number;
  requiredPassed: number;
  requiredFailed: number;
  requiredPending: number;
}

export interface TaskDetail {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  computeBudgetHours: number | null;
  acceptanceCriteria?: string | null;
  acceptanceCriteriaItems?: AcceptanceCriterionItem[];
  acceptanceStatus?: string;
  acceptanceSummary?: AcceptanceSummaryData;
  experimentDesignUuid: string | null;
  assignee: {
    type: string;
    uuid: string;
    name: string;
    assignedAt: string | null;
    assignedBy: { type: string; uuid: string; name: string } | null;
  } | null;
  dependsOn?: DependencyTask[];
  dependedBy?: DependencyTask[];
  experimentConfig?: Record<string, unknown> | null;
  experimentResults?: Record<string, unknown> | null;
  baselineRunUuid?: string | null;
  outcome?: string | null;
  earlyStopTriggered?: boolean;
}

export const statusColors: Record<string, string> = {
  open: "bg-[#FFF3E0] text-[#E65100]",
  assigned: "bg-[#E3F2FD] text-[#1976D2]",
  in_progress: "bg-[#E8F5E9] text-[#5A9E6F]",
  to_verify: "bg-[#F3E5F5] text-[#7B1FA2]",
  done: "bg-[#E0F2F1] text-[#00796B]",
  closed: "bg-[#F5F5F5] text-[#9A9A9A]",
};

export const statusI18nKeys: Record<string, string> = {
  open: "open",
  assigned: "assigned",
  in_progress: "inProgress",
  to_verify: "toVerify",
  done: "done",
  closed: "closed",
};

export const priorityColors: Record<string, string> = {
  low: "bg-[#F5F5F5] text-[#9A9A9A]",
  medium: "bg-[#FFF3E0] text-[#E65100]",
  high: "bg-[#FEE2E2] text-[#D32F2F]",
  critical: "bg-[#FFCDD2] text-[#B71C1C]",
};

export const priorityI18nKeys: Record<string, string> = {
  low: "lowPriority",
  medium: "mediumPriority",
  high: "highPriority",
  critical: "criticalPriority",
};

type TranslationValues = Record<string, string | number | Date>;
type TranslationFn = (key: string, values?: TranslationValues) => string;

export function formatRelativeTime(dateString: string, t: TranslationFn): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("time.justNow");
  if (diffMins < 60) return t("time.minutesAgo", { minutes: diffMins });
  if (diffHours < 24) return t("time.hoursAgo", { hours: diffHours });
  if (diffDays < 7) return t("time.daysAgo", { days: diffDays });
  return date.toLocaleDateString();
}

export function getActivityDotColor(action: string): string {
  switch (action) {
    case "task_created":
      return "bg-[#C67A52]";
    case "task_assigned":
    case "task_claimed":
      return "bg-[#1976D2]";
    case "task_started":
      return "bg-[#5A9E6F]";
    case "task_submitted":
      return "bg-[#7B1FA2]";
    case "task_completed":
    case "task_verified":
      return "bg-[#00796B]";
    case "task_released":
      return "bg-[#E65100]";
    default:
      return "bg-[#6B6B6B]";
  }
}

export function formatActivityMessage(activity: ActivityResponse, t: TranslationFn): string {
  const actorDisplay = activity.sessionName
    ? `${activity.actorName} / ${activity.sessionName}`
    : activity.actorName;
  const { action } = activity;
  const actorName = actorDisplay;

  switch (action) {
    case "task_created":
      return t("activity.taskCreated", { actor: actorName });
    case "task_assigned":
      return t("activity.taskAssigned", { actor: actorName });
    case "task_claimed":
      return t("activity.taskClaimed", { actor: actorName });
    case "task_started":
      return t("activity.taskStarted", { actor: actorName });
    case "task_submitted":
      return t("activity.taskSubmitted", { actor: actorName });
    case "task_completed":
    case "task_verified":
      return t("activity.taskCompleted", { actor: actorName });
    case "task_released":
      return t("activity.taskReleased", { actor: actorName });
    case "task_status_changed":
      return t("activity.taskStatusChanged", { actor: actorName });
    default:
      return `${actorName}: ${action}`;
  }
}

export function JsonKeyValue({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      {Object.entries(data).map(([key, value]) => (
        <Fragment key={key}>
          <span className="font-medium text-[#6B6B6B]">{key}</span>
          <span className="text-[#2C2C2C]">{String(value)}</span>
        </Fragment>
      ))}
    </div>
  );
}

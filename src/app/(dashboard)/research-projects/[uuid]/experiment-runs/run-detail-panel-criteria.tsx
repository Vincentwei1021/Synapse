"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle,
  CircleCheck,
  CircleX,
  Clock,
  Timer,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { markCriteriaAction, resetCriterionAction } from "./[runUuid]/criteria-actions";
import type { TaskDetail } from "./run-detail-panel-shared";

interface RunDetailCriteriaProps {
  task: TaskDetail;
}

function evaluateOperator(actual: number, op: string, threshold: number): boolean {
  switch (op) {
    case ">=":
      return actual >= threshold;
    case "<=":
      return actual <= threshold;
    case ">":
      return actual > threshold;
    case "<":
      return actual < threshold;
    case "==":
      return actual === threshold;
    default:
      return false;
  }
}

function criterionStatusColor(status: string): string {
  if (status === "passed") return "bg-green-50 text-green-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  return "bg-yellow-50 text-yellow-700";
}

function criterionStatusIcon(status: string) {
  if (status === "passed") return <CircleCheck className="h-4 w-4 text-green-600" />;
  if (status === "failed") return <CircleX className="h-4 w-4 text-red-600" />;
  return <Timer className="h-4 w-4 text-yellow-600" />;
}

export function RunDetailCriteria({ task }: RunDetailCriteriaProps) {
  const router = useRouter();
  const t = useTranslations();

  const hasStructuredCriteria =
    !!task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0;

  const goNoGoItems = (task.acceptanceCriteriaItems || []).filter(
    (item) => item.metricName !== null && item.metricName !== undefined
  );

  const evaluatedGoNoGoItems = goNoGoItems.map((item) => {
    let result: "passed" | "failed" | "pending" = "pending";

    if (
      item.actualValue !== null &&
      item.actualValue !== undefined &&
      item.operator !== null &&
      item.threshold !== null
    ) {
      result = evaluateOperator(item.actualValue, item.operator, item.threshold)
        ? "passed"
        : "failed";
    }

    return { ...item, evalResult: result };
  });

  const requiredEvaluated = evaluatedGoNoGoItems.filter((item) => item.required);
  const passedCount = requiredEvaluated.filter((item) => item.evalResult === "passed").length;
  const failedCount = requiredEvaluated.filter((item) => item.evalResult === "failed").length;
  const pendingCount = requiredEvaluated.filter((item) => item.evalResult === "pending").length;

  let suggestedOutcome: "Accepted" | "Rejected" | "Inconclusive" = "Inconclusive";
  if (failedCount > 0) {
    suggestedOutcome = "Rejected";
  } else if (pendingCount === 0 && passedCount > 0) {
    suggestedOutcome = "Accepted";
  }

  const outcomeBadgeColor =
    suggestedOutcome === "Accepted"
      ? "bg-green-50 text-green-700"
      : suggestedOutcome === "Rejected"
        ? "bg-red-50 text-red-700"
        : "bg-yellow-50 text-yellow-700";

  const handleMarkCriterion = async (
    criterionUuid: string,
    newStatus: "passed" | "failed"
  ) => {
    const result = await markCriteriaAction(task.uuid, [{ uuid: criterionUuid, status: newStatus }]);
    if (result.success) {
      router.refresh();
    }
  };

  const handleResetCriterion = async (criterionUuid: string) => {
    const result = await resetCriterionAction(task.uuid, criterionUuid);
    if (result.success) {
      router.refresh();
    }
  };

  if (!task.earlyStopTriggered && !hasStructuredCriteria && evaluatedGoNoGoItems.length === 0) {
    return null;
  }

  return (
    <>
      {task.earlyStopTriggered && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {t("acceptanceCriteria.earlyStopTriggered")}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {t("acceptanceCriteria.earlyStopDescription")}
              </p>
            </div>
          </div>
        </Card>
      )}

      {evaluatedGoNoGoItems.length > 0 && (
        <div className="mt-5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
            {t("acceptanceCriteria.goNoGoTitle")}
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#FAF8F4] p-3">
            <span className="text-xs text-[#2C2C2C]">
              {passedCount} passed, {failedCount} failed, {pendingCount} pending
            </span>
            <span className="text-xs text-[#9A9A9A]">&mdash;</span>
            <span className="text-xs text-[#6B6B6B]">Suggested:</span>
            <Badge className={outcomeBadgeColor}>{suggestedOutcome}</Badge>
          </div>

          <div className="mt-2 space-y-2">
            {evaluatedGoNoGoItems.map((item) => {
              const statusIcon =
                item.evalResult === "passed" ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : item.evalResult === "failed" ? (
                  <XCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <Clock className="h-4 w-4 text-yellow-600" />
                );

              return (
                <Card key={item.uuid} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{statusIcon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#2C2C2C]">{item.metricName}</span>
                        {item.operator && item.threshold !== null && (
                          <span className="text-xs text-[#6B6B6B]">
                            {item.operator} {item.threshold}
                          </span>
                        )}
                        <span className="text-xs text-[#2C2C2C]">
                          Actual:{" "}
                          {item.actualValue !== null && item.actualValue !== undefined
                            ? item.actualValue
                            : "\u2014"}
                        </span>
                        {item.isEarlyStop && (
                          <span className="flex items-center gap-1 text-[10px] text-yellow-700">
                            <AlertTriangle className="h-3 w-3" />
                            Early Stop
                          </span>
                        )}
                        {!item.required && (
                          <span className="text-[10px] text-[#9A9A9A]">(optional)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {hasStructuredCriteria && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
              {t("acceptanceCriteria.title")}
            </label>
            {task.acceptanceSummary && (
              <Badge
                className={criterionStatusColor(task.acceptanceStatus || "pending")}
                variant="secondary"
              >
                {t("acceptanceCriteria.progress", {
                  passed: task.acceptanceSummary.passed,
                  total: task.acceptanceSummary.total,
                })}
              </Badge>
            )}
          </div>

          <div className="mt-2 space-y-2">
            {task.acceptanceCriteriaItems!.map((item) => (
              <Card key={item.uuid} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{criterionStatusIcon(item.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[#2C2C2C]">{item.description}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.required
                          ? t("acceptanceCriteria.required")
                          : t("acceptanceCriteria.optional")}
                      </Badge>
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="w-20 shrink-0 text-[#9A9A9A]">
                          {t("acceptanceCriteria.devSelfCheck")}
                        </span>
                        <Badge
                          className={`text-[10px] ${criterionStatusColor(item.devStatus)}`}
                          variant="secondary"
                        >
                          {criterionStatusIcon(item.devStatus)}
                          <span className="ml-1">
                            {t(`acceptanceCriteria.status.${item.devStatus}`)}
                          </span>
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="w-20 shrink-0 text-[#9A9A9A]">
                          {t("acceptanceCriteria.verification")}
                        </span>
                        <Badge
                          className={`text-[10px] ${criterionStatusColor(item.status)}`}
                          variant="secondary"
                        >
                          {criterionStatusIcon(item.status)}
                          <span className="ml-1">
                            {t(`acceptanceCriteria.status.${item.status}`)}
                          </span>
                        </Badge>
                      </div>
                    </div>

                    {item.devEvidence && (
                      <div className="mt-2 rounded bg-[#FAF8F4] p-2">
                        <span className="text-[10px] font-medium text-[#9A9A9A]">
                          {t("acceptanceCriteria.devEvidence")}
                        </span>
                        <p className="mt-0.5 text-[11px] text-[#2C2C2C]">{item.devEvidence}</p>
                      </div>
                    )}

                    {item.evidence && (
                      <div className="mt-2 rounded bg-[#FAF8F4] p-2">
                        <span className="text-[10px] font-medium text-[#9A9A9A]">
                          {t("acceptanceCriteria.verifyEvidence")}
                        </span>
                        <p className="mt-0.5 text-[11px] text-[#2C2C2C]">{item.evidence}</p>
                      </div>
                    )}

                    {item.status === "pending" ? (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 min-h-[44px] flex-1 border-green-200 text-xs text-green-700 hover:bg-green-50 sm:min-h-0 sm:flex-none"
                          onClick={() => handleMarkCriterion(item.uuid, "passed")}
                        >
                          <CircleCheck className="mr-1 h-3.5 w-3.5" />
                          {t("acceptanceCriteria.pass")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 min-h-[44px] flex-1 border-red-200 text-xs text-red-700 hover:bg-red-50 sm:min-h-0 sm:flex-none"
                          onClick={() => handleMarkCriterion(item.uuid, "failed")}
                        >
                          <CircleX className="mr-1 h-3.5 w-3.5" />
                          {t("acceptanceCriteria.fail")}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 min-h-[44px] text-xs text-[#9A9A9A] hover:text-[#2C2C2C] sm:min-h-0"
                          onClick={() => handleResetCriterion(item.uuid)}
                        >
                          {t("acceptanceCriteria.undoVerification")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {task.acceptanceSummary &&
              (task.acceptanceSummary.requiredPending > 0 ||
                task.acceptanceSummary.requiredFailed > 0) && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-yellow-50 p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
                  <span className="text-xs text-yellow-700">
                    {t("acceptanceCriteria.gateBlocked", {
                      count:
                        task.acceptanceSummary.requiredPending +
                        task.acceptanceSummary.requiredFailed,
                    })}
                  </span>
                </div>
              )}

            {task.acceptanceSummary &&
              task.acceptanceSummary.requiredPending === 0 &&
              task.acceptanceSummary.requiredFailed === 0 &&
              task.acceptanceSummary.required > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 p-3">
                  <CircleCheck className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="text-xs text-green-700">
                    {t("acceptanceCriteria.gateReady")}
                  </span>
                </div>
              )}
          </div>
        </div>
      )}
    </>
  );
}

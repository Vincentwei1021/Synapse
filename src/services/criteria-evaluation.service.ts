// src/services/criteria-evaluation.service.ts
// Criteria Evaluation Service — Go/No-Go logic for experiment runs.
// Evaluates acceptance criteria with metric-based thresholds against reported metrics.

import { prisma } from "@/lib/prisma";

// ===== Type Definitions =====

export interface CriterionResult {
  uuid: string;
  metricName: string;
  operator: string;
  threshold: number;
  actualValue: number | null;
  passed: boolean | null; // null if metric not reported
  isEarlyStop: boolean;
}

export interface EvaluationResult {
  results: CriterionResult[];
  allPassed: boolean;
  anyFailed: boolean;
  shouldStop: boolean; // true if any early-stop criterion failed
  suggestedOutcome: "accepted" | "rejected" | "inconclusive";
}

// ===== Core Logic =====

/**
 * Evaluate a single comparison: actual <operator> threshold.
 */
export function evaluateOperator(actual: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case ">=": return actual >= threshold;
    case "<=": return actual <= threshold;
    case ">":  return actual > threshold;
    case "<":  return actual < threshold;
    case "==": return actual === threshold;
    default:   return false;
  }
}

/**
 * Evaluate all Go/No-Go criteria for an experiment run against reported metrics.
 *
 * For each AcceptanceCriterion with a metricName, operator, and threshold:
 *   - If the metric is in reportedMetrics: evaluate and update actualValue + devStatus in DB
 *   - If the metric is NOT in reportedMetrics: leave as pending (null)
 *
 * Aggregation rules (only consider required criteria):
 *   - allPassed:  all required criteria with reported metrics passed
 *   - anyFailed:  any required criterion failed
 *   - shouldStop: any criterion with isEarlyStop=true failed
 *   - suggestedOutcome: "accepted" if allPassed, "rejected" if anyFailed, "inconclusive" otherwise
 */
export async function evaluateCriteria(
  companyUuid: string,
  runUuid: string,
  reportedMetrics: Record<string, number>,
): Promise<EvaluationResult> {
  // Fetch all acceptance criteria for this run, scoped to company
  const rows = await prisma.acceptanceCriterion.findMany({
    where: {
      runUuid,
      run: { companyUuid },
    },
  });

  // Filter to criteria that have all metric fields set
  const metricCriteria = rows.filter(
    (r) => r.metricName != null && r.operator != null && r.threshold != null,
  );

  // Evaluate each criterion
  const results: CriterionResult[] = [];
  const dbUpdates: Promise<unknown>[] = [];

  for (const criterion of metricCriteria) {
    const metricName = criterion.metricName!;
    const operator = criterion.operator!;
    const threshold = criterion.threshold!;
    const isEarlyStop = criterion.isEarlyStop;

    if (metricName in reportedMetrics) {
      const actualValue = reportedMetrics[metricName];
      const passed = evaluateOperator(actualValue, operator, threshold);

      results.push({
        uuid: criterion.uuid,
        metricName,
        operator,
        threshold,
        actualValue,
        passed,
        isEarlyStop,
      });

      // Update DB with actual value and devStatus
      dbUpdates.push(
        prisma.acceptanceCriterion.update({
          where: { uuid: criterion.uuid },
          data: {
            actualValue,
            devStatus: passed ? "passed" : "failed",
          },
        }),
      );
    } else {
      // Metric not reported — leave as pending
      results.push({
        uuid: criterion.uuid,
        metricName,
        operator,
        threshold,
        actualValue: null,
        passed: null,
        isEarlyStop,
      });
    }
  }

  // Persist all DB updates
  await Promise.all(dbUpdates);

  // Compute aggregates (only required criteria affect outcome)
  const requiredResults = results.filter((r) => {
    // Find the original criterion to check required flag
    const original = metricCriteria.find((c) => c.uuid === r.uuid);
    return original?.required === true;
  });

  const requiredEvaluated = requiredResults.filter((r) => r.passed !== null);
  const requiredAllPassed = requiredEvaluated.length > 0 && requiredEvaluated.every((r) => r.passed === true);
  const requiredAnyFailed = requiredEvaluated.some((r) => r.passed === false);

  // shouldStop: any criterion (required or not) with isEarlyStop that failed
  const shouldStop = results.some((r) => r.isEarlyStop && r.passed === false);

  // allPassed: all required criteria with reported metrics passed,
  // AND all required criteria had their metrics reported
  const allRequiredReported = requiredResults.every((r) => r.passed !== null);
  const allPassed = allRequiredReported && requiredAllPassed;

  const anyFailed = requiredAnyFailed;

  let suggestedOutcome: "accepted" | "rejected" | "inconclusive";
  if (anyFailed) {
    suggestedOutcome = "rejected";
  } else if (allPassed) {
    suggestedOutcome = "accepted";
  } else {
    suggestedOutcome = "inconclusive";
  }

  // Early stopping: set flag on the experiment run and create notification
  if (shouldStop) {
    // Set earlyStopTriggered flag on the experiment run
    await prisma.experimentRun.update({
      where: { uuid: runUuid },
      data: { earlyStopTriggered: true },
    });

    // Find run details for notification
    const run = await prisma.experimentRun.findUnique({
      where: { uuid: runUuid },
      select: { title: true, researchProjectUuid: true, assigneeUuid: true, assigneeType: true },
    });

    if (run && run.assigneeUuid) {
      const failedEarlyStop = results.find(r => r.isEarlyStop && r.passed === false);
      await prisma.notification.create({
        data: {
          companyUuid,
          projectUuid: run.researchProjectUuid,
          recipientType: run.assigneeType || "agent",
          recipientUuid: run.assigneeUuid,
          entityType: "experiment_run",
          entityUuid: runUuid,
          entityTitle: run.title,
          projectName: "",
          action: "early_stop_triggered",
          message: failedEarlyStop
            ? `Early stop triggered: ${failedEarlyStop.metricName} ${failedEarlyStop.operator} ${failedEarlyStop.threshold} (actual: ${failedEarlyStop.actualValue})`
            : "Early stop triggered",
          actorType: "agent",
          actorUuid: companyUuid,
          actorName: "System",
        },
      });
    }
  }

  return {
    results,
    allPassed,
    anyFailed,
    shouldStop,
    suggestedOutcome,
  };
}

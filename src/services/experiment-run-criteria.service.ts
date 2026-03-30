import { prisma } from "@/lib/prisma";
import { getAcceptanceStatus } from "@/services/experiment-run-query.service";
import { emitExperimentRunChange } from "@/services/experiment-run-side-effects.service";
import {
  AcceptanceCriterionResponse,
  AcceptanceSummary,
  formatCriterionResponse,
} from "@/services/experiment-run.types";

export async function createAcceptanceCriteria(
  runUuid: string,
  items: Array<{ description: string; required?: boolean; sortOrder?: number }>,
): Promise<AcceptanceCriterionResponse[]> {
  if (items.length === 0) return [];

  const createPromises = items.map((item, index) =>
    prisma.acceptanceCriterion.create({
      data: {
        runUuid,
        description: item.description,
        required: item.required ?? true,
        sortOrder: item.sortOrder ?? index,
      },
    }),
  );

  const created = await Promise.all(createPromises);
  return created.map(formatCriterionResponse);
}

async function validateRunAndCriteria(
  companyUuid: string,
  runUuid: string,
  criterionUuids: string[],
) {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  const validUuids = new Set(
    (await prisma.acceptanceCriterion.findMany({
      where: { runUuid },
      select: { uuid: true },
    })).map((row) => row.uuid),
  );

  for (const criterionUuid of criterionUuids) {
    if (!validUuids.has(criterionUuid)) {
      throw new Error(`Criterion ${criterionUuid} does not belong to task ${runUuid}`);
    }
  }

  return task;
}

export async function markAcceptanceCriteria(
  companyUuid: string,
  runUuid: string,
  criteria: Array<{ uuid: string; status: "passed" | "failed"; evidence?: string }>,
  auth: { type: string; actorUuid: string },
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  const task = await validateRunAndCriteria(
    companyUuid,
    runUuid,
    criteria.map((criterion) => criterion.uuid),
  );

  for (const criterion of criteria) {
    await prisma.acceptanceCriterion.update({
      where: { uuid: criterion.uuid },
      data: {
        status: criterion.status,
        evidence: criterion.evidence ?? null,
        markedByType: auth.type,
        markedBy: auth.actorUuid,
        markedAt: new Date(),
      },
    });
  }

  emitExperimentRunChange({
    companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: runUuid,
    action: "updated",
  });

  return getAcceptanceStatus(companyUuid, runUuid);
}

export async function reportCriteriaSelfCheck(
  companyUuid: string,
  runUuid: string,
  criteria: Array<{ uuid: string; devStatus: "passed" | "failed"; devEvidence?: string }>,
  auth: { type: string; actorUuid: string },
): Promise<{ items: AcceptanceCriterionResponse[]; status: string; summary: AcceptanceSummary }> {
  const task = await validateRunAndCriteria(
    companyUuid,
    runUuid,
    criteria.map((criterion) => criterion.uuid),
  );

  for (const criterion of criteria) {
    await prisma.acceptanceCriterion.update({
      where: { uuid: criterion.uuid },
      data: {
        devStatus: criterion.devStatus,
        devEvidence: criterion.devEvidence ?? null,
        devMarkedByType: auth.type,
        devMarkedBy: auth.actorUuid,
        devMarkedAt: new Date(),
      },
    });
  }

  emitExperimentRunChange({
    companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: runUuid,
    action: "updated",
  });

  return getAcceptanceStatus(companyUuid, runUuid);
}

export async function resetAcceptanceCriterion(
  companyUuid: string,
  runUuid: string,
  criterionUuid: string,
): Promise<void> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  const criterion = await prisma.acceptanceCriterion.findFirst({
    where: { uuid: criterionUuid, runUuid },
  });
  if (!criterion) throw new Error("Criterion not found for this task");

  await prisma.acceptanceCriterion.update({
    where: { uuid: criterionUuid },
    data: {
      status: "pending",
      evidence: null,
      markedByType: null,
      markedBy: null,
      markedAt: null,
    },
  });

  emitExperimentRunChange({
    companyUuid,
    researchProjectUuid: task.researchProjectUuid,
    entityUuid: runUuid,
    action: "updated",
  });
}

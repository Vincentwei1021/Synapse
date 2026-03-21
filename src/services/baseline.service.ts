// src/services/baseline.service.ts
// Baseline Service Layer — CRUD operations for experiment baselines

import { prisma } from "@/lib/prisma";
import type { Baseline } from "@/generated/prisma/client";

// ===== Service Methods =====

// Create a new baseline
export async function createBaseline(
  companyUuid: string,
  params: {
    researchProjectUuid: string;
    name: string;
    metrics: Record<string, number>;
    experimentUuid?: string;
  }
): Promise<Baseline> {
  return prisma.baseline.create({
    data: {
      companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      name: params.name,
      metrics: params.metrics,
      experimentUuid: params.experimentUuid,
    },
  });
}

// List all baselines for a project
export async function listBaselines(
  companyUuid: string,
  researchProjectUuid: string
): Promise<Baseline[]> {
  return prisma.baseline.findMany({
    where: { companyUuid, researchProjectUuid },
    orderBy: { createdAt: "desc" },
  });
}

// Get active baseline for a project
export async function getActiveBaseline(
  companyUuid: string,
  researchProjectUuid: string
): Promise<Baseline | null> {
  return prisma.baseline.findFirst({
    where: { companyUuid, researchProjectUuid, isActive: true },
  });
}

// Set a baseline as active (deactivate all others in the same project)
export async function setActiveBaseline(
  companyUuid: string,
  baselineUuid: string
): Promise<Baseline> {
  return prisma.$transaction(async (tx) => {
    // Find the baseline to get its project context
    const baseline = await tx.baseline.findFirst({
      where: { uuid: baselineUuid, companyUuid },
    });

    if (!baseline) {
      throw new Error("Baseline not found");
    }

    // Deactivate all baselines in the same project
    await tx.baseline.updateMany({
      where: { companyUuid, researchProjectUuid: baseline.researchProjectUuid },
      data: { isActive: false },
    });

    // Activate the target baseline
    return tx.baseline.update({
      where: { uuid: baselineUuid },
      data: { isActive: true },
    });
  });
}

// Delete a baseline
export async function deleteBaseline(
  companyUuid: string,
  baselineUuid: string
): Promise<void> {
  const baseline = await prisma.baseline.findFirst({
    where: { uuid: baselineUuid, companyUuid },
  });

  if (!baseline) {
    throw new Error("Baseline not found");
  }

  await prisma.baseline.delete({
    where: { uuid: baselineUuid },
  });
}

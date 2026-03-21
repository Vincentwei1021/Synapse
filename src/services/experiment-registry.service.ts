// src/services/experiment-registry.service.ts
// ExperimentRegistry Service Layer
// Tracks experiment configurations, environments, metrics, and artifacts

import { prisma } from "@/lib/prisma";
import type { ExperimentRegistry } from "@/generated/prisma/client";

// Register a new experiment
export async function registerExperiment(
  companyUuid: string,
  params: {
    researchProjectUuid: string;
    runUuid: string;
    config: Record<string, unknown>;
    environment: Record<string, unknown>;
    seed?: number;
    startedAt: Date;
  },
): Promise<ExperimentRegistry> {
  return prisma.experimentRegistry.create({
    data: {
      companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      runUuid: params.runUuid,
      config: params.config,
      environment: params.environment,
      ...(params.seed !== undefined && { seed: params.seed }),
      startedAt: params.startedAt,
    },
  });
}

// Complete an experiment (add metrics and artifacts)
export async function completeExperiment(
  companyUuid: string,
  registryUuid: string,
  params: {
    metrics?: Record<string, number>;
    artifacts?: Record<string, string>;
    completedAt: Date;
  },
): Promise<ExperimentRegistry> {
  const entry = await prisma.experimentRegistry.findFirst({
    where: { uuid: registryUuid, companyUuid },
  });
  if (!entry) throw new Error("ExperimentRegistry not found");

  return prisma.experimentRegistry.update({
    where: { uuid: registryUuid },
    data: {
      completedAt: params.completedAt,
      ...(params.metrics !== undefined && { metrics: params.metrics }),
      ...(params.artifacts !== undefined && { artifacts: params.artifacts }),
    },
  });
}

// Get registry entry by run UUID
export async function getByRun(
  companyUuid: string,
  runUuid: string,
): Promise<ExperimentRegistry | null> {
  return prisma.experimentRegistry.findFirst({
    where: { runUuid, companyUuid },
  });
}

// Mark experiment as reproducible
export async function markReproducible(
  companyUuid: string,
  registryUuid: string,
): Promise<ExperimentRegistry> {
  const entry = await prisma.experimentRegistry.findFirst({
    where: { uuid: registryUuid, companyUuid },
  });
  if (!entry) throw new Error("ExperimentRegistry not found");

  return prisma.experimentRegistry.update({
    where: { uuid: registryUuid },
    data: { reproducible: true },
  });
}

// List all experiments for a project
export async function listByProject(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<ExperimentRegistry[]> {
  return prisma.experimentRegistry.findMany({
    where: {
      companyUuid,
      researchProjectUuid,
    },
    orderBy: { createdAt: "desc" },
  });
}

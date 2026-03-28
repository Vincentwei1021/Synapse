import { prisma } from "@/lib/prisma";

async function wouldCreateCycle(startUuid: string, targetUuid: string): Promise<boolean> {
  const allDeps = await prisma.runDependency.findMany({
    select: { runUuid: true, dependsOnRunUuid: true },
  });

  const adjacency = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!adjacency.has(dep.runUuid)) {
      adjacency.set(dep.runUuid, []);
    }
    adjacency.get(dep.runUuid)!.push(dep.dependsOnRunUuid);
  }

  const visited = new Set<string>();
  const stack = [startUuid];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetUuid) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

export async function addRunDependency(
  companyUuid: string,
  runUuid: string,
  dependsOnRunUuid: string,
): Promise<{ runUuid: string; dependsOnRunUuid: string; createdAt: Date }> {
  if (runUuid === dependsOnRunUuid) {
    throw new Error("An experiment run cannot depend on itself");
  }

  const [task, dependsOnTask] = await Promise.all([
    prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } }),
    prisma.experimentRun.findFirst({ where: { uuid: dependsOnRunUuid, companyUuid } }),
  ]);

  if (!task) throw new Error("ExperimentRun not found");
  if (!dependsOnTask) throw new Error("Dependency experiment run not found");
  if (task.researchProjectUuid !== dependsOnTask.researchProjectUuid) {
    throw new Error("Experiment runs must belong to the same project");
  }

  const cycleDetected = await wouldCreateCycle(dependsOnRunUuid, runUuid);
  if (cycleDetected) {
    throw new Error("Adding this dependency would create a cycle");
  }

  const dep = await prisma.runDependency.create({
    data: { runUuid, dependsOnRunUuid },
  });

  return {
    runUuid: dep.runUuid,
    dependsOnRunUuid: dep.dependsOnRunUuid,
    createdAt: dep.createdAt,
  };
}

export async function removeRunDependency(
  companyUuid: string,
  runUuid: string,
  dependsOnRunUuid: string,
): Promise<void> {
  const task = await prisma.experimentRun.findFirst({ where: { uuid: runUuid, companyUuid } });
  if (!task) throw new Error("ExperimentRun not found");

  await prisma.runDependency.deleteMany({
    where: { runUuid, dependsOnRunUuid },
  });
}

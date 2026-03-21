"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import * as taskService from "@/services/experiment-run.service";

export async function getExperimentRunDependenciesAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { dependsOn: [], dependedBy: [] };
  try {
    return await taskService.getRunDependencies(auth.companyUuid, runUuid);
  } catch {
    return { dependsOn: [], dependedBy: [] };
  }
}

export async function addRunDependencyAction(runUuid: string, dependsOnUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { success: false, error: "Unauthorized" };
  try {
    await taskService.addRunDependency(auth.companyUuid, runUuid, dependsOnUuid);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function removeRunDependencyAction(runUuid: string, dependsOnUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { success: false, error: "Unauthorized" };
  try {
    await taskService.removeRunDependency(auth.companyUuid, runUuid, dependsOnUuid);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getProjectTasksForDependencyAction(projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { tasks: [] };
  try {
    const result = await taskService.listExperimentRuns({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      skip: 0,
      take: 1000,
    });
    return { tasks: result.tasks.map((t: { uuid: string; title: string; status: string }) => ({ uuid: t.uuid, title: t.title, status: t.status })) };
  } catch {
    return { tasks: [] };
  }
}

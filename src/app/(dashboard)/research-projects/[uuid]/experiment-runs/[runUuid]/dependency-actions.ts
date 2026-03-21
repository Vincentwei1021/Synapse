"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import * as taskService from "@/services/experiment-run.service";

export async function getExperimentRunDependenciesAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { dependsOn: [], dependedBy: [] };
  try {
    return await experimentRunService.getExperimentRunDependencies(auth.companyUuid, runUuid);
  } catch {
    return { dependsOn: [], dependedBy: [] };
  }
}

export async function addRunDependencyAction(runUuid: string, dependsOnUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { success: false, error: "Unauthorized" };
  try {
    await experimentRunService.addTaskDependency(auth.companyUuid, runUuid, dependsOnUuid);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function removeRunDependencyAction(runUuid: string, dependsOnUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { success: false, error: "Unauthorized" };
  try {
    await experimentRunService.removeTaskDependency(auth.companyUuid, runUuid, dependsOnUuid);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getProjectTasksForDependencyAction(projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return { tasks: [] };
  try {
    const result = await experimentRunService.listExperimentRuns({
      companyUuid: auth.companyUuid,
      projectUuid,
      skip: 0,
      take: 1000,
    });
    return { tasks: result.tasks.map(t => ({ uuid: t.uuid, title: t.title, status: t.status })) };
  } catch {
    return { tasks: [] };
  }
}

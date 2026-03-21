"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { listActivitiesWithActorNames, type ActivityResponse } from "@/services/activity.service";
import { getExperimentRunByUuid } from "@/services/experiment-run.service";

export async function getRunActivitiesAction(
  runUuid: string
): Promise<{ activities: ActivityResponse[]; total: number }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { activities: [], total: 0 };
  }

  try {
    // Validate task exists
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { activities: [], total: 0 };
    }

    return await listActivitiesWithActorNames({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      skip: 0,
      take: 50,
    });
  } catch (error) {
    console.error("Failed to get task activities:", error);
    return { activities: [], total: 0 };
  }
}

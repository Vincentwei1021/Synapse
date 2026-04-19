"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  getSessionsForRun,
  batchGetWorkerCountsForRuns,
  type RunSessionInfo,
} from "@/services/session.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "experiment_run" });

export async function getExperimentRunSessionsAction(runUuid: string): Promise<{
  success: boolean;
  data?: RunSessionInfo[];
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    const sessions = await getSessionsForRun(auth.companyUuid, runUuid);
    return { success: true, data: sessions };
  } catch (error) {
    log.error({ err: error }, "Failed to fetch task sessions");
    return { success: false, error: "Failed to fetch task sessions" };
  }
}

export async function getBatchWorkerCountsAction(runUuids: string[]): Promise<{
  success: boolean;
  data?: Record<string, number>;
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    const counts = await batchGetWorkerCountsForRuns(auth.companyUuid, runUuids);
    return { success: true, data: counts };
  } catch (error) {
    log.error({ err: error }, "Failed to fetch batch worker counts");
    return { success: false, error: "Failed to fetch batch worker counts" };
  }
}

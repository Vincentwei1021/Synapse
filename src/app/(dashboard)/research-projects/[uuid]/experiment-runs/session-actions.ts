"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  getSessionsForRun,
  batchGetWorkerCountsForRuns,
  type RunSessionInfo,
} from "@/services/session.service";

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
    console.error("Failed to fetch task sessions:", error);
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
    console.error("Failed to fetch batch worker counts:", error);
    return { success: false, error: "Failed to fetch batch worker counts" };
  }
}

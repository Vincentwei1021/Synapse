"use server";

import { getByRun } from "@/services/experiment-registry.service";
import { getServerAuthContext } from "@/lib/auth-server";

export async function getExperimentRegistryAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return null;
  try {
    return await getByRun(auth.companyUuid, runUuid);
  } catch (error) {
    console.error("Failed to get experiment registry:", error);
    return null;
  }
}

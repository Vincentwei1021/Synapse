"use server";

import { getByRun } from "@/services/experiment-registry.service";
import { getServerAuthContext } from "@/lib/auth-server";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "experiment_run" });

export async function getExperimentRegistryAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) return null;
  try {
    return await getByRun(auth.companyUuid, runUuid);
  } catch (error) {
    log.error({ err: error }, "Failed to get experiment registry");
    return null;
  }
}

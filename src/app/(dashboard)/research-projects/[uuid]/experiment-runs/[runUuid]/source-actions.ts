"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { getExperimentDesignByUuid } from "@/services/experiment-design.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "experiment_run" });

export interface ProposalSource {
  uuid: string;
  title: string;
}

export async function getRunSourceAction(
  experimentDesignUuid: string
): Promise<ProposalSource | null> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return null;
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, experimentDesignUuid);
    if (!proposal) {
      return null;
    }

    return {
      uuid: proposal.uuid,
      title: proposal.title,
    };
  } catch (error) {
    log.error({ err: error }, "Failed to get task source");
    return null;
  }
}

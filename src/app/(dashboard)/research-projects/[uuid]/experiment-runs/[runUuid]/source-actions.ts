"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { getExperimentDesignByUuid } from "@/services/experiment-design.service";

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
    console.error("Failed to get task source:", error);
    return null;
  }
}

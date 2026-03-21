"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import { markAcceptanceCriteria, reportCriteriaSelfCheck, resetAcceptanceCriterion, getExperimentRunByUuid } from "@/services/experiment-run.service";

export async function markCriteriaAction(
  runUuid: string,
  criteria: Array<{ uuid: string; status: "passed" | "failed"; evidence?: string }>,
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  // Only users (admins) can verify criteria
  if (auth.type !== "user" && auth.type !== "super_admin") {
    return { success: false, error: "Only users can verify acceptance criteria" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const result = await markAcceptanceCriteria(
      auth.companyUuid,
      runUuid,
      criteria,
      { type: auth.type, actorUuid: auth.actorUuid },
    );

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to mark acceptance criteria:", error);
    return { success: false, error: "Failed to mark acceptance criteria" };
  }
}

export async function resetCriterionAction(
  runUuid: string,
  criterionUuid: string,
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  if (auth.type !== "user" && auth.type !== "super_admin") {
    return { success: false, error: "Only users can reset acceptance criteria" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    await resetAcceptanceCriterion(auth.companyUuid, runUuid, criterionUuid);

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    console.error("Failed to reset acceptance criterion:", error);
    return { success: false, error: "Failed to reset acceptance criterion" };
  }
}

export async function selfCheckCriteriaAction(
  runUuid: string,
  criteria: Array<{ uuid: string; devStatus: "passed" | "failed"; devEvidence?: string }>,
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const result = await reportCriteriaSelfCheck(
      auth.companyUuid,
      runUuid,
      criteria,
      { type: auth.type, actorUuid: auth.actorUuid },
    );

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true, data: result };
  } catch (error) {
    console.error("Failed to self-check acceptance criteria:", error);
    return { success: false, error: "Failed to self-check acceptance criteria" };
  }
}

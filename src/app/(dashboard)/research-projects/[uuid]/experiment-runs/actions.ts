"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import { updateExperimentRun, getExperimentRunByUuid, getProjectRunDependencies, checkDependenciesResolved, checkAcceptanceCriteriaGate } from "@/services/experiment-run.service";
import { createActivity } from "@/services/activity.service";

// Map column IDs to task statuses
const columnToStatusMap: Record<string, string> = {
  todo: "open",
  in_progress: "in_progress",
  to_verify: "to_verify",
  done: "done",
};

export async function moveRunToColumnAction(
  runUuid: string,
  columnId: string,
  projectUuid: string
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Verify task exists and belongs to this company
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Get the new status from the column
    const newStatus = columnToStatusMap[columnId];
    if (!newStatus) {
      return { success: false, error: "Invalid column" };
    }

    // Dependency check when moving to in_progress
    if (newStatus === "in_progress") {
      const depResult = await checkDependenciesResolved(runUuid);
      if (!depResult.resolved) {
        return { success: false, error: "Dependencies not resolved", blocked: true, blockers: depResult.blockers };
      }
    }

    // Don't allow moving to done directly for non-verified tasks
    // Done column should only be reached through verify action
    if (newStatus === "done" && task.status !== "to_verify") {
      // When dragging to done column, set to_verify instead
      await updateExperimentRun(runUuid, { status: "to_verify" });
    } else if (newStatus === "done" && task.status === "to_verify") {
      // If task is in to_verify and dragged to done, verify it
      const gate = await checkAcceptanceCriteriaGate(runUuid);
      if (!gate.allowed) {
        return { success: false, error: gate.reason || "Not all required acceptance criteria are passed", gateBlocked: true, unresolvedCriteria: gate.unresolvedCriteria || [] };
      }
      await updateExperimentRun(runUuid, { status: "done" });
    } else {
      await updateExperimentRun(runUuid, { status: newStatus });
    }

    revalidatePath(`/research-projects/${projectUuid}/experiment-runs`);
    return { success: true };
  } catch (error) {
    console.error("Failed to move task:", error);
    return { success: false, error: "Failed to move task" };
  }
}

export async function forceMoveTaskToColumnAction(
  runUuid: string,
  status: string
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

    await updateExperimentRun(runUuid, { status });

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: task.uuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "force_status_change",
      value: JSON.stringify({
        from: task.status,
        to: status,
      }),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to force move task:", error);
    return { success: false, error: "Failed to force move task" };
  }
}

export async function getProjectDependenciesAction(projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { nodes: [], edges: [] };
  }

  try {
    return await getProjectRunDependencies(auth.companyUuid, projectUuid);
  } catch (error) {
    console.error("Failed to get project dependencies:", error);
    return { nodes: [], edges: [] };
  }
}

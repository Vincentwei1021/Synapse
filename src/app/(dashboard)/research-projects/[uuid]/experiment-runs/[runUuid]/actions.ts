"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import { claimExperimentRun, getExperimentRunByUuid, updateExperimentRun, releaseExperimentRun, createExperimentRun, deleteExperimentRun, checkAcceptanceCriteriaGate } from "@/services/experiment-run.service";
import { getAgentsByRole, getCompanyUsers } from "@/services/agent.service";
import { createActivity } from "@/services/activity.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "experiment_run" });

export async function claimRunAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate task exists and belongs to this company
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Only open or assigned tasks can be claimed/reassigned
    if (task.status !== "open" && task.status !== "assigned") {
      return { success: false, error: "Task is not available for claiming" };
    }

    await claimExperimentRun({
      runUuid,
      companyUuid: auth.companyUuid,
      assigneeType: auth.type,
      assigneeUuid: auth.actorUuid,
      assignedByUuid: auth.actorUuid,
    });

    // Record activity
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "assigned",
      value: { assigneeType: auth.type, assigneeUuid: auth.actorUuid },
    });

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to claim task");
    return { success: false, error: "Failed to claim task" };
  }
}

// Claim task to a specific agent
export async function claimRunToAgentAction(runUuid: string, agentUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    if (task.status !== "open" && task.status !== "assigned") {
      return { success: false, error: "Task is not available for claiming" };
    }

    await claimExperimentRun({
      runUuid,
      companyUuid: auth.companyUuid,
      assigneeType: "agent",
      assigneeUuid: agentUuid,
      assignedByUuid: auth.actorUuid,
    });

    // Record activity
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "assigned",
      value: { assigneeType: "agent", assigneeUuid: agentUuid },
    });

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to claim task to agent");
    return { success: false, error: "Failed to claim task" };
  }
}

export async function releaseRunAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate task exists and belongs to this company
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Only assigned or in_progress tasks can be released
    if (task.status !== "assigned" && task.status !== "in_progress") {
      return { success: false, error: "Task is not in assigned status" };
    }

    // Release task
    await releaseExperimentRun(runUuid);

    // Record activity
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "released",
    });

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to release task");
    return { success: false, error: "Failed to release task" };
  }
}

export async function updateExperimentRunStatusAction(runUuid: string, newStatus: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate task exists and belongs to this company
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    await updateExperimentRun(runUuid, { status: newStatus });

    // Record activity
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "status_changed",
      value: { status: newStatus },
    });

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to update task status");
    return { success: false, error: "Failed to update task status" };
  }
}

// Verify task (to_verify -> done) - Human only
export async function verifyTaskAction(runUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { success: false, error: "Only humans can verify tasks" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    if (task.status !== "to_verify") {
      return { success: false, error: "Task is not in to_verify status" };
    }

    // Check acceptance criteria gate
    const gate = await checkAcceptanceCriteriaGate(runUuid);
    if (!gate.allowed) {
      return { success: false, error: gate.reason || "Not all required acceptance criteria are passed" };
    }

    await updateExperimentRun(runUuid, { status: "done" });

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to verify task");
    return { success: false, error: "Failed to verify task" };
  }
}

// Assign task to another user
export async function claimTaskToUserAction(runUuid: string, userUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    if (task.status !== "open" && task.status !== "assigned") {
      return { success: false, error: "Task is not available for assigning" };
    }

    await claimExperimentRun({
      runUuid,
      companyUuid: auth.companyUuid,
      assigneeType: "user",
      assigneeUuid: userUuid,
      assignedByUuid: auth.actorUuid,
    });

    // Record activity
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "assigned",
      value: { assigneeType: "user", assigneeUuid: userUuid },
    });

    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs/${runUuid}`);
    revalidatePath(`/research-projects/${task.researchProjectUuid}/experiment-runs`);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to assign task to user");
    return { success: false, error: "Failed to assign task" };
  }
}

// Create a new task
interface CreateTaskInput {
  projectUuid: string;
  title: string;
  description?: string;
  priority?: string;
  computeBudgetHours?: number | null;
  acceptanceCriteria?: string | null;
}

export async function createExperimentRunAction(input: CreateTaskInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const task = await createExperimentRun({
      companyUuid: auth.companyUuid,
      researchProjectUuid: input.projectUuid,
      title: input.title,
      description: input.description || null,
      priority: input.priority || "medium",
      computeBudgetHours: input.computeBudgetHours,
      acceptanceCriteria: input.acceptanceCriteria,
      createdByUuid: auth.actorUuid,
    });

    // Record activity
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: input.projectUuid,
      targetType: "experiment_run",
      targetUuid: task.uuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "task_created",
    });

    revalidatePath(`/research-projects/${input.projectUuid}/experiment-runs`);
    return { success: true, runUuid: task.uuid };
  } catch (error) {
    log.error({ err: error }, "Failed to create task");
    return { success: false, error: "Failed to create task" };
  }
}

// Update task editable fields
interface UpdateTaskFieldsInput {
  runUuid: string;
  projectUuid: string;
  title: string;
  description?: string | null;
  priority?: string;
  computeBudgetHours?: number | null;
  acceptanceCriteria?: string | null;
}

export async function updateExperimentRunFieldsAction(input: UpdateTaskFieldsInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, input.runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    await updateExperimentRun(input.runUuid, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      computeBudgetHours: input.computeBudgetHours,
      acceptanceCriteria: input.acceptanceCriteria,
    });

    revalidatePath(`/research-projects/${input.projectUuid}/experiment-runs`);
    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to update task");
    return { success: false, error: "Failed to update task" };
  }
}

// Delete a task
export async function deleteExperimentRunAction(runUuid: string, projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    await deleteExperimentRun(runUuid);
    revalidatePath(`/research-projects/${projectUuid}/experiment-runs`);
    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to delete task");
    return { success: false, error: "Failed to delete task" };
  }
}

// Get developer agents and users (for assign modal)
export async function getDeveloperAgentsAction() {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { agents: [], users: [] };
  }

  try {
    const agents = await getAgentsByRole(auth.companyUuid, "developer", auth.actorUuid);
    const users = await getCompanyUsers(auth.companyUuid);
    return {
      agents,
      users,
      currentUserUuid: auth.actorUuid
    };
  } catch (error) {
    log.error({ err: error }, "Failed to get developer agents");
    return { agents: [], users: [] };
  }
}

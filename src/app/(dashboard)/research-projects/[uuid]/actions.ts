"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { getResearchProject, deleteResearchProject, updateResearchProject } from "@/services/research-project.service";
import { revalidatePath } from "next/cache";
import { getActiveSessionsForProject, type RunSessionInfo } from "@/services/session.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "research_project" });

export async function deleteResearchProjectAction(projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  const project = await getResearchProject(auth.companyUuid, projectUuid);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  try {
    await deleteResearchProject(projectUuid);
  } catch (error) {
    log.error({ err: error }, "Failed to delete project");
    return { success: false, error: "Failed to delete project" };
  }

  redirect("/research-projects");
}

export async function updateResearchProjectAction(
  projectUuid: string,
  data: { name?: string; description?: string | null }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  const project = await getResearchProject(auth.companyUuid, projectUuid);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  try {
    const updated = await updateResearchProject(projectUuid, data);
    revalidatePath(`/research-projects/${projectUuid}/dashboard`);
    return { success: true, data: updated };
  } catch (error) {
    log.error({ err: error }, "Failed to update project");
    return { success: false, error: "Failed to update project" };
  }
}

export async function getProjectActiveSessionsAction(projectUuid: string): Promise<{
  success: boolean;
  data?: RunSessionInfo[];
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const sessions = await getActiveSessionsForProject(auth.companyUuid, projectUuid);
    return { success: true, data: sessions };
  } catch (error) {
    log.error({ err: error }, "Failed to fetch active sessions");
    return { success: false, error: "Failed to fetch active sessions" };
  }
}

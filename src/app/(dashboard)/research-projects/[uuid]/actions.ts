"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { getProject, deleteProject, updateProject } from "@/services/project.service";
import { revalidatePath } from "next/cache";
import { getActiveSessionsForProject, type TaskSessionInfo } from "@/services/session.service";

export async function deleteProjectAction(projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  const project = await getProject(auth.companyUuid, projectUuid);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  try {
    await deleteProject(projectUuid);
  } catch (error) {
    console.error("Failed to delete project:", error);
    return { success: false, error: "Failed to delete project" };
  }

  redirect("/projects");
}

export async function updateProjectAction(
  projectUuid: string,
  data: { name?: string; description?: string | null }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  const project = await getProject(auth.companyUuid, projectUuid);
  if (!project) {
    return { success: false, error: "Project not found" };
  }

  try {
    const updated = await updateProject(projectUuid, data);
    revalidatePath(`/projects/${projectUuid}/dashboard`);
    return { success: true, data: updated };
  } catch (error) {
    console.error("Failed to update project:", error);
    return { success: false, error: "Failed to update project" };
  }
}

export async function getProjectActiveSessionsAction(projectUuid: string): Promise<{
  success: boolean;
  data?: TaskSessionInfo[];
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
    console.error("Failed to fetch active sessions:", error);
    return { success: false, error: "Failed to fetch active sessions" };
  }
}

"use server";

// Server Actions for Project mutations
// Uses Service layer for database operations

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import * as researchProjectService from "@/services/research-project.service";

// Error response type
export interface ActionError {
  success: false;
  error: string;
}

// Success response type
export interface ActionSuccess<T> {
  success: true;
  data: T;
}

// Create project action
export async function createResearchProject(
  name: string,
  description?: string
): Promise<ActionSuccess<{ uuid: string }> | ActionError> {
  const auth = await getServerAuthContext();

  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  const project = await researchProjectService.createResearchProject({
    companyUuid: auth.companyUuid,
    name,
    description,
  });

  // Revalidate projects list
  revalidatePath("/research-projects");

  return { success: true, data: { uuid: project.uuid } };
}

// Update project action
export async function updateResearchProject(
  uuid: string,
  data: { name?: string; description?: string }
): Promise<ActionSuccess<{ uuid: string }> | ActionError> {
  const auth = await getServerAuthContext();

  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify project belongs to company
  const exists = await researchProjectService.researchProjectExists(auth.companyUuid, uuid);
  if (!exists) {
    return { success: false, error: "Project not found" };
  }

  const project = await researchProjectService.updateResearchProject(uuid, data);

  // Revalidate
  revalidatePath("/research-projects");
  revalidatePath(`/research-projects/${uuid}/dashboard`);

  return { success: true, data: { uuid: project.uuid } };
}

// Delete project action
export async function deleteResearchProject(
  uuid: string
): Promise<ActionSuccess<null> | ActionError> {
  const auth = await getServerAuthContext();

  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify project belongs to company
  const exists = await researchProjectService.researchProjectExists(auth.companyUuid, uuid);
  if (!exists) {
    return { success: false, error: "Project not found" };
  }

  await researchProjectService.deleteResearchProject(uuid);

  // Revalidate projects list
  revalidatePath("/research-projects");

  return { success: true, data: null };
}

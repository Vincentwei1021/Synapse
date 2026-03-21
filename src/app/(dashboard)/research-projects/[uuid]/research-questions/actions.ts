"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import { createIdea, updateIdea, deleteIdea } from "@/services/idea.service";

interface Attachment {
  type: string;
  name: string;
  url: string;
  content?: string; // For text-based files like .md
}

interface CreateIdeaInput {
  projectUuid: string;
  title: string;
  content?: string;
  attachments?: Attachment[];
}

export async function createIdeaAction(input: CreateIdeaInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await createIdea({
      companyUuid: auth.companyUuid,
      projectUuid: input.projectUuid,
      title: input.title,
      content: input.content || null,
      attachments: input.attachments || null,
      createdByUuid: auth.actorUuid,
    });

    revalidatePath(`/projects/${input.projectUuid}/ideas`);
    return { success: true, ideaUuid: idea.uuid };
  } catch (error) {
    console.error("Failed to create idea:", error);
    return { success: false, error: "Failed to create idea" };
  }
}

interface UpdateIdeaInput {
  ideaUuid: string;
  projectUuid: string;
  title: string;
  content: string | null;
}

export async function updateIdeaAction(input: UpdateIdeaInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await updateIdea(input.ideaUuid, auth.companyUuid, {
      title: input.title,
      content: input.content,
    });

    revalidatePath(`/projects/${input.projectUuid}/ideas`);
    return { success: true, idea };
  } catch (error) {
    console.error("Failed to update idea:", error);
    return { success: false, error: "Failed to update idea" };
  }
}

export async function deleteIdeaAction(ideaUuid: string, projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await deleteIdea(ideaUuid);
    revalidatePath(`/projects/${projectUuid}/ideas`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete idea:", error);
    return { success: false, error: "Failed to delete idea" };
  }
}

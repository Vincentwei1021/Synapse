"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  createResearchQuestion,
  updateResearchQuestion,
  deleteResearchQuestion,
  reviewResearchQuestion,
} from "@/services/research-question.service";

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

export async function createResearchQuestionAction(input: CreateIdeaInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await createResearchQuestion({
      companyUuid: auth.companyUuid,
      researchProjectUuid: input.projectUuid,
      title: input.title,
      content: input.content || null,
      attachments: input.attachments || null,
      createdByUuid: auth.actorUuid,
      sourceType: "human",
      sourceLabel: "Created from dashboard",
    });

    revalidatePath(`/research-projects/${input.projectUuid}/research-questions`);
    return { success: true, questionUuid: idea.uuid };
  } catch (error) {
    console.error("Failed to create idea:", error);
    return { success: false, error: "Failed to create idea" };
  }
}

interface UpdateIdeaInput {
  questionUuid: string;
  projectUuid: string;
  title: string;
  content: string | null;
}

export async function updateResearchQuestionAction(input: UpdateIdeaInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await updateResearchQuestion(input.questionUuid, auth.companyUuid, {
      title: input.title,
      content: input.content,
    });

    revalidatePath(`/research-projects/${input.projectUuid}/research-questions`);
    return { success: true, idea };
  } catch (error) {
    console.error("Failed to update idea:", error);
    return { success: false, error: "Failed to update idea" };
  }
}

export async function deleteResearchQuestionAction(questionUuid: string, projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await deleteResearchQuestion(questionUuid);
    revalidatePath(`/research-projects/${projectUuid}/research-questions`);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete idea:", error);
    return { success: false, error: "Failed to delete idea" };
  }
}

export async function reviewResearchQuestionAction(input: {
  projectUuid: string;
  questionUuid: string;
  reviewStatus: "accepted" | "rejected";
  reviewNote?: string;
}) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  if (auth.type !== "user") {
    return { success: false, error: "Only users can review ideas" };
  }

  try {
    const idea = await reviewResearchQuestion(
      auth.companyUuid,
      input.questionUuid,
      input.reviewStatus,
      auth.actorUuid,
      input.reviewNote || null,
    );

    revalidatePath(`/research-projects/${input.projectUuid}/research-questions`);
    revalidatePath(`/research-projects/${input.projectUuid}/dashboard`);
    return { success: true, idea };
  } catch (error) {
    console.error("Failed to review idea:", error);
    return { success: false, error: "Failed to review idea" };
  }
}

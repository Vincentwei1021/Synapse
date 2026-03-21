"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { listComments, createComment, type CommentResponse } from "@/services/comment.service";
import { getIdeaByUuid } from "@/services/idea.service";
import { createActivity } from "@/services/activity.service";

export async function getIdeaCommentsAction(
  ideaUuid: string
): Promise<{ comments: CommentResponse[]; total: number }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { comments: [], total: 0 };
  }

  try {
    const result = await listComments({
      companyUuid: auth.companyUuid,
      targetType: "idea",
      targetUuid: ideaUuid,
      skip: 0,
      take: 100,
    });
    return result;
  } catch (error) {
    console.error("Failed to get idea comments:", error);
    return { comments: [], total: 0 };
  }
}

export async function createIdeaCommentAction(
  ideaUuid: string,
  content: string
): Promise<{ success: boolean; comment?: CommentResponse; error?: string }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  if (!content.trim()) {
    return { success: false, error: "Comment content is required" };
  }

  try {
    const idea = await getIdeaByUuid(auth.companyUuid, ideaUuid);
    if (!idea) {
      return { success: false, error: "Idea not found" };
    }

    const comment = await createComment({
      companyUuid: auth.companyUuid,
      targetType: "idea",
      targetUuid: ideaUuid,
      content: content.trim(),
      authorType: auth.type,
      authorUuid: auth.actorUuid,
    });

    // Record activity for notification pipeline
    await createActivity({
      companyUuid: auth.companyUuid,
      projectUuid: idea.projectUuid,
      targetType: "idea",
      targetUuid: ideaUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "comment_added",
    });

    // No revalidatePath here — comment is added to client state optimistically.
    // The SSE-triggered refresh will update the comment count in the ideas list.

    return { success: true, comment };
  } catch (error) {
    console.error("Failed to create idea comment:", error);
    return { success: false, error: "Failed to create comment" };
  }
}

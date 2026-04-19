"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { listComments, createComment, type CommentResponse } from "@/services/comment.service";
import { getExperimentRunByUuid } from "@/services/experiment-run.service";
import { createActivity } from "@/services/activity.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "experiment_run" });

export async function getExperimentRunCommentsAction(
  runUuid: string
): Promise<{ comments: CommentResponse[]; total: number }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { comments: [], total: 0 };
  }

  try {
    const result = await listComments({
      companyUuid: auth.companyUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      skip: 0,
      take: 100,
    });
    return result;
  } catch (error) {
    log.error({ err: error }, "Failed to get task comments");
    return { comments: [], total: 0 };
  }
}

export async function createExperimentRunCommentAction(
  runUuid: string,
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
    // Validate task exists
    const task = await getExperimentRunByUuid(auth.companyUuid, runUuid);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const comment = await createComment({
      companyUuid: auth.companyUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      content: content.trim(),
      authorType: auth.type,
      authorUuid: auth.actorUuid,
    });

    // Record activity for notification pipeline
    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: task.researchProjectUuid,
      targetType: "experiment_run",
      targetUuid: runUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "comment_added",
    });

    // No revalidatePath here — comment is added to client state optimistically.
    // The SSE-triggered refresh will update the comment count in the tasks list.

    return { success: true, comment };
  } catch (error) {
    log.error({ err: error }, "Failed to create task comment");
    return { success: false, error: "Failed to create comment" };
  }
}

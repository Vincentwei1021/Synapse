"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { listComments, createComment, type CommentResponse } from "@/services/comment.service";
import { getProposal } from "@/services/proposal.service";
import { createActivity } from "@/services/activity.service";

export async function getProposalCommentsAction(
  proposalUuid: string
): Promise<{ comments: CommentResponse[]; total: number }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { comments: [], total: 0 };
  }

  try {
    const result = await listComments({
      companyUuid: auth.companyUuid,
      targetType: "proposal",
      targetUuid: proposalUuid,
      skip: 0,
      take: 100,
    });
    return result;
  } catch (error) {
    console.error("Failed to get proposal comments:", error);
    return { comments: [], total: 0 };
  }
}

export async function createProposalCommentAction(
  proposalUuid: string,
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
    const proposal = await getProposal(auth.companyUuid, proposalUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const comment = await createComment({
      companyUuid: auth.companyUuid,
      targetType: "proposal",
      targetUuid: proposalUuid,
      content: content.trim(),
      authorType: auth.type,
      authorUuid: auth.actorUuid,
    });

    // Record activity for notification pipeline
    if (proposal.project?.uuid) {
      await createActivity({
        companyUuid: auth.companyUuid,
        projectUuid: proposal.project.uuid,
        targetType: "proposal",
        targetUuid: proposalUuid,
        actorType: auth.type,
        actorUuid: auth.actorUuid,
        action: "comment_added",
      });
    }

    // No revalidatePath here — comment is added to client state optimistically.
    // The SSE-triggered refresh will update the comment count in the proposals list.

    return { success: true, comment };
  } catch (error) {
    console.error("Failed to create proposal comment:", error);
    return { success: false, error: "Failed to create comment" };
  }
}

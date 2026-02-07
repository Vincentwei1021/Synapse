"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  createProposal,
  checkIdeasAvailability,
  checkIdeasAssignee,
  type DocumentDraftInput,
  type TaskDraftInput,
} from "@/services/proposal.service";
import { projectExists } from "@/services/project.service";

// 创建 Proposal
export async function createProposalAction(
  projectUuid: string,
  data: {
    title: string;
    description?: string;
    inputType: "idea" | "document";
    inputUuids: string[];
    documentDrafts?: DocumentDraftInput[];
    taskDrafts?: TaskDraftInput[];
  }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // 验证项目存在
    if (!(await projectExists(auth.companyUuid, projectUuid))) {
      return { success: false, error: "Project not found" };
    }

    // 验证必填字段
    if (!data.title || data.title.trim() === "") {
      return { success: false, error: "Title is required" };
    }
    if (!data.inputUuids || data.inputUuids.length === 0) {
      return { success: false, error: "Input sources are required" };
    }

    // 如果输入类型是 idea，需要额外验证
    if (data.inputType === "idea") {
      // 验证用户是否是这些 Ideas 的认领者
      const assigneeCheck = await checkIdeasAssignee(
        auth.companyUuid,
        data.inputUuids,
        auth.actorUuid,
        auth.type
      );
      if (!assigneeCheck.valid) {
        return {
          success: false,
          error: "You can only create proposals from ideas assigned to you",
        };
      }

      // 验证这些 Ideas 是否已被其他 Proposal 使用
      const availabilityCheck = await checkIdeasAvailability(
        auth.companyUuid,
        data.inputUuids
      );
      if (!availabilityCheck.available) {
        const usedIdea = availabilityCheck.usedIdeas[0];
        return {
          success: false,
          error: `One of the selected ideas is already used in proposal "${usedIdea.proposalTitle}"`,
        };
      }
    }

    const proposal = await createProposal({
      companyUuid: auth.companyUuid,
      projectUuid,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      inputType: data.inputType,
      inputUuids: data.inputUuids,
      documentDrafts: data.documentDrafts,
      taskDrafts: data.taskDrafts,
      createdByUuid: auth.actorUuid,
      createdByType: "user",
    });

    revalidatePath(`/projects/${projectUuid}/proposals`);

    return { success: true, proposal };
  } catch (error) {
    console.error("Failed to create proposal:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create proposal" };
  }
}

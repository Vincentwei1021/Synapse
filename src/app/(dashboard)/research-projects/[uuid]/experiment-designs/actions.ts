"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  createExperimentDesign,
  checkResearchQuestionsAssignee,
  type DocumentDraftInput,
  type RunDraftInput,
} from "@/services/experiment-design.service";
import { researchProjectExists } from "@/services/research-project.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "experiment_design" });

// Create Proposal
export async function createExperimentDesignAction(
  projectUuid: string,
  data: {
    title: string;
    description?: string;
    inputType: "research_question" | "document";
    inputUuids: string[];
    documentDrafts?: DocumentDraftInput[];
    taskDrafts?: RunDraftInput[];
  }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate project exists
    if (!(await researchProjectExists(auth.companyUuid, projectUuid))) {
      return { success: false, error: "Project not found" };
    }

    // Validate required fields
    if (!data.title || data.title.trim() === "") {
      return { success: false, error: "Title is required" };
    }
    if (!data.inputUuids || data.inputUuids.length === 0) {
      return { success: false, error: "Input sources are required" };
    }

    // If input type is idea, additional validation is needed
    if (data.inputType === "research_question") {
      // Validate if user is the assignee of these Ideas
      const assigneeCheck = await checkResearchQuestionsAssignee(
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

      // Note: Ideas can be reused across multiple Proposals (no availability check blocking)
    }

    const proposal = await createExperimentDesign({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      inputType: data.inputType,
      inputUuids: data.inputUuids,
      documentDrafts: data.documentDrafts,
      taskDrafts: data.taskDrafts,
      createdByUuid: auth.actorUuid,
      createdByType: "user",
    });

    revalidatePath(`/research-projects/${projectUuid}/experiment-designs`);

    return { success: true, proposal };
  } catch (error) {
    log.error({ err: error }, "Failed to create proposal");
    return { success: false, error: error instanceof Error ? error.message : "Failed to create proposal" };
  }
}

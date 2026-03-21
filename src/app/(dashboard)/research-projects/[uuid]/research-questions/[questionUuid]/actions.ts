"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import { assignResearchQuestion, releaseResearchQuestion, getResearchQuestionByUuid } from "@/services/research-question.service";
import { getAgentsByRole, getCompanyUsers } from "@/services/agent.service";
import { createActivity } from "@/services/activity.service";

export async function claimIdeaAction(questionUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate idea exists and belongs to this company
    const idea = await getResearchQuestionByUuid(auth.companyUuid, questionUuid);
    if (!idea) {
      return { success: false, error: "Idea not found" };
    }

    // Only completed/closed ideas cannot be reassigned
    if (idea.status === "completed" || idea.status === "closed") {
      return { success: false, error: "Idea is not available for assignment" };
    }

    await assignResearchQuestion({
      researchQuestionUuid: questionUuid,
      companyUuid: auth.companyUuid,
      assigneeType: auth.type,
      assigneeUuid: auth.actorUuid,
      assignedByUuid: auth.actorUuid,
    });

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: idea.researchProjectUuid,
      targetType: "research_question",
      targetUuid: questionUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "assigned",
      value: { assigneeType: auth.type, assigneeUuid: auth.actorUuid },
    });

    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions/${questionUuid}`);
    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions`);

    return { success: true };
  } catch (error) {
    console.error("Failed to claim idea:", error);
    return { success: false, error: "Failed to claim idea" };
  }
}

// Claim idea to a specific agent
export async function claimIdeaToAgentAction(questionUuid: string, agentUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await getResearchQuestionByUuid(auth.companyUuid, questionUuid);
    if (!idea) {
      return { success: false, error: "Idea not found" };
    }

    // Only completed/closed ideas cannot be reassigned
    if (idea.status === "completed" || idea.status === "closed") {
      return { success: false, error: "Idea is not available for assignment" };
    }

    await assignResearchQuestion({
      researchQuestionUuid: questionUuid,
      companyUuid: auth.companyUuid,
      assigneeType: "agent",
      assigneeUuid: agentUuid,
      assignedByUuid: auth.actorUuid,
    });

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: idea.researchProjectUuid,
      targetType: "research_question",
      targetUuid: questionUuid,
      actorType: "user",
      actorUuid: auth.actorUuid,
      action: "assigned",
      value: { assigneeType: "agent", assigneeUuid: agentUuid },
    });

    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions/${questionUuid}`);
    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions`);

    return { success: true };
  } catch (error) {
    console.error("Failed to claim idea to agent:", error);
    return { success: false, error: "Failed to claim idea" };
  }
}

// Claim idea to a specific user (all their PM agents can see it)
export async function claimIdeaToUserAction(questionUuid: string, userUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await getResearchQuestionByUuid(auth.companyUuid, questionUuid);
    if (!idea) {
      return { success: false, error: "Idea not found" };
    }

    // Only completed/closed ideas cannot be reassigned
    if (idea.status === "completed" || idea.status === "closed") {
      return { success: false, error: "Idea is not available for assignment" };
    }

    await assignResearchQuestion({
      researchQuestionUuid: questionUuid,
      companyUuid: auth.companyUuid,
      assigneeType: "user",
      assigneeUuid: userUuid,
      assignedByUuid: auth.actorUuid,
    });

    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions/${questionUuid}`);
    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions`);

    return { success: true };
  } catch (error) {
    console.error("Failed to claim idea to user:", error);
    return { success: false, error: "Failed to claim idea" };
  }
}

// Release idea (clear assignee, back to open)
export async function releaseIdeaAction(questionUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const idea = await getResearchQuestionByUuid(auth.companyUuid, questionUuid);
    if (!idea) {
      return { success: false, error: "Idea not found" };
    }

    // Only completed/closed ideas cannot be released
    if (idea.status === "completed" || idea.status === "closed") {
      return { success: false, error: "Idea cannot be released from current status" };
    }

    await releaseResearchQuestion(idea.uuid);

    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions/${questionUuid}`);
    revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions`);

    return { success: true };
  } catch (error) {
    console.error("Failed to release idea:", error);
    return { success: false, error: "Failed to release idea" };
  }
}

// Get PM agents for assignment (Ideas can only be assigned to PM agents)
export async function getPmAgentsAction() {
  const auth = await getServerAuthContext();
  if (!auth || auth.type !== "user") {
    return { agents: [], users: [] };
  }

  try {
    const [agents, users] = await Promise.all([
      getAgentsByRole(auth.companyUuid, "pm", auth.actorUuid),
      getCompanyUsers(auth.companyUuid),
    ]);
    return { agents, users };
  } catch (error) {
    console.error("Failed to get PM agents:", error);
    return { agents: [], users: [] };
  }
}

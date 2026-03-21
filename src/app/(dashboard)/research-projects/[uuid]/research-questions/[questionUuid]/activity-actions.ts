"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { listActivitiesWithActorNames, type ActivityResponse } from "@/services/activity.service";
import { getResearchQuestionByUuid } from "@/services/research-question.service";

export async function getQuestionActivitiesAction(
  questionUuid: string
): Promise<{ activities: ActivityResponse[]; total: number }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { activities: [], total: 0 };
  }

  try {
    const idea = await getResearchQuestionByUuid(auth.companyUuid, questionUuid);
    if (!idea) {
      return { activities: [], total: 0 };
    }

    return await listActivitiesWithActorNames({
      companyUuid: auth.companyUuid,
      researchProjectUuid: idea.researchProjectUuid,
      targetType: "research_question",
      targetUuid: questionUuid,
      skip: 0,
      take: 50,
    });
  } catch (error) {
    console.error("Failed to get idea activities:", error);
    return { activities: [], total: 0 };
  }
}

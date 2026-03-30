"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  getHypothesisFormulation,
  answerHypothesisFormulation,
  skipHypothesisFormulation,
} from "@/services/hypothesis-formulation.service";
import { getResearchQuestionProjectRef } from "@/services/research-question.service";
import type {
  HypothesisFormulationResponse,
  AnswerInput,
  HypothesisFormulationRoundResponse,
} from "@/types/hypothesis-formulation";

export async function getHypothesisFormulationAction(
  questionUuid: string
): Promise<{ success: boolean; data?: HypothesisFormulationResponse; error?: string }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await getHypothesisFormulation({
      companyUuid: auth.companyUuid,
      researchQuestionUuid: questionUuid,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Failed to get elaboration:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get elaboration",
    };
  }
}

export async function submitHypothesisFormulationAnswersAction(
  questionUuid: string,
  roundUuid: string,
  answers: AnswerInput[]
): Promise<{ success: boolean; data?: HypothesisFormulationRoundResponse; error?: string }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await answerHypothesisFormulation({
      companyUuid: auth.companyUuid,
      researchQuestionUuid: questionUuid,
      roundUuid,
      actorUuid: auth.actorUuid,
      actorType: auth.type,
      answers,
    });

    // Revalidate the ideas page so the panel refreshes
    const idea = await getResearchQuestionProjectRef(auth.companyUuid, questionUuid);
    if (idea) {
      revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions/${questionUuid}`);
      revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions`);
    }

    return { success: true, data };
  } catch (error) {
    console.error("Failed to submit elaboration answers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit answers",
    };
  }
}

export async function skipHypothesisFormulationAction(
  questionUuid: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await skipHypothesisFormulation({
      companyUuid: auth.companyUuid,
      researchQuestionUuid: questionUuid,
      actorUuid: auth.actorUuid,
      actorType: auth.type,
      reason,
    });

    // Revalidate the ideas page so the panel refreshes
    const idea = await getResearchQuestionProjectRef(auth.companyUuid, questionUuid);
    if (idea) {
      revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions/${questionUuid}`);
      revalidatePath(`/research-projects/${idea.researchProjectUuid}/research-questions`);
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to skip elaboration:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to skip elaboration",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  getElaboration,
  answerElaboration,
  skipElaboration,
} from "@/services/hypothesis-formulation.service";
import { prisma } from "@/lib/prisma";
import type {
  ElaborationResponse,
  AnswerInput,
  ElaborationRoundResponse,
} from "@/types/hypothesis-formulation";

export async function getHypothesisFormulationAction(
  questionUuid: string
): Promise<{ success: boolean; data?: ElaborationResponse; error?: string }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await getElaboration({
      companyUuid: auth.companyUuid,
      questionUuid,
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
): Promise<{ success: boolean; data?: ElaborationRoundResponse; error?: string }> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const data = await answerElaboration({
      companyUuid: auth.companyUuid,
      questionUuid,
      roundUuid,
      actorUuid: auth.actorUuid,
      actorType: auth.type,
      answers,
    });

    // Revalidate the ideas page so the panel refreshes
    const idea = await prisma.researchQuestion.findFirst({ where: { uuid: questionUuid, companyUuid: auth.companyUuid } });
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
    await skipElaboration({
      companyUuid: auth.companyUuid,
      questionUuid,
      actorUuid: auth.actorUuid,
      actorType: auth.type,
      reason,
    });

    // Revalidate the ideas page so the panel refreshes
    const idea = await prisma.researchQuestion.findFirst({ where: { uuid: questionUuid, companyUuid: auth.companyUuid } });
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

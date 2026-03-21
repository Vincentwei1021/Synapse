// src/services/hypothesis-formulation.service.ts
// HypothesisFormulation Service Layer — AI-DLC Stage 3 (Hypothesis Formulation)

import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { activityService } from "@/services";
import {
  type QuestionInput,
  type AnswerInput,
  type ValidationIssueInput,
  type HypothesisFormulationDepth,
  type HypothesisFormulationResponse,
  type HypothesisFormulationRoundResponse,
  type HypothesisFormulationQuestionResponse,
  type QuestionOption,
} from "@/types/hypothesis-formulation";

// ===== Start HypothesisFormulation =====

export async function startHypothesisFormulation({
  companyUuid,
  researchQuestionUuid,
  actorUuid,
  actorType,
  depth,
  questions,
  projectUuid,
}: {
  companyUuid: string;
  researchQuestionUuid: string;
  actorUuid: string;
  actorType: string;
  depth: HypothesisFormulationDepth;
  questions: QuestionInput[];
  projectUuid?: string;
}): Promise<HypothesisFormulationRoundResponse> {
  // Validate questions format
  validateQuestionsFormat(questions);

  // Load idea and verify ownership + status
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });
  if (!idea) throw new Error("ResearchQuestion not found");
  if (idea.assigneeUuid !== actorUuid) {
    throw new Error("Only the assigned agent can start hypothesis formulation");
  }
  if (idea.status !== "elaborating") {
    throw new Error(
      `Cannot start hypothesis formulation from status '${idea.status}'. Idea must be in 'elaborating' status (claim it first).`
    );
  }

  // Determine round number
  const existingRounds = await prisma.hypothesisFormulation.count({
    where: { researchQuestionUuid, companyUuid },
  });
  const roundNumber = existingRounds + 1;

  if (roundNumber > 5) {
    throw new Error("Maximum 5 hypothesis formulation rounds per ResearchQuestion");
  }

  // Create round + questions
  const created = await prisma.hypothesisFormulation.create({
    data: {
      companyUuid,
      researchQuestionUuid,
      roundNumber,
      status: "pending_answers",
      createdByType: actorType,
      createdByUuid: actorUuid,
      questions: {
        create: questions.map((q) => ({
          questionId: q.id,
          text: q.text,
          category: q.category,
          options: JSON.parse(JSON.stringify(q.options)),
          required: q.required ?? true,
        })),
      },
    },
  });

  // Reload with questions for response formatting
  const round = await prisma.hypothesisFormulation.findUniqueOrThrow({
    where: { uuid: created.uuid },
    include: { questions: true },
  });

  // Update idea status + elaboration fields
  await prisma.researchQuestion.update({
    where: { uuid: researchQuestionUuid },
    data: {
      status: "elaborating",
      elaborationDepth: depth,
      elaborationStatus: "pending_answers",
    },
  });

  // Log activity
  const resolvedProjectUuid = projectUuid || idea.researchProjectUuid;
  await activityService.createActivity({
    companyUuid,
    projectUuid: resolvedProjectUuid,
    targetType: "research_question",
    targetUuid: researchQuestionUuid,
    actorType,
    actorUuid,
    action: "elaboration_started",
    value: { depth, questionCount: questions.length, roundNumber },
  });

  eventBus.emitChange({ companyUuid, projectUuid: resolvedProjectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });

  return formatRoundResponse(round);
}

// ===== Answer HypothesisFormulation =====

export async function answerHypothesisFormulation({
  companyUuid,
  researchQuestionUuid,
  roundUuid,
  actorUuid,
  actorType,
  answers,
}: {
  companyUuid: string;
  researchQuestionUuid: string;
  roundUuid: string;
  actorUuid: string;
  actorType: string;
  answers: AnswerInput[];
}): Promise<HypothesisFormulationRoundResponse> {
  // Load round with questions
  const round = await prisma.hypothesisFormulation.findFirst({
    where: { uuid: roundUuid, researchQuestionUuid, companyUuid },
    include: { questions: true },
  });
  if (!round) throw new Error("HypothesisFormulation round not found");
  if (round.status !== "pending_answers") {
    throw new Error(`Round is '${round.status}', expected 'pending_answers'`);
  }

  // Apply answers to questions
  const now = new Date();
  for (const answer of answers) {
    const question = round.questions.find(
      (q) => q.questionId === answer.questionId
    );
    if (!question) {
      throw new Error(`Question '${answer.questionId}' not found in round`);
    }

    // Validate answer: either a valid option or custom text ("Other")
    if (answer.selectedOptionId !== null) {
      const options = question.options as unknown as QuestionOption[];
      const validOption = options.find(
        (o) => o.id === answer.selectedOptionId
      );
      if (!validOption) {
        throw new Error(
          `Invalid option '${answer.selectedOptionId}' for question '${answer.questionId}'`
        );
      }
    } else if (!answer.customText?.trim()) {
      // selectedOptionId is null → this is an "Other" answer, customText is required
      throw new Error(
        `Question '${answer.questionId}': custom text is required when no option is selected`
      );
    }

    await prisma.hypothesisFormulationQuestion.update({
      where: { uuid: question.uuid },
      data: {
        selectedOptionId: answer.selectedOptionId,
        customText: answer.customText,
        answeredAt: now,
        answeredByType: actorType,
        answeredByUuid: actorUuid,
      },
    });
  }

  // Check if all required questions are answered
  const updatedQuestions = await prisma.hypothesisFormulationQuestion.findMany({
    where: { roundUuid },
  });
  const allRequiredAnswered = updatedQuestions
    .filter((q) => q.required)
    .every((q) => q.answeredAt !== null);

  // Update round status if all answered
  if (allRequiredAnswered) {
    await prisma.hypothesisFormulation.update({
      where: { uuid: roundUuid },
      data: { status: "answered" },
    });
    await prisma.researchQuestion.update({
      where: { uuid: researchQuestionUuid },
      data: { elaborationStatus: "validating" },
    });
  }

  // Load idea for project UUID
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });

  // Log activity
  await activityService.createActivity({
    companyUuid,
    projectUuid: idea!.projectUuid,
    targetType: "research_question",
    targetUuid: researchQuestionUuid,
    actorType,
    actorUuid,
    action: "elaboration_answered",
    value: {
      roundNumber: round.roundNumber,
      answeredCount: answers.length,
    },
  });

  eventBus.emitChange({ companyUuid, projectUuid: idea!.projectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });

  // Return updated round
  const updatedRound = await prisma.hypothesisFormulation.findUnique({
    where: { uuid: roundUuid },
    include: { questions: true },
  });
  return formatRoundResponse(updatedRound!);
}

// ===== Validate HypothesisFormulation =====

export async function validateHypothesisFormulation({
  companyUuid,
  researchQuestionUuid,
  roundUuid,
  actorUuid,
  actorType,
  issues,
  followUpQuestions,
}: {
  companyUuid: string;
  researchQuestionUuid: string;
  roundUuid: string;
  actorUuid: string;
  actorType: string;
  issues: ValidationIssueInput[];
  followUpQuestions?: QuestionInput[];
}): Promise<{
  validatedRound: HypothesisFormulationRoundResponse;
  followUpRound?: HypothesisFormulationRoundResponse;
}> {
  // Load round
  const round = await prisma.hypothesisFormulation.findFirst({
    where: { uuid: roundUuid, researchQuestionUuid, companyUuid },
    include: { questions: true },
  });
  if (!round) throw new Error("HypothesisFormulation round not found");
  if (round.status !== "answered") {
    throw new Error(`Round is '${round.status}', expected 'answered'`);
  }

  // Verify actor is the idea assignee
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });
  if (!idea) throw new Error("ResearchQuestion not found");
  if (idea.assigneeUuid !== actorUuid) {
    throw new Error("Only the assigned agent can validate hypothesis formulation");
  }

  const noIssues = issues.length === 0;

  if (noIssues) {
    // All clear — mark round as validated, elaboration as resolved
    await prisma.hypothesisFormulation.update({
      where: { uuid: roundUuid },
      data: { status: "validated", validatedAt: new Date() },
    });
    await prisma.researchQuestion.update({
      where: { uuid: researchQuestionUuid },
      data: { elaborationStatus: "resolved" },
    });

    await activityService.createActivity({
      companyUuid,
      projectUuid: idea.researchProjectUuid,
      targetType: "research_question",
      targetUuid: researchQuestionUuid,
      actorType,
      actorUuid,
      action: "elaboration_resolved",
      value: {
        totalRounds: round.roundNumber,
        totalQuestions: round.questions.length,
      },
    });

    eventBus.emitChange({ companyUuid, projectUuid: idea.researchProjectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });

    const updated = await prisma.hypothesisFormulation.findUnique({
      where: { uuid: roundUuid },
      include: { questions: true },
    });
    return { validatedRound: formatRoundResponse(updated!) };
  }

  // Issues found — mark issues on questions, create follow-up round
  for (const issue of issues) {
    const question = round.questions.find(
      (q) => q.questionId === issue.questionId
    );
    if (question) {
      await prisma.hypothesisFormulationQuestion.update({
        where: { uuid: question.uuid },
        data: {
          issueType: issue.type,
          issueDescription: issue.description,
        },
      });
    }
  }

  await prisma.hypothesisFormulation.update({
    where: { uuid: roundUuid },
    data: { status: "needs_followup", validatedAt: new Date() },
  });

  let followUpRound: HypothesisFormulationRoundResponse | undefined;

  if (followUpQuestions && followUpQuestions.length > 0) {
    followUpRound = await startHypothesisFormulation({
      companyUuid,
      researchQuestionUuid,
      actorUuid,
      actorType,
      depth: (idea.elaborationDepth as HypothesisFormulationDepth) || "standard",
      questions: followUpQuestions,
      projectUuid: idea.researchProjectUuid,
    });
  } else {
    // Just mark as needs_followup, keep elaboration pending
    await prisma.researchQuestion.update({
      where: { uuid: researchQuestionUuid },
      data: { elaborationStatus: "pending_answers" },
    });
  }

  await activityService.createActivity({
    companyUuid,
    projectUuid: idea.researchProjectUuid,
    targetType: "research_question",
    targetUuid: researchQuestionUuid,
    actorType,
    actorUuid,
    action: "elaboration_followup",
    value: {
      roundNumber: round.roundNumber,
      issueCount: issues.length,
      followUpQuestionCount: followUpQuestions?.length || 0,
    },
  });

  eventBus.emitChange({ companyUuid, projectUuid: idea.researchProjectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });

  const updatedRound = await prisma.hypothesisFormulation.findUnique({
    where: { uuid: roundUuid },
    include: { questions: true },
  });
  return { validatedRound: formatRoundResponse(updatedRound!), followUpRound };
}

// ===== Skip HypothesisFormulation =====

export async function skipHypothesisFormulation({
  companyUuid,
  researchQuestionUuid,
  actorUuid,
  actorType,
  reason,
}: {
  companyUuid: string;
  researchQuestionUuid: string;
  actorUuid: string;
  actorType: string;
  reason: string;
}): Promise<void> {
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });
  if (!idea) throw new Error("ResearchQuestion not found");
  if (idea.assigneeUuid !== actorUuid) {
    throw new Error("Only the assigned agent can skip hypothesis formulation");
  }
  if (idea.status !== "elaborating") {
    throw new Error(
      `Cannot skip hypothesis formulation from status '${idea.status}'`
    );
  }

  await prisma.researchQuestion.update({
    where: { uuid: researchQuestionUuid },
    data: {
      elaborationDepth: "minimal",
      elaborationStatus: "resolved",
    },
  });

  await activityService.createActivity({
    companyUuid,
    projectUuid: idea.researchProjectUuid,
    targetType: "research_question",
    targetUuid: researchQuestionUuid,
    actorType,
    actorUuid,
    action: "elaboration_skipped",
    value: { reason },
  });

  eventBus.emitChange({ companyUuid, projectUuid: idea.researchProjectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });
}

// ===== Get HypothesisFormulation =====

export async function getHypothesisFormulation({
  companyUuid,
  researchQuestionUuid,
}: {
  companyUuid: string;
  researchQuestionUuid: string;
}): Promise<HypothesisFormulationResponse> {
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });
  if (!idea) throw new Error("ResearchQuestion not found");

  const rounds = await prisma.hypothesisFormulation.findMany({
    where: { researchQuestionUuid, companyUuid },
    include: { questions: true },
    orderBy: { roundNumber: "asc" },
  });

  const allQuestions = rounds.flatMap((r) => r.questions);
  const answeredQuestions = allQuestions.filter((q) => q.answeredAt !== null);
  const validatedRounds = rounds.filter((r) => r.status === "validated");
  const pendingRound = rounds.find((r) => r.status === "pending_answers");

  return {
    researchQuestionUuid,
    depth: idea.elaborationDepth,
    status: idea.elaborationStatus,
    rounds: rounds.map(formatRoundResponse),
    summary: {
      totalQuestions: allQuestions.length,
      answeredQuestions: answeredQuestions.length,
      validatedRounds: validatedRounds.length,
      pendingRound: pendingRound?.roundNumber || null,
    },
  };
}

// ===== Helpers =====

export function validateQuestionsFormat(questions: QuestionInput[]): void {
  if (questions.length === 0) {
    throw new Error("At least 1 question is required");
  }
  if (questions.length > 15) {
    throw new Error("Maximum 15 questions per round");
  }
  for (const q of questions) {
    if (!q.text || q.text.trim().length === 0) {
      throw new Error(`Question '${q.id}' has empty text`);
    }
    if (!q.options || q.options.length < 2 || q.options.length > 5) {
      throw new Error(
        `Question '${q.id}' must have 2-5 options, got ${q.options?.length || 0}`
      );
    }
    for (const opt of q.options) {
      if (!opt.id || !opt.label) {
        throw new Error(
          `Question '${q.id}' has an option with missing id or label`
        );
      }
    }
  }
}

export function formatRoundResponse(
  round: {
    uuid: string;
    roundNumber: number;
    status: string;
    createdByType: string;
    createdByUuid: string;
    validatedAt: Date | null;
    createdAt: Date;
    questions: Array<{
      uuid: string;
      questionId: string;
      text: string;
      category: string;
      options: unknown;
      required: boolean;
      selectedOptionId: string | null;
      customText: string | null;
      answeredAt: Date | null;
      answeredByType: string | null;
      answeredByUuid: string | null;
      issueType: string | null;
      issueDescription: string | null;
    }>;
  },
): HypothesisFormulationRoundResponse {
  return {
    uuid: round.uuid,
    roundNumber: round.roundNumber,
    status: round.status,
    createdBy: {
      type: round.createdByType,
      uuid: round.createdByUuid,
    },
    validatedAt: round.validatedAt?.toISOString() || null,
    createdAt: round.createdAt.toISOString(),
    questions: round.questions.map(formatQuestionResponse),
  };
}

export function formatQuestionResponse(
  q: {
    uuid: string;
    questionId: string;
    text: string;
    category: string;
    options: unknown;
    required: boolean;
    selectedOptionId: string | null;
    customText: string | null;
    answeredAt: Date | null;
    answeredByType: string | null;
    answeredByUuid: string | null;
    issueType: string | null;
    issueDescription: string | null;
  },
): HypothesisFormulationQuestionResponse {
  return {
    uuid: q.uuid,
    questionId: q.questionId,
    text: q.text,
    category: q.category,
    options: q.options as QuestionOption[],
    required: q.required,
    answer: q.answeredAt
      ? {
          selectedOptionId: q.selectedOptionId,
          customText: q.customText,
          answeredAt: q.answeredAt.toISOString(),
          answeredBy: {
            type: q.answeredByType!,
            uuid: q.answeredByUuid!,
          },
        }
      : null,
    issue: q.issueType
      ? {
          type: q.issueType,
          description: q.issueDescription || "",
        }
      : null,
  };
}

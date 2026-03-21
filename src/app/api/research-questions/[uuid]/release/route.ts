// src/app/api/research-questions/[uuid]/release/route.ts
// Research Questions API - Release Research Question (PRD §4.1 F5)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";
import { getResearchQuestionByUuid, releaseResearchQuestion } from "@/services/research-question.service";
import { NotClaimedError } from "@/lib/errors";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/research-questions/[uuid]/release - Release Research Question
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const researchQuestion = await getResearchQuestionByUuid(auth.companyUuid, uuid);
    if (!researchQuestion) {
      return errors.notFound("Research Question");
    }

    // Check permissions: users can release any Research Question, Agents can only release their own
    if (!isUser(auth)) {
      if (!isAssignee(auth, researchQuestion.assigneeType, researchQuestion.assigneeUuid)) {
        return errors.permissionDenied("Only assignee can release this research question");
      }
    }

    try {
      const updated = await releaseResearchQuestion(researchQuestion.uuid);
      return success(updated);
    } catch (e) {
      if (e instanceof NotClaimedError) {
        return errors.badRequest("Can only release research questions with assigned status");
      }
      throw e;
    }
  }
);

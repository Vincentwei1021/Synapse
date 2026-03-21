// src/app/api/research-questions/[uuid]/route.ts
// Research Questions API - Detail, Update, Delete (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";
import {
  getResearchQuestion,
  getResearchQuestionByUuid,
  updateResearchQuestion,
  deleteResearchQuestion,
  isValidResearchQuestionStatusTransition,
} from "@/services/research-question.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-questions/[uuid] - Research Question Detail
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const researchQuestion = await getResearchQuestion(auth.companyUuid, uuid);

    if (!researchQuestion) {
      return errors.notFound("Research Question");
    }

    return success(researchQuestion);
  }
);

// PATCH /api/research-questions/[uuid] - Update Research Question
export const PATCH = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    // Get original Research Question data for permission check
    const researchQuestion = await getResearchQuestionByUuid(auth.companyUuid, uuid);
    if (!researchQuestion) {
      return errors.notFound("Research Question");
    }

    const body = await parseBody<{
      title?: string;
      content?: string;
      status?: string;
    }>(request);

    // Build update data
    const updateData: {
      title?: string;
      content?: string | null;
      status?: string;
    } = {};

    // Title validation
    if (body.title !== undefined) {
      if (body.title.trim() === "") {
        return errors.validationError({ title: "Title cannot be empty" });
      }
      updateData.title = body.title.trim();
    }

    // Content update
    if (body.content !== undefined) {
      updateData.content = body.content.trim() || null;
    }

    // Status update
    if (body.status !== undefined) {
      // Check if state transition is valid
      if (!isValidResearchQuestionStatusTransition(researchQuestion.status, body.status)) {
        return errors.invalidStatusTransition(researchQuestion.status, body.status);
      }

      // Non-users can only update the status of Research Questions they have claimed
      if (!isUser(auth)) {
        if (!isAssignee(auth, researchQuestion.assigneeType, researchQuestion.assigneeUuid)) {
          return errors.permissionDenied("Only assignee can update status");
        }
      }

      updateData.status = body.status;
    }

    const updated = await updateResearchQuestion(researchQuestion.uuid, auth.companyUuid, updateData);
    return success(updated);
  }
);

// DELETE /api/research-questions/[uuid] - Delete Research Question
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can delete Research Questions
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete research questions");
    }

    const { uuid } = await context.params;

    const researchQuestion = await getResearchQuestionByUuid(auth.companyUuid, uuid);
    if (!researchQuestion) {
      return errors.notFound("Research Question");
    }

    await deleteResearchQuestion(researchQuestion.uuid);
    return success({ deleted: true });
  }
);

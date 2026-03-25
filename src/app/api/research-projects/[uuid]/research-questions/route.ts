// src/app/api/research-projects/[uuid]/research-questions/route.ts
// Research Questions API - List and Create (ARCHITECTURE.md §5.1, PRD §4.1 F5)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import { listResearchQuestions, createResearchQuestion } from "@/services/research-question.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/research-questions - List Research Questions
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid: researchProjectUuid } = await context.params;
    const { page, pageSize, skip, take } = parsePagination(request);

    // Parse filter parameters
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") || undefined;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const { researchQuestions, total } = await listResearchQuestions({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      skip,
      take,
      status: statusFilter,
    });

    return paginated(researchQuestions, page, pageSize, total);
  }
);

// POST /api/research-projects/[uuid]/research-questions - Create Research Question
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can create Research Questions
    if (!isUser(auth)) {
      return errors.forbidden("Only users can create research questions");
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const body = await parseBody<{
      title: string;
      content?: string;
      attachments?: unknown;
      parentQuestionUuid?: string | null;
    }>(request);

    // Validate required fields
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }

    const researchQuestion = await createResearchQuestion({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      title: body.title.trim(),
      content: body.content?.trim() || null,
      attachments: body.attachments,
      parentQuestionUuid: body.parentQuestionUuid || null,
      createdByUuid: auth.actorUuid,
    });

    return success(researchQuestion);
  }
);

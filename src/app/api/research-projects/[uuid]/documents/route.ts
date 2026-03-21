// src/app/api/research-projects/[uuid]/documents/route.ts
// Documents API - List and Create (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import { listDocuments, createDocument } from "@/services/document.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/documents - List Documents
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
    const typeFilter = url.searchParams.get("type") || undefined;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const { documents, total } = await listDocuments({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      skip,
      take,
      type: typeFilter,
    });

    return paginated(documents, page, pageSize, total);
  }
);

// POST /api/research-projects/[uuid]/documents - Create Document
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can create Documents directly
    if (!isUser(auth)) {
      return errors.forbidden("Only users can create documents directly");
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const body = await parseBody<{
      type: string;
      title: string;
      content?: string;
    }>(request);

    // Validate required fields
    if (!body.type || body.type.trim() === "") {
      return errors.validationError({ type: "Type is required" });
    }
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }

    const document = await createDocument({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      type: body.type.trim(),
      title: body.title.trim(),
      content: body.content?.trim() || null,
      createdByUuid: auth.actorUuid,
    });

    return success(document);
  }
);

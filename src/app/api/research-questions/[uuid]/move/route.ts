// src/app/api/research-questions/[uuid]/move/route.ts
// Move Research Question to a different research project

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { moveResearchQuestion } from "@/services/research-question.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// PATCH /api/research-questions/[uuid]/move
export const PATCH = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const body = await parseBody<{ targetResearchProjectUuid: string }>(request);

    if (!body.targetResearchProjectUuid) {
      return errors.badRequest("targetResearchProjectUuid is required");
    }

    const updated = await moveResearchQuestion(
      auth.companyUuid,
      uuid,
      body.targetResearchProjectUuid,
      auth.actorUuid,
      auth.type
    );

    return success(updated);
  }
);

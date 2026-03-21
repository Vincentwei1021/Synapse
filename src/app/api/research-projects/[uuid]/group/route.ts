// src/app/api/research-projects/[uuid]/group/route.ts
// Move research project to a different group

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { moveProjectToGroup } from "@/services/project-group.service";

// PATCH /api/research-projects/[uuid]/group
export const PATCH = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can move research projects between groups");

    const { uuid } = await context.params;
    const body = await parseBody<{ groupUuid: string | null }>(request);

    const result = await moveProjectToGroup(
      auth.companyUuid,
      uuid,
      body.groupUuid
    );

    if (!result) return errors.notFound("Research project or group");
    return success(result);
  }
);

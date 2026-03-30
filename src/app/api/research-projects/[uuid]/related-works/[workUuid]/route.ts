import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { deleteRelatedWork } from "@/services/related-work.service";

type RouteContext = { params: Promise<{ uuid: string; workUuid: string }> };

export const DELETE = withErrorHandler<{ uuid: string; workUuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth))
      return errors.forbidden("Only users can delete related works");

    const { workUuid } = await context.params;
    await deleteRelatedWork(auth.companyUuid, workUuid);
    return success({ deleted: true });
  },
);

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { refreshProjectSynthesis } from "@/services/project-synthesis.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const POST = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  if (!isUser(auth)) {
    return errors.forbidden("Only users can refresh project synthesis");
  }

  const { uuid } = await context.params;
  await refreshProjectSynthesis(auth.companyUuid, uuid, auth.actorUuid);

  return success({ refreshed: true });
});

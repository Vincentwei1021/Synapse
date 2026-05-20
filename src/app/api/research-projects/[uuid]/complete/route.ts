import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { completeResearchProject } from "@/services/research-project.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const POST = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  if (!isUser(auth)) {
    return errors.forbidden("Only users can complete research projects");
  }

  const { uuid: researchProjectUuid } = await context.params;
  const result = await completeResearchProject({
    companyUuid: auth.companyUuid,
    researchProjectUuid,
    actorUuid: auth.actorUuid,
  });

  if (!result) {
    return errors.notFound("Research Project");
  }

  return success(result);
});

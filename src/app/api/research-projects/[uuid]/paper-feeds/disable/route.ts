import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { disablePaperFeed } from "@/services/paper-feed.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can disable paper feeds");

    const { uuid: projectUuid } = await context.params;
    await disablePaperFeed({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
    });

    return success({ enabled: false });
  }
);

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { promoteFeedItemToRelatedWork } from "@/services/paper-feed.service";

type RouteContext = { params: Promise<{ uuid: string; itemUuid: string }> };

export const POST = withErrorHandler<{ uuid: string; itemUuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can promote paper feed items");

    const { itemUuid } = await context.params;

    try {
      const relatedWork = await promoteFeedItemToRelatedWork({
        companyUuid: auth.companyUuid,
        paperFeedItemUuid: itemUuid,
      });
      return success({ relatedWork });
    } catch {
      return errors.notFound("Paper feed item");
    }
  }
);

import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { enablePaperFeed } from "@/services/paper-feed.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const bodySchema = z.object({ agentUuid: z.string() });

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can enable paper feeds");

    const { uuid: projectUuid } = await context.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errors.validationError(parsed.error.flatten().fieldErrors);
    }

    try {
      await enablePaperFeed({
        companyUuid: auth.companyUuid,
        researchProjectUuid: projectUuid,
        agentUuid: parsed.data.agentUuid,
      });
    } catch (err) {
      return errors.validationError({
        agentUuid: err instanceof Error ? err.message : String(err),
      });
    }

    return success({ enabled: true });
  }
);

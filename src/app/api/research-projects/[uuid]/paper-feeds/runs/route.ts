import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { triggerPaperFeedRun } from "@/services/paper-feed.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const bodySchema = z.object({
  feedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can trigger paper feed runs");

    const { uuid: projectUuid } = await context.params;
    const rawBody = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return errors.validationError(parsed.error.flatten().fieldErrors);
    }

    const now = new Date();
    const yesterdayUtc = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1
      )
    );
    const feedDate =
      parsed.data.feedDate ?? yesterdayUtc.toISOString().slice(0, 10);

    try {
      const result = await triggerPaperFeedRun({
        companyUuid: auth.companyUuid,
        researchProjectUuid: projectUuid,
        triggeredBy: "manual",
        feedDate,
      });
      return success(result);
    } catch (err) {
      return errors.validationError({
        feedDate: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

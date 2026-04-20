import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getResearchQuestionByUuid, reviewResearchQuestion } from "@/services/research-question.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    if (!isUser(auth)) {
      return errors.forbidden("Only users can review research questions");
    }

    const { uuid } = await context.params;
    const question = await getResearchQuestionByUuid(auth.companyUuid, uuid);
    if (!question) {
      return errors.notFound("Research Question");
    }

    const body = await parseBody<{
      reviewStatus: "accepted" | "rejected";
      reviewNote?: string;
    }>(request);

    if (!body.reviewStatus || !["accepted", "rejected"].includes(body.reviewStatus)) {
      return errors.validationError({ reviewStatus: "Must be 'accepted' or 'rejected'" });
    }

    const updated = await reviewResearchQuestion(
      auth.companyUuid,
      uuid,
      body.reviewStatus,
      auth.actorUuid,
      body.reviewNote || null,
    );

    return success(updated);
  },
);

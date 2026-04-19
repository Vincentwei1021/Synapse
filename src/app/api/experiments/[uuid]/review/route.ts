import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { reviewExperiment } from "@/services/experiment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const reviewSchema = z.object({
  approved: z.boolean(),
  reviewNote: z.string().optional(),
  assignedAgentUuid: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can review experiments");
  }

  const { uuid } = await context.params;
  const body = await request.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const experiment = await reviewExperiment({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    approved: parsed.data.approved,
    reviewNote: parsed.data.reviewNote,
    ...(parsed.data.assignedAgentUuid !== undefined
      ? { assignedAgentUuid: parsed.data.assignedAgentUuid }
      : {}),
    actorUuid: auth.actorUuid,
  });

  return success({ experiment });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getAgentByUuid } from "@/services/agent.service";
import { requestExperimentPlan } from "@/services/experiment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const requestPlanSchema = z.object({
  agentUuid: z.string().min(1),
});

/**
 * POST /api/experiments/[uuid]/request-plan
 * Sends a notification to an agent asking it to fill in the experiment plan.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can request experiment plans");
  }

  const { uuid } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = requestPlanSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const agent = await getAgentByUuid(auth.companyUuid, parsed.data.agentUuid, auth.actorUuid);
  if (!agent) {
    return errors.notFound("Agent");
  }

  const experiment = await requestExperimentPlan({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    agentUuid: agent.uuid,
    requestedByUuid: auth.actorUuid,
  });

  return success({ requested: true, experiment });
}

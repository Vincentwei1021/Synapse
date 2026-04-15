import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getExperiment } from "@/services/experiment.service";
import * as notificationService from "@/services/notification.service";
import { prisma } from "@/lib/prisma";

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

  const experiment = await getExperiment(auth.companyUuid, uuid);
  if (!experiment) {
    return errors.notFound("Experiment");
  }

  const [project, agent] = await Promise.all([
    prisma.researchProject.findFirst({
      where: { uuid: experiment.researchProjectUuid, companyUuid: auth.companyUuid },
      select: { name: true },
    }),
    prisma.agent.findUnique({
      where: { uuid: parsed.data.agentUuid },
      select: { uuid: true, name: true, companyUuid: true },
    }),
  ]);

  if (!agent || agent.companyUuid !== auth.companyUuid) {
    return errors.notFound("Agent");
  }

  await notificationService.create({
    companyUuid: auth.companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    recipientType: "agent",
    recipientUuid: agent.uuid,
    entityType: "experiment",
    entityUuid: experiment.uuid,
    entityTitle: experiment.title,
    projectName: project?.name ?? "",
    action: "experiment_plan_requested",
    message: `Please flesh out the experiment plan for "${experiment.title}". Read the project context using synapse_get_project_full_context, then update the experiment with a detailed plan using synapse_update_experiment_plan. Include: methodology, expected outcomes, evaluation criteria, and any relevant research question links.`,
    actorType: "user",
    actorUuid: auth.actorUuid,
    actorName: "User",
  });

  return success({ requested: true });
}

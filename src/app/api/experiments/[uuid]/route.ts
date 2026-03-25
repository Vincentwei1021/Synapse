import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { assignExperiment, getExperiment, updateExperiment } from "@/services/experiment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "pending_review", "pending_start", "in_progress", "completed"]).optional(),
  priority: z.string().optional(),
  computeBudgetHours: z.coerce.number().nullable().optional(),
  outcome: z.string().nullable().optional(),
  results: z.unknown().optional(),
  assigneeType: z.string().optional(),
  assigneeUuid: z.string().optional(),
});

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid } = await context.params;
  const experiment = await getExperiment(auth.companyUuid, uuid);
  if (!experiment) {
    return errors.notFound("Experiment");
  }

  return success({ experiment });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can update experiments from the dashboard");
  }

  const { uuid } = await context.params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  if (parsed.data.assigneeType && parsed.data.assigneeUuid) {
    const experiment = await assignExperiment({
      companyUuid: auth.companyUuid,
      experimentUuid: uuid,
      assigneeType: parsed.data.assigneeType,
      assigneeUuid: parsed.data.assigneeUuid,
      assignedByUuid: auth.actorUuid,
    });
    return success({ experiment });
  }

  const experiment = await updateExperiment(
    auth.companyUuid,
    uuid,
    {
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
      computeBudgetHours: parsed.data.computeBudgetHours,
      outcome: parsed.data.outcome,
      results: parsed.data.results,
    },
    { actorType: "user", actorUuid: auth.actorUuid },
  );

  return success({ experiment });
}

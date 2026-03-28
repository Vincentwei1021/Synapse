import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { assignExperiment, getExperiment, updateExperiment } from "@/services/experiment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// PATCH allows safe metadata updates + the draft→pending_review transition.
// Dangerous transitions (start/complete) and their side effects MUST go through
// dedicated lifecycle routes:
//   POST /api/experiments/[uuid]/review   (pending_review -> pending_start or -> draft)
//   POST /api/experiments/[uuid]/start    (pending_start -> in_progress)
//   POST /api/experiments/[uuid]/complete (in_progress -> completed)
const patchSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["pending_review"]).optional(), // only draft→pending_review allowed
  priority: z.string().optional(),
  computeBudgetHours: z.coerce.number().nullable().optional(),
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

  const hasAssignment = parsed.data.assigneeType && parsed.data.assigneeUuid;
  const hasFieldUpdates =
    parsed.data.title !== undefined ||
    parsed.data.description !== undefined ||
    parsed.data.status !== undefined ||
    parsed.data.priority !== undefined ||
    parsed.data.computeBudgetHours !== undefined;

  // Reject requests with no actionable fields (e.g. only outcome/results which were stripped)
  if (!hasAssignment && !hasFieldUpdates) {
    return errors.badRequest("No updatable fields provided. Use dedicated routes for status transitions, outcomes, and results.");
  }

  // Handle assignment if assignee fields are provided
  if (hasAssignment) {
    await assignExperiment({
      companyUuid: auth.companyUuid,
      experimentUuid: uuid,
      assigneeType: parsed.data.assigneeType!,
      assigneeUuid: parsed.data.assigneeUuid!,
      assignedByUuid: auth.actorUuid,
    });
  }

  if (hasFieldUpdates) {
    const experiment = await updateExperiment(
      auth.companyUuid,
      uuid,
      {
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
        computeBudgetHours: parsed.data.computeBudgetHours,
      },
      { actorType: "user", actorUuid: auth.actorUuid },
    );
    return success({ experiment });
  }

  // If only assignment was done, re-fetch to return the updated experiment
  const experiment = await getExperiment(auth.companyUuid, uuid);
  return success({ experiment });
}

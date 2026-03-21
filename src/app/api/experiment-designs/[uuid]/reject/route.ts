// src/app/api/experiment-designs/[uuid]/reject/route.ts
// Experiment Designs API - Reject Experiment Design (ARCHITECTURE.md §7.4)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getExperimentDesignByUuid, rejectExperimentDesign } from "@/services/experiment-design.service";
import { createActivity } from "@/services/activity.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-designs/[uuid]/reject - Reject Experiment Design
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can reject
    if (!isUser(auth)) {
      return errors.forbidden("Only users can reject experiment designs");
    }

    const { uuid } = await context.params;

    const experimentDesign = await getExperimentDesignByUuid(auth.companyUuid, uuid);
    if (!experimentDesign) {
      return errors.notFound("Experiment Design");
    }

    // Only pending Experiment Designs can be rejected
    if (experimentDesign.status !== "pending") {
      return errors.badRequest("Can only reject pending experiment designs");
    }

    const body = await parseBody<{
      reviewNote?: string;
    }>(request);

    // A reason must be provided when rejecting
    if (!body.reviewNote || body.reviewNote.trim() === "") {
      return errors.validationError({
        reviewNote: "Review note is required when rejecting",
      });
    }

    const updated = await rejectExperimentDesign(
      experimentDesign.uuid,
      auth.actorUuid,
      body.reviewNote.trim()
    );

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: experimentDesign.researchProjectUuid,
      targetType: "experiment_design",
      targetUuid: experimentDesign.uuid,
      actorType: "user",
      actorUuid: auth.actorUuid,
      action: "rejected_to_draft",
      value: { reviewNote: body.reviewNote.trim() },
    });

    return success(updated);
  }
);

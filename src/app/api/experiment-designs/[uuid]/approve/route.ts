// src/app/api/experiment-designs/[uuid]/approve/route.ts
// Experiment Designs API - Approve (ARCHITECTURE.md §7.4)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getExperimentDesignByUuid, approveExperimentDesign } from "@/services/experiment-design.service";
import { createActivity } from "@/services/activity.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-designs/[uuid]/approve - Approve Experiment Design
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can approve
    if (!isUser(auth)) {
      return errors.forbidden("Only users can approve experiment designs");
    }

    const { uuid } = await context.params;

    const experimentDesign = await getExperimentDesignByUuid(auth.companyUuid, uuid);
    if (!experimentDesign) {
      return errors.notFound("Experiment Design");
    }

    // Only pending Experiment Designs can be approved
    if (experimentDesign.status !== "pending") {
      return errors.badRequest("Can only approve pending experiment designs");
    }

    const body = await parseBody<{
      reviewNote?: string;
    }>(request);

    const updated = await approveExperimentDesign(
      experimentDesign.uuid,
      auth.companyUuid,
      auth.actorUuid,
      body.reviewNote
    );

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: experimentDesign.researchProjectUuid,
      targetType: "experiment_design",
      targetUuid: experimentDesign.uuid,
      actorType: "user",
      actorUuid: auth.actorUuid,
      action: "approved",
      value: body.reviewNote ? { reviewNote: body.reviewNote } : undefined,
    });

    return success(updated);
  }
);

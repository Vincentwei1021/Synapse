// src/app/api/experiment-designs/[uuid]/close/route.ts
// Experiment Designs API - Close Experiment Design (terminal state)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getExperimentDesignByUuid, closeExperimentDesign } from "@/services/experiment-design.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-designs/[uuid]/close - Close Experiment Design
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can close
    if (!isUser(auth)) {
      return errors.forbidden("Only users can close experiment designs");
    }

    const { uuid } = await context.params;

    const experimentDesign = await getExperimentDesignByUuid(auth.companyUuid, uuid);
    if (!experimentDesign) {
      return errors.notFound("Experiment Design");
    }

    // Only pending Experiment Designs can be closed
    if (experimentDesign.status !== "pending") {
      return errors.badRequest("Can only close pending experiment designs");
    }

    const body = await parseBody<{
      reviewNote?: string;
    }>(request);

    // A reason must be provided when closing
    if (!body.reviewNote || body.reviewNote.trim() === "") {
      return errors.validationError({
        reviewNote: "Review note is required when closing",
      });
    }

    const updated = await closeExperimentDesign(
      experimentDesign.uuid,
      auth.actorUuid,
      body.reviewNote.trim()
    );

    return success(updated);
  }
);

// src/app/api/experiment-designs/[uuid]/route.ts
// Experiment Designs API - Detail (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getExperimentDesign } from "@/services/experiment-design.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/experiment-designs/[uuid] - Experiment Design Detail
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const experimentDesign = await getExperimentDesign(auth.companyUuid, uuid);

    if (!experimentDesign) {
      return errors.notFound("Experiment Design");
    }

    return success(experimentDesign);
  }
);

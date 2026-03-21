// src/app/api/research-projects/[uuid]/experiment-designs/[designUuid]/validate/route.ts
// Experiment Design Validation API - Run validation checks on a design

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { validateExperimentDesign } from "@/services/experiment-design.service";

type RouteContext = { params: Promise<{ uuid: string; designUuid: string }> };

// GET /api/research-projects/[uuid]/experiment-designs/[designUuid]/validate
export const GET = withErrorHandler<{ uuid: string; designUuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { designUuid } = await context.params;
    const result = await validateExperimentDesign(auth.companyUuid, designUuid);
    return success(result);
  }
);

// src/app/api/research-projects/[uuid]/experiment-designs/summary/route.ts
// Experiment Design Summary API - Lightweight design list with run counts (for filter dropdown)

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import { getProjectExperimentDesigns } from "@/services/experiment-design.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/experiment-designs/summary - Get lightweight design list
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Validate research project exists and belongs to company
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const data = await getProjectExperimentDesigns(auth.companyUuid, researchProjectUuid);

    return success(data);
  }
);

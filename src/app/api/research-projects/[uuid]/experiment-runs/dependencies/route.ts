// src/app/api/research-projects/[uuid]/experiment-runs/dependencies/route.ts
// Research Project Experiment Run Dependencies API - DAG Visualization Data

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import { getProjectRunDependencies } from "@/services/experiment-run.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/experiment-runs/dependencies - Get project run dependencies (DAG)
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const dag = await getProjectRunDependencies(auth.companyUuid, researchProjectUuid);
    return success(dag);
  }
);

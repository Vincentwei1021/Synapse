// src/app/api/experiment-runs/[uuid]/dependencies/[dependsOnRunUuid]/route.ts
// Experiment Run Dependency DELETE API - Remove Dependency

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getExperimentRunByUuid, removeRunDependency } from "@/services/experiment-run.service";

type RouteContext = { params: Promise<{ uuid: string; dependsOnRunUuid: string }> };

// DELETE /api/experiment-runs/[uuid]/dependencies/[dependsOnRunUuid] - Remove Dependency
export const DELETE = withErrorHandler<{ uuid: string; dependsOnRunUuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid, dependsOnRunUuid } = await context.params;

    // Validate experiment run exists
    const experimentRun = await getExperimentRunByUuid(auth.companyUuid, uuid);
    if (!experimentRun) {
      return errors.notFound("Experiment Run");
    }

    await removeRunDependency(auth.companyUuid, uuid, dependsOnRunUuid);
    return success({ deleted: true });
  }
);

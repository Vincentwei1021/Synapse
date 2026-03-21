// src/app/api/experiment-runs/[uuid]/dependencies/route.ts
// Experiment Run Dependencies API - Add Dependency, Query Dependencies

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import {
  getExperimentRunByUuid,
  addRunDependency,
  getRunDependencies,
} from "@/services/experiment-run.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-runs/[uuid]/dependencies - Add Dependency
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    // Validate experiment run exists
    const experimentRun = await getExperimentRunByUuid(auth.companyUuid, uuid);
    if (!experimentRun) {
      return errors.notFound("Experiment Run");
    }

    const body = await parseBody<{ dependsOnRunUuid: string }>(request);
    if (!body.dependsOnRunUuid) {
      return errors.validationError({ dependsOnRunUuid: "dependsOnRunUuid is required" });
    }

    try {
      const dep = await addRunDependency(auth.companyUuid, uuid, body.dependsOnRunUuid);
      return success(dep);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("cycle")) {
        return errors.conflict(message);
      }
      if (message.includes("not found") || message.includes("same project")) {
        return errors.badRequest(message);
      }
      throw error;
    }
  }
);

// GET /api/experiment-runs/[uuid]/dependencies - Query Experiment Run Dependencies
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const experimentRun = await getExperimentRunByUuid(auth.companyUuid, uuid);
    if (!experimentRun) {
      return errors.notFound("Experiment Run");
    }

    const deps = await getRunDependencies(auth.companyUuid, uuid);
    return success(deps);
  }
);

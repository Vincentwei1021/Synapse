// src/app/api/experiment-runs/[uuid]/release/route.ts
// Experiment Runs API - Release Experiment Run (PRD §3.3.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { canReleaseEntity } from "@/services/assignment-policy.service";
import { getExperimentRunByUuid, releaseExperimentRun } from "@/services/experiment-run.service";
import { NotClaimedError } from "@/lib/errors";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-runs/[uuid]/release - Release Experiment Run
export const POST = withErrorHandler<{ uuid: string }>(
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

    if (!canReleaseEntity(auth, experimentRun.assigneeType, experimentRun.assigneeUuid)) {
      return errors.permissionDenied("Only assignee can release this experiment run");
    }

    try {
      const updated = await releaseExperimentRun(experimentRun.uuid);
      return success(updated);
    } catch (e) {
      if (e instanceof NotClaimedError) {
        return errors.badRequest("Can only release experiment runs with assigned status");
      }
      throw e;
    }
  }
);

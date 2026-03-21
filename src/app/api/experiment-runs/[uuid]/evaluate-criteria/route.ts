// src/app/api/experiment-runs/[uuid]/evaluate-criteria/route.ts
// Criteria Evaluation API - Evaluate Go/No-Go criteria
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { evaluateCriteria } from "@/services/criteria-evaluation.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-runs/[uuid]/evaluate-criteria - Evaluate Go/No-Go criteria
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const body = await parseBody<{
      metrics: Record<string, number>;
    }>(request);

    if (!body.metrics || typeof body.metrics !== "object") {
      return errors.badRequest("metrics must be a valid object");
    }

    const result = await evaluateCriteria(
      auth.companyUuid,
      uuid,
      body.metrics
    );

    return success(result);
  }
);

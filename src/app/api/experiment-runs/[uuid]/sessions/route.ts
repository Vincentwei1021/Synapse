// src/app/api/experiment-runs/[uuid]/sessions/route.ts
// Experiment Run Sessions API - get active sessions for an experiment run
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getSessionsForRun } from "@/services/session.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/experiment-runs/[uuid]/sessions - Get active sessions for an experiment run
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    if (!isUser(auth)) {
      return errors.forbidden("Only users can view experiment run sessions");
    }

    const { uuid } = await context.params;
    const sessions = await getSessionsForRun(auth.companyUuid, uuid);

    return success(sessions);
  }
);

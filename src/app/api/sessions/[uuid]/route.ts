// src/app/api/sessions/[uuid]/route.ts
// Sessions API - get details, close session
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getAgentByUuid } from "@/services/agent.service";
import { getSession, closeSession, reopenSession } from "@/services/session.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/sessions/[uuid] - Get session details
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    if (!isUser(auth)) {
      return errors.forbidden("Only users can view session details");
    }

    const { uuid } = await context.params;
    const session = await getSession(auth.companyUuid, uuid);

    if (!session) {
      return errors.notFound("Session");
    }

    // Verify the session's agent belongs to the current user
    const agent = await getAgentByUuid(auth.companyUuid, session.agentUuid, auth.actorUuid);
    if (!agent) {
      return errors.notFound("Session");
    }

    return success(session);
  }
);

// PATCH /api/sessions/[uuid] - Close session
export const PATCH = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    if (!isUser(auth)) {
      return errors.forbidden("Only users can update sessions");
    }

    const { uuid } = await context.params;

    // Verify session exists and its agent belongs to the current user
    const session = await getSession(auth.companyUuid, uuid);
    if (!session) {
      return errors.notFound("Session");
    }
    const agent = await getAgentByUuid(auth.companyUuid, session.agentUuid, auth.actorUuid);
    if (!agent) {
      return errors.notFound("Session");
    }

    const body = await parseBody<{ status: string }>(request);

    if (body.status === "closed") {
      const updated = await closeSession(auth.companyUuid, uuid);
      return success(updated);
    }

    if (body.status === "active") {
      const updated = await reopenSession(auth.companyUuid, uuid);
      return success(updated);
    }

    return errors.badRequest("Only status 'closed' or 'active' is supported");
  }
);

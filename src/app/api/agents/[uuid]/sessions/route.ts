// src/app/api/agents/[uuid]/sessions/route.ts
// Agent Sessions API - list sessions for an agent
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getAgentByUuid } from "@/services/agent.service";
import { listAgentSessions } from "@/services/session.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/agents/[uuid]/sessions - List sessions for an agent
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    if (!isUser(auth)) {
      return errors.forbidden("Only users can view agent sessions");
    }

    const { uuid } = await context.params;

    // Verify agent belongs to company
    const agent = await getAgentByUuid(auth.companyUuid, uuid, auth.actorUuid);

    if (!agent) {
      return errors.notFound("Agent");
    }

    const status = new URL(request.url).searchParams.get("status") || undefined;
    const sessions = await listAgentSessions(auth.companyUuid, uuid, status);

    return success(sessions);
  }
);

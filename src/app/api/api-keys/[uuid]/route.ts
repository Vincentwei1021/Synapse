// src/app/api/api-keys/[uuid]/route.ts
// API Keys API - Revoke (ARCHITECTURE.md §5.1, §9.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getApiKey, revokeApiKey } from "@/services/agent.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// DELETE /api/api-keys/[uuid] - Revoke API Key
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can revoke API Keys
    if (!isUser(auth)) {
      return errors.forbidden("Only users can revoke API keys");
    }

    const { uuid } = await context.params;

    const apiKey = await getApiKey(auth.companyUuid, uuid, auth.actorUuid);

    if (!apiKey) {
      return errors.notFound("API Key");
    }

    if (apiKey.revokedAt) {
      return errors.badRequest("API Key is already revoked");
    }

    await revokeApiKey(apiKey.uuid);

    return success({ revoked: true });
  }
);

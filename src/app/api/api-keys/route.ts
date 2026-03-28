// src/app/api/api-keys/route.ts
// API Keys API - List and Create (ARCHITECTURE.md §5.1, §9.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createApiKey, getAgentByUuid, listApiKeys } from "@/services/agent.service";

// GET /api/api-keys - List API Keys
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can view the API Key list
  if (!isUser(auth)) {
    return errors.forbidden("Only users can view API keys");
  }

  const { page, pageSize, skip, take } = parsePagination(request);

  const { apiKeys, total } = await listApiKeys(auth.companyUuid, skip, take, auth.actorUuid);

  const data = apiKeys.map((k) => ({
    uuid: k.uuid,
    prefix: k.keyPrefix,
    name: k.name,
    agent: {
      uuid: k.agent.uuid,
      name: k.agent.name,
      roles: k.agent.roles,
    },
    lastUsed: k.lastUsed?.toISOString() || null,
    expiresAt: k.expiresAt?.toISOString() || null,
    createdAt: k.createdAt.toISOString(),
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/api-keys - Create API Key
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can create API Keys
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create API keys");
  }

  const body = await parseBody<{
    agentUuid: string;
    name?: string;
    expiresAt?: string;
  }>(request);

  // Validate required fields
  if (!body.agentUuid) {
    return errors.validationError({ agentUuid: "Agent UUID is required" });
  }

  // Validate Agent exists (query by UUID)
  const agent = await getAgentByUuid(auth.companyUuid, body.agentUuid, auth.actorUuid);

  if (!agent) {
    return errors.notFound("Agent");
  }

  // Parse expiration time
  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      return errors.validationError({ expiresAt: "Invalid expiration date" });
    }
  }

  const apiKey = await createApiKey({
    companyUuid: auth.companyUuid,
    agentUuid: agent.uuid,
    name: body.name?.trim() || null,
    expiresAt,
  });

  // Only return the plaintext key at creation time (cannot be recovered later)
  return success({
    uuid: apiKey.uuid,
    key: apiKey.key, // This is the only time the full key is visible
    prefix: apiKey.keyPrefix,
    name: apiKey.name,
    agent: {
      uuid: agent.uuid,
      name: agent.name,
      roles: agent.roles,
    },
    lastUsed: null,
    expiresAt: apiKey.expiresAt?.toISOString() || null,
    createdAt: apiKey.createdAt.toISOString(),
  });
});

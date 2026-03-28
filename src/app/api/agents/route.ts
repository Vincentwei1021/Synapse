// src/app/api/agents/route.ts
// Agents API - List and Create (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createAgent, listAgents } from "@/services/agent.service";

// GET /api/agents - List Agents
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can view the Agent list
  if (!isUser(auth)) {
    return errors.forbidden("Only users can view agents");
  }

  const { page, pageSize, skip, take } = parsePagination(request);

  const { agents, total } = await listAgents({
    companyUuid: auth.companyUuid,
    skip,
    take,
    ownerUuid: auth.actorUuid,
  });

  const data = agents.map((a) => ({
    uuid: a.uuid,
    name: a.name,
    roles: a.roles,
    persona: a.persona,
    ownerUuid: a.ownerUuid,
    lastActiveAt: a.lastActiveAt?.toISOString() || null,
    apiKeyCount: a._count.apiKeys,
    createdAt: a.createdAt.toISOString(),
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/agents - Create Agent
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can create Agents
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create agents");
  }

  const body = await parseBody<{
    name: string;
    roles?: string[];
    persona?: string | null;
    systemPrompt?: string | null;
  }>(request);

  // Validate required fields
  if (!body.name || body.name.trim() === "") {
    return errors.validationError({ name: "Name is required" });
  }

  // Validate roles
  const validRoles = ["research_lead_agent", "researcher_agent", "pi_agent", "research_lead", "researcher", "pi"];
  const roles = body.roles || ["researcher_agent"];
  for (const role of roles) {
    if (!validRoles.includes(role)) {
      return errors.validationError({
        roles: "Roles must be research_lead_agent, researcher_agent, or pi_agent",
      });
    }
  }

  const agent = await createAgent({
    companyUuid: auth.companyUuid,
    name: body.name.trim(),
    roles,
    persona: body.persona?.trim() || null,
    systemPrompt: body.systemPrompt?.trim() || null,
    ownerUuid: auth.actorUuid,
  });

  return success({
    uuid: agent.uuid,
    name: agent.name,
    roles: agent.roles,
    persona: agent.persona,
    systemPrompt: agent.systemPrompt,
    ownerUuid: agent.ownerUuid,
    lastActiveAt: null,
    apiKeyCount: 0,
    createdAt: agent.createdAt.toISOString(),
  });
});

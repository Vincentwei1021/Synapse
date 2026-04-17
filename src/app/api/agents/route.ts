// src/app/api/agents/route.ts
// Agents API - List and Create (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createAgent, listAgents } from "@/services/agent.service";
import { VALID_AGENT_TYPES } from "@/lib/agent-transport";
import { isValidAgentColorKey, DEFAULT_AGENT_COLOR_KEY } from "@/lib/agent-colors";

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

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || undefined;
  const transport = url.searchParams.get("transport") || undefined;

  const { agents, total } = await listAgents({
    companyUuid: auth.companyUuid,
    skip,
    take,
    ownerUuid: auth.actorUuid,
    type,
    transport,
  });

  const data = agents.map((a) => ({
    uuid: a.uuid,
    name: a.name,
    roles: a.roles,
    type: a.type,
    persona: a.persona,
    color: a.color,
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
    type?: string;
    persona?: string | null;
    systemPrompt?: string | null;
    color?: string | null;
  }>(request);

  // Validate required fields
  if (!body.name || body.name.trim() === "") {
    return errors.validationError({ name: "Name is required" });
  }

  // Validate roles
  const validRoles = ["pre_research", "research", "experiment", "report", "admin"];
  const roles = body.roles || ["research"];
  for (const role of roles) {
    if (!validRoles.includes(role)) {
      return errors.validationError({
        roles: "Roles must be pre_research, research, experiment, report, or admin",
      });
    }
  }

  const type = body.type || "openclaw";
  if (!VALID_AGENT_TYPES.includes(type)) {
    return errors.validationError({
      type: `Type must be one of: ${VALID_AGENT_TYPES.join(", ")}`,
    });
  }

  let color: string | null = DEFAULT_AGENT_COLOR_KEY;
  if (body.color === null) {
    color = null;
  } else if (body.color !== undefined) {
    if (!isValidAgentColorKey(body.color)) {
      return errors.validationError({ color: "Invalid agent color" });
    }
    color = body.color;
  }

  const agent = await createAgent({
    companyUuid: auth.companyUuid,
    name: body.name.trim(),
    roles,
    type,
    persona: body.persona?.trim() || null,
    systemPrompt: body.systemPrompt?.trim() || null,
    ownerUuid: auth.actorUuid,
    color,
  });

  return success({
    uuid: agent.uuid,
    name: agent.name,
    roles: agent.roles,
    type: agent.type,
    persona: agent.persona,
    systemPrompt: agent.systemPrompt,
    color: agent.color,
    ownerUuid: agent.ownerUuid,
    lastActiveAt: null,
    apiKeyCount: 0,
    createdAt: agent.createdAt.toISOString(),
  });
});

// src/app/api/agents/route.ts
// Agents API - List and Create (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

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

  const where = {
    companyUuid: auth.companyUuid,
  };

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        uuid: true,
        name: true,
        roles: true,
        persona: true,
        ownerUuid: true,
        lastActiveAt: true,
        createdAt: true,
        _count: {
          select: { apiKeys: true },
        },
      },
    }),
    prisma.agent.count({ where }),
  ]);

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

  const agent = await prisma.agent.create({
    data: {
      companyUuid: auth.companyUuid,
      name: body.name.trim(),
      roles,
      persona: body.persona?.trim() || null,
      systemPrompt: body.systemPrompt?.trim() || null,
      ownerUuid: auth.actorUuid,
    },
    select: {
      uuid: true,
      name: true,
      roles: true,
      persona: true,
      systemPrompt: true,
      ownerUuid: true,
      createdAt: true,
    },
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

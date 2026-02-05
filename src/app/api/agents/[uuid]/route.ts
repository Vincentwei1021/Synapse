// src/app/api/agents/[uuid]/route.ts
// Agents API - 详情、更新、删除 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/agents/[uuid] - Agent 详情
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以查看 Agent 详情
    if (!isUser(auth)) {
      return errors.forbidden("Only users can view agent details");
    }

    const { uuid } = await context.params;

    const agent = await prisma.agent.findFirst({
      where: { uuid, companyId: auth.companyId },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: {
            uuid: true,
            keyPrefix: true,
            name: true,
            lastUsed: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agent) {
      return errors.notFound("Agent");
    }

    return success({
      uuid: agent.uuid,
      name: agent.name,
      roles: agent.roles,
      persona: agent.persona,
      systemPrompt: agent.systemPrompt,
      ownerId: agent.ownerId,
      lastActiveAt: agent.lastActiveAt?.toISOString() || null,
      apiKeys: agent.apiKeys.map((k) => ({
        uuid: k.uuid,
        prefix: k.keyPrefix,
        name: k.name,
        lastUsed: k.lastUsed?.toISOString() || null,
        expiresAt: k.expiresAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      })),
      createdAt: agent.createdAt.toISOString(),
    });
  }
);

// PATCH /api/agents/[uuid] - 更新 Agent
export const PATCH = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以更新 Agent
    if (!isUser(auth)) {
      return errors.forbidden("Only users can update agents");
    }

    const { uuid } = await context.params;

    const agent = await prisma.agent.findFirst({
      where: { uuid, companyId: auth.companyId },
    });

    if (!agent) {
      return errors.notFound("Agent");
    }

    const body = await parseBody<{
      name?: string;
      roles?: string[];
      persona?: string | null;
      systemPrompt?: string | null;
    }>(request);

    const updateData: {
      name?: string;
      roles?: string[];
      persona?: string | null;
      systemPrompt?: string | null;
    } = {};

    if (body.name !== undefined) {
      if (body.name.trim() === "") {
        return errors.validationError({ name: "Name cannot be empty" });
      }
      updateData.name = body.name.trim();
    }

    if (body.roles !== undefined) {
      const validRoles = ["pm", "developer"];
      for (const role of body.roles) {
        if (!validRoles.includes(role)) {
          return errors.validationError({
            roles: "Roles must be pm or developer",
          });
        }
      }
      updateData.roles = body.roles;
    }

    if (body.persona !== undefined) {
      updateData.persona = body.persona?.trim() || null;
    }

    if (body.systemPrompt !== undefined) {
      updateData.systemPrompt = body.systemPrompt?.trim() || null;
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
      select: {
        uuid: true,
        name: true,
        roles: true,
        persona: true,
        systemPrompt: true,
        ownerId: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    return success({
      uuid: updated.uuid,
      name: updated.name,
      roles: updated.roles,
      persona: updated.persona,
      systemPrompt: updated.systemPrompt,
      ownerId: updated.ownerId,
      lastActiveAt: updated.lastActiveAt?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
    });
  }
);

// DELETE /api/agents/[uuid] - 删除 Agent
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以删除 Agent
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete agents");
    }

    const { uuid } = await context.params;

    const agent = await prisma.agent.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!agent) {
      return errors.notFound("Agent");
    }

    // 删除 Agent（API Keys 会被级联删除）
    await prisma.agent.delete({
      where: { id: agent.id },
    });

    return success({ deleted: true });
  }
);

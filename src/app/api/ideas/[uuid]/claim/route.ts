// src/app/api/ideas/[uuid]/claim/route.ts
// Ideas API - 认领 Idea (PRD §4.1 F5 认领规则)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAgent, isPmAgent } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/ideas/[uuid]/claim - 认领 Idea
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const idea = await prisma.idea.findFirst({
      where: { uuid, companyId: auth.companyId },
    });

    if (!idea) {
      return errors.notFound("Idea");
    }

    // 只有 open 状态的 Idea 可被认领
    if (idea.status !== "open") {
      return errors.alreadyClaimed();
    }

    let assigneeType: string;
    let assigneeId: number;
    let assignedBy: number | null = null;

    if (isAgent(auth)) {
      // Agent 认领 - 必须是 PM Agent
      if (!isPmAgent(auth)) {
        return errors.forbidden("Only PM agents can claim ideas");
      }
      assigneeType = "agent";
      assigneeId = auth.actorId;
    } else if (isUser(auth)) {
      // 用户认领 - 可以选择分配给自己或特定 Agent
      const body = await parseBody<{
        assignToSelf?: boolean;
        agentId?: number;
      }>(request);

      if (body.agentId) {
        // 分配给特定 Agent
        const agent = await prisma.agent.findFirst({
          where: {
            id: body.agentId,
            companyId: auth.companyId,
            roles: { has: "pm" }, // 只能分配给 PM Agent
          },
        });

        if (!agent) {
          return errors.notFound("Agent");
        }

        assigneeType = "agent";
        assigneeId = agent.id;
        assignedBy = auth.actorId;
      } else {
        // 分配给自己（所有自己的 PM Agent 都能处理）
        assigneeType = "user";
        assigneeId = auth.actorId;
        assignedBy = auth.actorId;
      }
    } else {
      return errors.forbidden("Invalid authentication context");
    }

    const updated = await prisma.idea.update({
      where: { id: idea.id },
      data: {
        status: "assigned",
        assigneeType,
        assigneeId,
        assignedAt: new Date(),
        assignedBy,
      },
      include: {
        project: {
          select: { uuid: true, name: true },
        },
      },
    });

    return success({
      uuid: updated.uuid,
      title: updated.title,
      content: updated.content,
      attachments: updated.attachments,
      status: updated.status,
      assignee: {
        type: updated.assigneeType,
        id: updated.assigneeId,
        assignedAt: updated.assignedAt?.toISOString(),
        assignedBy: updated.assignedBy,
      },
      project: {
        uuid: updated.project.uuid,
        name: updated.project.name,
      },
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  }
);

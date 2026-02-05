// src/app/api/tasks/[uuid]/claim/route.ts
// Tasks API - 认领 Task (PRD §3.3.1 认领规则)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAgent, isDeveloperAgent } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/tasks/[uuid]/claim - 认领 Task
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const task = await prisma.task.findFirst({
      where: { uuid, companyId: auth.companyId },
    });

    if (!task) {
      return errors.notFound("Task");
    }

    // 只有 open 状态的 Task 可被认领
    if (task.status !== "open") {
      return errors.alreadyClaimed();
    }

    let assigneeType: string;
    let assigneeId: number;
    let assignedBy: number | null = null;

    if (isAgent(auth)) {
      // Agent 认领 - Developer Agent 可以认领
      if (!isDeveloperAgent(auth)) {
        return errors.forbidden("Only developer agents can claim tasks");
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
            roles: { has: "developer" }, // 只能分配给 Developer Agent
          },
        });

        if (!agent) {
          return errors.notFound("Agent");
        }

        assigneeType = "agent";
        assigneeId = agent.id;
        assignedBy = auth.actorId;
      } else {
        // 分配给自己（所有自己的 Developer Agent 都能处理）
        assigneeType = "user";
        assigneeId = auth.actorId;
        assignedBy = auth.actorId;
      }
    } else {
      return errors.forbidden("Invalid authentication context");
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
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
      description: updated.description,
      status: updated.status,
      priority: updated.priority,
      assignee: {
        type: updated.assigneeType,
        id: updated.assigneeId,
        assignedAt: updated.assignedAt?.toISOString(),
        assignedBy: updated.assignedBy,
      },
      proposalId: updated.proposalId,
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

// src/app/api/tasks/[uuid]/release/route.ts
// Tasks API - 放弃认领 Task (PRD §3.3.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/tasks/[uuid]/release - 放弃认领 Task
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

    // 只有 assigned 状态的 Task 可以放弃认领
    if (task.status !== "assigned") {
      return errors.badRequest("Can only release tasks with assigned status");
    }

    // 检查权限：用户可以释放任何 Task，Agent 只能释放自己认领的
    if (!isUser(auth)) {
      if (!isAssignee(auth, task.assigneeType, task.assigneeId)) {
        return errors.permissionDenied("Only assignee can release this task");
      }
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "open",
        assigneeType: null,
        assigneeId: null,
        assignedAt: null,
        assignedBy: null,
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
      assignee: null,
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

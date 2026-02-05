// src/app/api/tasks/[uuid]/route.ts
// Tasks API - 详情、更新、删除 (ARCHITECTURE.md §5.1, §7.2)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// Task 状态转换规则 (ARCHITECTURE.md §7.2)
const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["to_verify", "closed"],
  to_verify: ["done", "in_progress", "closed"],
  done: ["closed"],
  closed: [],
};

// GET /api/tasks/[uuid] - Task 详情
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const task = await prisma.task.findFirst({
      where: { uuid, companyId: auth.companyId },
      include: {
        project: {
          select: { uuid: true, name: true },
        },
      },
    });

    if (!task) {
      return errors.notFound("Task");
    }

    return success({
      uuid: task.uuid,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assigneeId
        ? {
            type: task.assigneeType,
            id: task.assigneeId,
            assignedAt: task.assignedAt?.toISOString(),
            assignedBy: task.assignedBy,
          }
        : null,
      proposalId: task.proposalId,
      project: {
        uuid: task.project.uuid,
        name: task.project.name,
      },
      createdBy: task.createdBy,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    });
  }
);

// PATCH /api/tasks/[uuid] - 更新 Task
export const PATCH = withErrorHandler<{ uuid: string }>(
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

    const body = await parseBody<{
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
    }>(request);

    // 构建更新数据
    const updateData: {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
    } = {};

    // 标题更新
    if (body.title !== undefined) {
      if (body.title.trim() === "") {
        return errors.validationError({ title: "Title cannot be empty" });
      }
      updateData.title = body.title.trim();
    }

    // 描述更新
    if (body.description !== undefined) {
      updateData.description = body.description.trim() || null;
    }

    // 优先级更新
    if (body.priority !== undefined) {
      const validPriorities = ["low", "medium", "high"];
      if (!validPriorities.includes(body.priority)) {
        return errors.validationError({
          priority: "Priority must be low, medium, or high",
        });
      }
      updateData.priority = body.priority;
    }

    // 状态更新
    if (body.status !== undefined) {
      // 检查状态转换是否有效
      const allowedTransitions = TASK_STATUS_TRANSITIONS[task.status] || [];
      if (!allowedTransitions.includes(body.status)) {
        return errors.invalidStatusTransition(task.status, body.status);
      }

      // 非用户只能更新自己认领的 Task 状态
      if (!isUser(auth)) {
        if (!isAssignee(auth, task.assigneeType, task.assigneeId)) {
          return errors.permissionDenied("Only assignee can update status");
        }
      }

      updateData.status = body.status;
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: updateData,
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
      assignee: updated.assigneeId
        ? {
            type: updated.assigneeType,
            id: updated.assigneeId,
            assignedAt: updated.assignedAt?.toISOString(),
            assignedBy: updated.assignedBy,
          }
        : null,
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

// DELETE /api/tasks/[uuid] - 删除 Task
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以删除 Task
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete tasks");
    }

    const { uuid } = await context.params;

    const task = await prisma.task.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!task) {
      return errors.notFound("Task");
    }

    await prisma.task.delete({
      where: { id: task.id },
    });

    return success({ deleted: true });
  }
);

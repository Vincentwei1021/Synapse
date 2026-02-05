// src/app/api/ideas/[uuid]/route.ts
// Ideas API - 详情、更新、删除 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// Idea 状态转换规则 (ARCHITECTURE.md §7.3)
const IDEA_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["pending_review", "closed"],
  pending_review: ["completed", "in_progress", "closed"],
  completed: ["closed"],
  closed: [],
};

// GET /api/ideas/[uuid] - Idea 详情
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const idea = await prisma.idea.findFirst({
      where: { uuid, companyId: auth.companyId },
      include: {
        project: {
          select: { uuid: true, name: true },
        },
      },
    });

    if (!idea) {
      return errors.notFound("Idea");
    }

    return success({
      uuid: idea.uuid,
      title: idea.title,
      content: idea.content,
      attachments: idea.attachments,
      status: idea.status,
      assignee: idea.assigneeId
        ? {
            type: idea.assigneeType,
            id: idea.assigneeId,
            assignedAt: idea.assignedAt?.toISOString(),
            assignedBy: idea.assignedBy,
          }
        : null,
      project: {
        uuid: idea.project.uuid,
        name: idea.project.name,
      },
      createdBy: idea.createdBy,
      createdAt: idea.createdAt.toISOString(),
      updatedAt: idea.updatedAt.toISOString(),
    });
  }
);

// PATCH /api/ideas/[uuid] - 更新 Idea
export const PATCH = withErrorHandler<{ uuid: string }>(
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

    const body = await parseBody<{
      title?: string;
      content?: string;
      status?: string;
    }>(request);

    // 构建更新数据
    const updateData: {
      title?: string;
      content?: string | null;
      status?: string;
    } = {};

    // 标题更新
    if (body.title !== undefined) {
      if (body.title.trim() === "") {
        return errors.validationError({ title: "Title cannot be empty" });
      }
      updateData.title = body.title.trim();
    }

    // 内容更新
    if (body.content !== undefined) {
      updateData.content = body.content.trim() || null;
    }

    // 状态更新
    if (body.status !== undefined) {
      // 检查状态转换是否有效
      const allowedTransitions = IDEA_STATUS_TRANSITIONS[idea.status] || [];
      if (!allowedTransitions.includes(body.status)) {
        return errors.invalidStatusTransition(idea.status, body.status);
      }

      // 非用户只能更新自己认领的 Idea 状态
      if (!isUser(auth)) {
        if (!isAssignee(auth, idea.assigneeType, idea.assigneeId)) {
          return errors.permissionDenied("Only assignee can update status");
        }
      }

      updateData.status = body.status;
    }

    const updated = await prisma.idea.update({
      where: { id: idea.id },
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
      content: updated.content,
      attachments: updated.attachments,
      status: updated.status,
      assignee: updated.assigneeId
        ? {
            type: updated.assigneeType,
            id: updated.assigneeId,
            assignedAt: updated.assignedAt?.toISOString(),
            assignedBy: updated.assignedBy,
          }
        : null,
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

// DELETE /api/ideas/[uuid] - 删除 Idea
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以删除 Idea
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete ideas");
    }

    const { uuid } = await context.params;

    const idea = await prisma.idea.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!idea) {
      return errors.notFound("Idea");
    }

    await prisma.idea.delete({
      where: { id: idea.id },
    });

    return success({ deleted: true });
  }
);

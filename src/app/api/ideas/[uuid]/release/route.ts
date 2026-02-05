// src/app/api/ideas/[uuid]/release/route.ts
// Ideas API - 放弃认领 Idea (PRD §4.1 F5)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/ideas/[uuid]/release - 放弃认领 Idea
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

    // 只有 assigned 状态的 Idea 可以放弃认领
    if (idea.status !== "assigned") {
      return errors.badRequest("Can only release ideas with assigned status");
    }

    // 检查权限：用户可以释放任何 Idea，Agent 只能释放自己认领的
    if (!isUser(auth)) {
      if (!isAssignee(auth, idea.assigneeType, idea.assigneeId)) {
        return errors.permissionDenied("Only assignee can release this idea");
      }
    }

    const updated = await prisma.idea.update({
      where: { id: idea.id },
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
      content: updated.content,
      attachments: updated.attachments,
      status: updated.status,
      assignee: null,
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

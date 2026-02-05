// src/app/api/projects/[uuid]/activity/route.ts
// Activity API - 项目活动流 (ARCHITECTURE.md §4.2)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parsePagination } from "@/lib/api-handler";
import { paginated, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid]/activity - 项目活动流
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const { page, pageSize, skip, take } = parsePagination(request);

    // 查找项目
    const project = await prisma.project.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!project) {
      return errors.notFound("Project");
    }

    const where = {
      projectId: project.id,
      companyId: auth.companyId,
    };

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          uuid: true,
          ideaId: true,
          documentId: true,
          proposalId: true,
          taskId: true,
          actorType: true,
          actorId: true,
          action: true,
          payload: true,
          createdAt: true,
        },
      }),
      prisma.activity.count({ where }),
    ]);

    const data = activities.map((a) => ({
      uuid: a.uuid,
      references: {
        ideaId: a.ideaId,
        documentId: a.documentId,
        proposalId: a.proposalId,
        taskId: a.taskId,
      },
      actor: {
        type: a.actorType,
        id: a.actorId,
      },
      action: a.action,
      payload: a.payload,
      createdAt: a.createdAt.toISOString(),
    }));

    return paginated(data, page, pageSize, total);
  }
);

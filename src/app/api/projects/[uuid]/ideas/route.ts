// src/app/api/projects/[uuid]/ideas/route.ts
// Ideas API - 列表和创建 (ARCHITECTURE.md §5.1, PRD §4.1 F5)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid]/ideas - Ideas 列表
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const { page, pageSize, skip, take } = parsePagination(request);

    // 解析筛选参数
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

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
      ...(statusFilter && { status: statusFilter }),
    };

    const [ideas, total] = await Promise.all([
      prisma.idea.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          uuid: true,
          title: true,
          content: true,
          attachments: true,
          status: true,
          assigneeType: true,
          assigneeId: true,
          assignedAt: true,
          assignedBy: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.idea.count({ where }),
    ]);

    const data = ideas.map((idea) => ({
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
      createdBy: idea.createdBy,
      createdAt: idea.createdAt.toISOString(),
      updatedAt: idea.updatedAt.toISOString(),
    }));

    return paginated(data, page, pageSize, total);
  }
);

// POST /api/projects/[uuid]/ideas - 创建 Idea
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以创建 Idea
    if (!isUser(auth)) {
      return errors.forbidden("Only users can create ideas");
    }

    const { uuid } = await context.params;

    // 查找项目
    const project = await prisma.project.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!project) {
      return errors.notFound("Project");
    }

    const body = await parseBody<{
      title: string;
      content?: string;
      attachments?: Array<{ type: string; url: string; name: string }>;
    }>(request);

    // 验证必填字段
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }

    const idea = await prisma.idea.create({
      data: {
        companyId: auth.companyId,
        projectId: project.id,
        title: body.title.trim(),
        content: body.content?.trim() || null,
        attachments: body.attachments || undefined,
        status: "open",
        createdBy: auth.actorId,
      },
      select: {
        uuid: true,
        title: true,
        content: true,
        attachments: true,
        status: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success({
      uuid: idea.uuid,
      title: idea.title,
      content: idea.content,
      attachments: idea.attachments,
      status: idea.status,
      assignee: null,
      createdBy: idea.createdBy,
      createdAt: idea.createdAt.toISOString(),
      updatedAt: idea.updatedAt.toISOString(),
    });
  }
);

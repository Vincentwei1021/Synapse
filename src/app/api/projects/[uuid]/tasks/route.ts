// src/app/api/projects/[uuid]/tasks/route.ts
// Tasks API - 列表和创建 (ARCHITECTURE.md §5.1, PRD §3.3.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isPmAgent } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid]/tasks - Tasks 列表
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
    const priorityFilter = url.searchParams.get("priority");

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
      ...(priorityFilter && { priority: priorityFilter }),
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        select: {
          uuid: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          assigneeType: true,
          assigneeId: true,
          assignedAt: true,
          assignedBy: true,
          proposalId: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.task.count({ where }),
    ]);

    const data = tasks.map((task) => ({
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
      createdBy: task.createdBy,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));

    return paginated(data, page, pageSize, total);
  }
);

// POST /api/projects/[uuid]/tasks - 创建 Task
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 用户和 PM Agent 可以创建 Task
    if (!isUser(auth) && !isPmAgent(auth)) {
      return errors.forbidden("Only users and PM agents can create tasks");
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
      description?: string;
      priority?: string;
    }>(request);

    // 验证必填字段
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }

    // 验证优先级
    const validPriorities = ["low", "medium", "high"];
    const priority = body.priority || "medium";
    if (!validPriorities.includes(priority)) {
      return errors.validationError({
        priority: "Priority must be low, medium, or high",
      });
    }

    const task = await prisma.task.create({
      data: {
        companyId: auth.companyId,
        projectId: project.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        status: "open",
        priority,
        createdBy: auth.actorId,
      },
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success({
      uuid: task.uuid,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: null,
      proposalId: null,
      createdBy: task.createdBy,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    });
  }
);

// src/app/api/projects/route.ts
// Projects API - 列表和创建 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

// GET /api/projects - 项目列表
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { page, pageSize, skip, take } = parsePagination(request);

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: auth.companyId },
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        uuid: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            ideas: true,
            documents: true,
            tasks: true,
            proposals: true,
          },
        },
      },
    }),
    prisma.project.count({
      where: { companyId: auth.companyId },
    }),
  ]);

  // 转换为 API 响应格式
  const data = projects.map((p) => ({
    uuid: p.uuid,
    name: p.name,
    description: p.description,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    counts: {
      ideas: p._count.ideas,
      documents: p._count.documents,
      tasks: p._count.tasks,
      proposals: p._count.proposals,
    },
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/projects - 创建项目
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // 只有用户可以创建项目
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create projects");
  }

  const body = await parseBody<{
    name: string;
    description?: string;
  }>(request);

  // 验证必填字段
  if (!body.name || body.name.trim() === "") {
    return errors.validationError({ name: "Name is required" });
  }

  const project = await prisma.project.create({
    data: {
      companyId: auth.companyId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
    },
    select: {
      uuid: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return success({
    uuid: project.uuid,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  });
});

// src/app/api/projects/[uuid]/route.ts
// Projects API - 详情、更新、删除 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid] - 项目详情
export const GET = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid } = await context.params;

  const project = await prisma.project.findFirst({
    where: {
      uuid,
      companyId: auth.companyId,
    },
    select: {
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
          activities: true,
        },
      },
    },
  });

  if (!project) {
    return errors.notFound("Project");
  }

  return success({
    uuid: project.uuid,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    counts: {
      ideas: project._count.ideas,
      documents: project._count.documents,
      tasks: project._count.tasks,
      proposals: project._count.proposals,
      activities: project._count.activities,
    },
  });
});

// PATCH /api/projects/[uuid] - 更新项目
export const PATCH = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // 只有用户可以更新项目
  if (!isUser(auth)) {
    return errors.forbidden("Only users can update projects");
  }

  const { uuid } = await context.params;

  // 验证项目存在且属于当前公司
  const existing = await prisma.project.findFirst({
    where: { uuid, companyId: auth.companyId },
    select: { id: true },
  });

  if (!existing) {
    return errors.notFound("Project");
  }

  const body = await parseBody<{
    name?: string;
    description?: string;
  }>(request);

  // 构建更新数据
  const updateData: { name?: string; description?: string | null } = {};

  if (body.name !== undefined) {
    if (body.name.trim() === "") {
      return errors.validationError({ name: "Name cannot be empty" });
    }
    updateData.name = body.name.trim();
  }

  if (body.description !== undefined) {
    updateData.description = body.description?.trim() || null;
  }

  const project = await prisma.project.update({
    where: { id: existing.id },
    data: updateData,
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

// DELETE /api/projects/[uuid] - 删除项目
export const DELETE = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // 只有用户可以删除项目
  if (!isUser(auth)) {
    return errors.forbidden("Only users can delete projects");
  }

  const { uuid } = await context.params;

  // 验证项目存在且属于当前公司
  const existing = await prisma.project.findFirst({
    where: { uuid, companyId: auth.companyId },
    select: { id: true },
  });

  if (!existing) {
    return errors.notFound("Project");
  }

  // 删除项目（Prisma 会在应用层处理级联删除）
  await prisma.project.delete({
    where: { id: existing.id },
  });

  return success({ deleted: true });
});

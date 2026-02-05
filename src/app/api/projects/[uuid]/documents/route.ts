// src/app/api/projects/[uuid]/documents/route.ts
// Documents API - 列表和创建 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid]/documents - Documents 列表
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
    const typeFilter = url.searchParams.get("type");

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
      ...(typeFilter && { type: typeFilter }),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: "desc" },
        select: {
          uuid: true,
          type: true,
          title: true,
          version: true,
          proposalId: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.document.count({ where }),
    ]);

    const data = documents.map((doc) => ({
      uuid: doc.uuid,
      type: doc.type,
      title: doc.title,
      version: doc.version,
      proposalId: doc.proposalId,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));

    return paginated(data, page, pageSize, total);
  }
);

// POST /api/projects/[uuid]/documents - 创建 Document
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以直接创建 Document
    if (!isUser(auth)) {
      return errors.forbidden("Only users can create documents directly");
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
      type: string;
      title: string;
      content?: string;
    }>(request);

    // 验证必填字段
    if (!body.type || body.type.trim() === "") {
      return errors.validationError({ type: "Type is required" });
    }
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }

    const document = await prisma.document.create({
      data: {
        companyId: auth.companyId,
        projectId: project.id,
        type: body.type.trim(),
        title: body.title.trim(),
        content: body.content?.trim() || null,
        version: 1,
        createdBy: auth.actorId,
      },
      select: {
        uuid: true,
        type: true,
        title: true,
        content: true,
        version: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success({
      uuid: document.uuid,
      type: document.type,
      title: document.title,
      content: document.content,
      version: document.version,
      proposalId: null,
      createdBy: document.createdBy,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    });
  }
);

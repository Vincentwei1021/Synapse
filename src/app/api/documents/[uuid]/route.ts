// src/app/api/documents/[uuid]/route.ts
// Documents API - 详情、更新、删除 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/documents/[uuid] - Document 详情
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const document = await prisma.document.findFirst({
      where: { uuid, companyId: auth.companyId },
      include: {
        project: {
          select: { uuid: true, name: true },
        },
      },
    });

    if (!document) {
      return errors.notFound("Document");
    }

    return success({
      uuid: document.uuid,
      type: document.type,
      title: document.title,
      content: document.content,
      version: document.version,
      proposalId: document.proposalId,
      project: {
        uuid: document.project.uuid,
        name: document.project.name,
      },
      createdBy: document.createdBy,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    });
  }
);

// PATCH /api/documents/[uuid] - 更新 Document
export const PATCH = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以更新 Document
    if (!isUser(auth)) {
      return errors.forbidden("Only users can update documents");
    }

    const { uuid } = await context.params;

    const document = await prisma.document.findFirst({
      where: { uuid, companyId: auth.companyId },
    });

    if (!document) {
      return errors.notFound("Document");
    }

    const body = await parseBody<{
      title?: string;
      content?: string;
      incrementVersion?: boolean;
    }>(request);

    // 构建更新数据
    const updateData: {
      title?: string;
      content?: string | null;
      version?: { increment: number };
    } = {};

    if (body.title !== undefined) {
      if (body.title.trim() === "") {
        return errors.validationError({ title: "Title cannot be empty" });
      }
      updateData.title = body.title.trim();
    }

    if (body.content !== undefined) {
      updateData.content = body.content.trim() || null;
    }

    // 可选增加版本号
    if (body.incrementVersion) {
      updateData.version = { increment: 1 };
    }

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: updateData,
      include: {
        project: {
          select: { uuid: true, name: true },
        },
      },
    });

    return success({
      uuid: updated.uuid,
      type: updated.type,
      title: updated.title,
      content: updated.content,
      version: updated.version,
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

// DELETE /api/documents/[uuid] - 删除 Document
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以删除 Document
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete documents");
    }

    const { uuid } = await context.params;

    const document = await prisma.document.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!document) {
      return errors.notFound("Document");
    }

    await prisma.document.delete({
      where: { id: document.id },
    });

    return success({ deleted: true });
  }
);

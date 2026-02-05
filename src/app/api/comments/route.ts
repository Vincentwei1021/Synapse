// src/app/api/comments/route.ts
// Comments API (ARCHITECTURE.md §4.2)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination, parseQuery } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

// GET /api/comments?targetType=&targetId= - 获取评论
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const query = parseQuery(request);
  const { page, pageSize, skip, take } = parsePagination(request);

  // 验证必填参数
  if (!query.targetType || !query.targetId) {
    return errors.validationError({
      targetType: "targetType is required",
      targetId: "targetId is required",
    });
  }

  const validTargetTypes = ["idea", "proposal", "task", "document"];
  if (!validTargetTypes.includes(query.targetType)) {
    return errors.validationError({
      targetType: "Invalid target type",
    });
  }

  const targetId = parseInt(query.targetId, 10);
  if (isNaN(targetId)) {
    return errors.validationError({
      targetId: "Invalid target ID",
    });
  }

  const where = {
    companyId: auth.companyId,
    targetType: query.targetType,
    targetId,
  };

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "asc" },
      select: {
        uuid: true,
        targetType: true,
        targetId: true,
        content: true,
        authorType: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.comment.count({ where }),
  ]);

  const data = comments.map((c) => ({
    uuid: c.uuid,
    targetType: c.targetType,
    targetId: c.targetId,
    content: c.content,
    author: {
      type: c.authorType,
      id: c.authorId,
    },
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/comments - 添加评论
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const body = await parseBody<{
    targetType: string;
    targetId: number;
    content: string;
  }>(request);

  // 验证必填字段
  const validTargetTypes = ["idea", "proposal", "task", "document"];
  if (!body.targetType || !validTargetTypes.includes(body.targetType)) {
    return errors.validationError({
      targetType: "Invalid target type",
    });
  }
  if (!body.targetId) {
    return errors.validationError({
      targetId: "Target ID is required",
    });
  }
  if (!body.content || body.content.trim() === "") {
    return errors.validationError({
      content: "Content is required",
    });
  }

  const comment = await prisma.comment.create({
    data: {
      companyId: auth.companyId,
      targetType: body.targetType,
      targetId: body.targetId,
      content: body.content.trim(),
      authorType: isUser(auth) ? "user" : "agent",
      authorId: auth.actorId,
    },
    select: {
      uuid: true,
      targetType: true,
      targetId: true,
      content: true,
      authorType: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return success({
    uuid: comment.uuid,
    targetType: comment.targetType,
    targetId: comment.targetId,
    content: comment.content,
    author: {
      type: comment.authorType,
      id: comment.authorId,
    },
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  });
});

// src/services/comment.service.ts
// Comment 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";

export interface CommentListParams {
  companyId: number;
  targetType: string;
  targetId: number;
  skip: number;
  take: number;
}

export interface CommentCreateParams {
  companyId: number;
  targetType: string;
  targetId: number;
  content: string;
  authorType: string;
  authorId: number;
}

// Comments 列表查询
export async function listComments({
  companyId,
  targetType,
  targetId,
  skip,
  take,
}: CommentListParams) {
  const where = { companyId, targetType, targetId };

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

  return { comments, total };
}

// 创建 Comment
export async function createComment({
  companyId,
  targetType,
  targetId,
  content,
  authorType,
  authorId,
}: CommentCreateParams) {
  return prisma.comment.create({
    data: { companyId, targetType, targetId, content, authorType, authorId },
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
}

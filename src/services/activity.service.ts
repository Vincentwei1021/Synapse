// src/services/activity.service.ts
// Activity 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";

export interface ActivityListParams {
  companyId: number;
  projectId: number;
  skip: number;
  take: number;
}

export interface ActivityCreateParams {
  companyId: number;
  projectId: number;
  actorType: string;
  actorId: number;
  action: string;
  ideaId?: number | null;
  documentId?: number | null;
  proposalId?: number | null;
  taskId?: number | null;
  payload?: unknown;
}

// Activities 列表查询
export async function listActivities({
  companyId,
  projectId,
  skip,
  take,
}: ActivityListParams) {
  const where = { projectId, companyId };

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

  return { activities, total };
}

// 创建 Activity
export async function createActivity({
  companyId,
  projectId,
  actorType,
  actorId,
  action,
  ideaId,
  documentId,
  proposalId,
  taskId,
  payload,
}: ActivityCreateParams) {
  return prisma.activity.create({
    data: {
      companyId,
      projectId,
      actorType,
      actorId,
      action,
      ideaId,
      documentId,
      proposalId,
      taskId,
      payload: payload || undefined,
    },
  });
}

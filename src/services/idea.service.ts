// src/services/idea.service.ts
// Idea 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";

export interface IdeaListParams {
  companyId: number;
  projectId: number;
  skip: number;
  take: number;
  status?: string;
}

export interface IdeaCreateParams {
  companyId: number;
  projectId: number;
  title: string;
  content?: string | null;
  attachments?: unknown;
  createdBy: number;
}

export interface IdeaClaimParams {
  ideaId: number;
  assigneeType: string;
  assigneeId: number;
  assignedBy?: number | null;
}

// Idea 状态转换规则 (ARCHITECTURE.md §7.3)
export const IDEA_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["pending_review", "closed"],
  pending_review: ["completed", "in_progress", "closed"],
  completed: ["closed"],
  closed: [],
};

// 验证状态转换是否有效
export function isValidIdeaStatusTransition(from: string, to: string): boolean {
  const allowed = IDEA_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// Ideas 列表查询
export async function listIdeas({ companyId, projectId, skip, take, status }: IdeaListParams) {
  const where = {
    projectId,
    companyId,
    ...(status && { status }),
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

  return { ideas, total };
}

// 获取 Idea 详情
export async function getIdea(companyId: number, uuid: string) {
  return prisma.idea.findFirst({
    where: { uuid, companyId },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 通过 ID 获取 Idea（内部使用）
export async function getIdeaById(companyId: number, uuid: string) {
  return prisma.idea.findFirst({
    where: { uuid, companyId },
  });
}

// 创建 Idea
export async function createIdea(params: IdeaCreateParams) {
  return prisma.idea.create({
    data: {
      companyId: params.companyId,
      projectId: params.projectId,
      title: params.title,
      content: params.content,
      attachments: params.attachments || undefined,
      status: "open",
      createdBy: params.createdBy,
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
}

// 更新 Idea
export async function updateIdea(
  id: number,
  data: { title?: string; content?: string | null; status?: string }
) {
  return prisma.idea.update({
    where: { id },
    data,
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 认领 Idea
export async function claimIdea({ ideaId, assigneeType, assigneeId, assignedBy }: IdeaClaimParams) {
  return prisma.idea.update({
    where: { id: ideaId },
    data: {
      status: "assigned",
      assigneeType,
      assigneeId,
      assignedAt: new Date(),
      assignedBy,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 放弃认领 Idea
export async function releaseIdea(id: number) {
  return prisma.idea.update({
    where: { id },
    data: {
      status: "open",
      assigneeType: null,
      assigneeId: null,
      assignedAt: null,
      assignedBy: null,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 删除 Idea
export async function deleteIdea(id: number) {
  return prisma.idea.delete({ where: { id } });
}

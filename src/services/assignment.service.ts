// src/services/assignment.service.ts
// Assignment 服务层 - Agent 自助查询 (PRD §5.4)

import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/types/auth";
import { isAgent } from "@/lib/auth";

// 获取当前用户/Agent 的认领条件
function getAssignmentConditions(auth: AuthContext) {
  const conditions: Array<{ assigneeType: string; assigneeId: number }> = [];

  if (isAgent(auth)) {
    // Agent 直接认领的
    conditions.push({ assigneeType: "agent", assigneeId: auth.actorId });
    // Agent 的 Owner 认领的（"Assign to myself"）
    if (auth.ownerId) {
      conditions.push({ assigneeType: "user", assigneeId: auth.ownerId });
    }
  } else {
    // 用户直接认领的
    conditions.push({ assigneeType: "user", assigneeId: auth.actorId });
  }

  return conditions;
}

// 获取自己认领的 Ideas + Tasks
export async function getMyAssignments(auth: AuthContext) {
  const conditions = getAssignmentConditions(auth);

  const [ideas, tasks] = await Promise.all([
    // 获取认领的 Ideas
    prisma.idea.findMany({
      where: {
        companyId: auth.companyId,
        OR: conditions,
        status: { notIn: ["completed", "closed"] },
      },
      select: {
        uuid: true,
        title: true,
        content: true,
        status: true,
        assigneeType: true,
        assigneeId: true,
        assignedAt: true,
        project: { select: { uuid: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { assignedAt: "desc" },
    }),
    // 获取认领的 Tasks
    prisma.task.findMany({
      where: {
        companyId: auth.companyId,
        OR: conditions,
        status: { notIn: ["done", "closed"] },
      },
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        assigneeType: true,
        assigneeId: true,
        assignedAt: true,
        project: { select: { uuid: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ priority: "desc" }, { assignedAt: "desc" }],
    }),
  ]);

  return { ideas, tasks };
}

// 获取项目中可认领的 Ideas + Tasks
export async function getAvailableItems(
  companyId: number,
  projectId: number,
  canClaimIdeas: boolean,
  canClaimTasks: boolean
) {
  const baseWhere = { projectId, companyId, status: "open" };

  const [ideas, tasks] = await Promise.all([
    canClaimIdeas
      ? prisma.idea.findMany({
          where: baseWhere,
          select: {
            uuid: true,
            title: true,
            content: true,
            status: true,
            createdBy: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
    canClaimTasks
      ? prisma.task.findMany({
          where: baseWhere,
          select: {
            uuid: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            createdBy: true,
            createdAt: true,
          },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 50,
        })
      : [],
  ]);

  return { ideas, tasks };
}

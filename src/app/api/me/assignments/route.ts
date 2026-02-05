// src/app/api/me/assignments/route.ts
// Agent 自助 API - 获取自己认领的 Ideas + Tasks (PRD §5.4)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isAgent } from "@/lib/auth";

// GET /api/me/assignments - 获取自己认领的 Ideas + Tasks
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // 主要为 Agent 设计，但用户也可以使用
  const companyId = auth.companyId;

  // 构建查询条件
  // Agent 可以看到：
  // 1. assigneeType=agent AND assigneeId=当前AgentId
  // 2. assigneeType=user AND assigneeId=当前Agent的OwnerId（人类分配给自己时）
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

  const [ideas, tasks] = await Promise.all([
    // 获取认领的 Ideas
    prisma.idea.findMany({
      where: {
        companyId,
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
        project: {
          select: { uuid: true, name: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { assignedAt: "desc" },
    }),
    // 获取认领的 Tasks
    prisma.task.findMany({
      where: {
        companyId,
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
        project: {
          select: { uuid: true, name: true },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ priority: "desc" }, { assignedAt: "desc" }],
    }),
  ]);

  return success({
    ideas: ideas.map((idea) => ({
      uuid: idea.uuid,
      title: idea.title,
      content: idea.content,
      status: idea.status,
      assignee: {
        type: idea.assigneeType,
        id: idea.assigneeId,
        assignedAt: idea.assignedAt?.toISOString(),
      },
      project: idea.project,
      createdAt: idea.createdAt.toISOString(),
      updatedAt: idea.updatedAt.toISOString(),
    })),
    tasks: tasks.map((task) => ({
      uuid: task.uuid,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: {
        type: task.assigneeType,
        id: task.assigneeId,
        assignedAt: task.assignedAt?.toISOString(),
      },
      project: task.project,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    })),
  });
});

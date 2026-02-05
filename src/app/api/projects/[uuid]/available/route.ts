// src/app/api/projects/[uuid]/available/route.ts
// Agent 自助 API - 获取可认领的 Ideas + Tasks (PRD §5.4)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isAgent, isPmAgent, isDeveloperAgent } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid]/available - 获取可认领的 Ideas + Tasks
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    // 查找项目
    const project = await prisma.project.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true, uuid: true, name: true },
    });

    if (!project) {
      return errors.notFound("Project");
    }

    const baseWhere = {
      projectId: project.id,
      companyId: auth.companyId,
      status: "open",
    };

    // 根据角色返回不同内容
    // PM Agent: 可认领 Ideas
    // Developer Agent: 可认领 Tasks
    // User: 可看到所有

    const isPm = isAgent(auth) ? isPmAgent(auth) : true;
    const isDev = isAgent(auth) ? isDeveloperAgent(auth) : true;

    const [ideas, tasks] = await Promise.all([
      // Ideas - PM Agent 或 User 可见
      isPm
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
      // Tasks - Developer Agent 或 User 可见
      isDev
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

    return success({
      project: {
        uuid: project.uuid,
        name: project.name,
      },
      ideas: ideas.map((idea) => ({
        uuid: idea.uuid,
        title: idea.title,
        content: idea.content,
        status: idea.status,
        createdBy: idea.createdBy,
        createdAt: idea.createdAt.toISOString(),
      })),
      tasks: tasks.map((task) => ({
        uuid: task.uuid,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        createdBy: task.createdBy,
        createdAt: task.createdAt.toISOString(),
      })),
    });
  }
);

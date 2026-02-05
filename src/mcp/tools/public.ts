// src/mcp/tools/public.ts
// 公共 MCP 工具 - 所有 Agent 可用 (ARCHITECTURE.md §5.2)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as projectService from "@/services/project.service";
import * as ideaService from "@/services/idea.service";
import * as documentService from "@/services/document.service";
import * as taskService from "@/services/task.service";
import * as proposalService from "@/services/proposal.service";
import * as activityService from "@/services/activity.service";
import * as commentService from "@/services/comment.service";
import * as assignmentService from "@/services/assignment.service";
import { prisma } from "@/lib/prisma";

export function registerPublicTools(server: McpServer, auth: AgentAuthContext) {
  // chorus_get_project - 获取项目背景信息
  server.registerTool(
    "chorus_get_project",
    {
      description: "获取项目详情和背景信息",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
      }),
    },
    async ({ projectUuid }) => {
      const project = await projectService.getProject(auth.companyId, projectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // chorus_get_ideas - 获取 Ideas 列表
  server.registerTool(
    "chorus_get_ideas",
    {
      description: "获取项目的 Ideas 列表",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        status: z.string().optional().describe("筛选状态: open, assigned, in_progress, pending_review, completed, closed"),
        page: z.number().optional().default(1).describe("页码"),
        pageSize: z.number().optional().default(20).describe("每页数量"),
      }),
    },
    async ({ projectUuid, status, page = 1, pageSize = 20 }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { ideas, total } = await ideaService.listIdeas({
        companyId: auth.companyId,
        projectId,
        skip,
        take: pageSize,
        status,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ ideas, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // chorus_get_documents - 获取 Documents 列表
  server.registerTool(
    "chorus_get_documents",
    {
      description: "获取项目的文档列表",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        type: z.string().optional().describe("筛选类型: prd, tech_design, adr 等"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(20),
      }),
    },
    async ({ projectUuid, type, page = 1, pageSize = 20 }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { documents, total } = await documentService.listDocuments({
        companyId: auth.companyId,
        projectId,
        skip,
        take: pageSize,
        type,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ documents, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // chorus_get_document - 获取单个 Document 详情
  server.registerTool(
    "chorus_get_document",
    {
      description: "获取单个文档的详细内容",
      inputSchema: z.object({
        documentUuid: z.string().describe("文档 UUID"),
      }),
    },
    async ({ documentUuid }) => {
      const document = await documentService.getDocument(auth.companyId, documentUuid);
      if (!document) {
        return { content: [{ type: "text", text: "文档不存在" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(document, null, 2) }],
      };
    }
  );

  // chorus_get_proposals - 获取提议列表
  server.registerTool(
    "chorus_get_proposals",
    {
      description: "获取项目的提议列表和状态",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        status: z.string().optional().describe("筛选状态: pending, approved, rejected, revised"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(20),
      }),
    },
    async ({ projectUuid, status, page = 1, pageSize = 20 }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { proposals, total } = await proposalService.listProposals({
        companyId: auth.companyId,
        projectId,
        skip,
        take: pageSize,
        status,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ proposals, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // chorus_get_task - 获取任务详情
  server.registerTool(
    "chorus_get_task",
    {
      description: "获取单个任务的详细信息和上下文",
      inputSchema: z.object({
        taskUuid: z.string().describe("任务 UUID"),
      }),
    },
    async ({ taskUuid }) => {
      const task = await taskService.getTask(auth.companyId, taskUuid);
      if (!task) {
        return { content: [{ type: "text", text: "任务不存在" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
      };
    }
  );

  // chorus_list_tasks - 列出任务
  server.registerTool(
    "chorus_list_tasks",
    {
      description: "列出项目的任务",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        status: z.string().optional().describe("筛选状态: open, assigned, in_progress, to_verify, done, closed"),
        priority: z.string().optional().describe("筛选优先级: low, medium, high"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(20),
      }),
    },
    async ({ projectUuid, status, priority, page = 1, pageSize = 20 }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { tasks, total } = await taskService.listTasks({
        companyId: auth.companyId,
        projectId,
        skip,
        take: pageSize,
        status,
        priority,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ tasks, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // chorus_get_activity - 获取项目活动流
  server.registerTool(
    "chorus_get_activity",
    {
      description: "获取项目的活动流",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(50),
      }),
    },
    async ({ projectUuid, page = 1, pageSize = 50 }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { activities, total } = await activityService.listActivities({
        companyId: auth.companyId,
        projectId,
        skip,
        take: pageSize,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ activities, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // chorus_add_comment - 添加评论
  server.registerTool(
    "chorus_add_comment",
    {
      description: "对 Idea/Proposal/Task/Document 添加评论",
      inputSchema: z.object({
        targetType: z.enum(["idea", "proposal", "task", "document"]).describe("目标类型"),
        targetId: z.number().describe("目标 ID"),
        content: z.string().describe("评论内容"),
      }),
    },
    async ({ targetType, targetId, content }) => {
      const comment = await commentService.createComment({
        companyId: auth.companyId,
        targetType,
        targetId,
        content,
        authorType: "agent",
        authorId: auth.actorId,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(comment, null, 2) }],
      };
    }
  );

  // chorus_checkin - 心跳签到，返回 Agent 人格和待处理任务
  server.registerTool(
    "chorus_checkin",
    {
      description: "Agent 心跳签到，返回 Agent 人格定义、角色和待处理任务。建议在每个 session 开始时调用。",
      inputSchema: z.object({}),
    },
    async () => {
      // 更新最后活跃时间并获取 Agent 信息
      const agent = await prisma.agent.update({
        where: { id: auth.actorId },
        data: { lastActiveAt: new Date() },
        select: {
          uuid: true,
          name: true,
          roles: true,
          persona: true,
          systemPrompt: true,
        },
      });

      // 获取待处理的 Ideas 和 Tasks
      const { ideas, tasks } = await assignmentService.getMyAssignments(auth);

      // 构建默认人格（如果未设置自定义人格）
      const defaultPersonas: Record<string, string> = {
        pm: `你是一个经验丰富的产品经理 Agent。你的职责是：
- 分析用户需求，提炼核心问题
- 将模糊的想法转化为清晰的 PRD
- 合理拆分任务，估算工作量（以 Agent 小时为单位）
- 识别风险和依赖关系
- 与团队保持沟通，推动项目进展

工作风格：务实、注重细节、善于沟通`,
        developer: `你是一个专业的开发者 Agent。你的职责是：
- 理解任务需求，编写高质量代码
- 遵循项目的代码规范和架构约定
- 完成任务后及时报告进度
- 遇到问题主动沟通，不做假设

工作风格：严谨、高效、注重代码质量`,
      };

      // 确定有效的人格
      let effectivePersona = agent.persona;
      if (!effectivePersona && agent.roles.length > 0) {
        effectivePersona = defaultPersonas[agent.roles[0]] || null;
      }

      const result = {
        checkinTime: new Date().toISOString(),
        agent: {
          uuid: agent.uuid,
          name: agent.name,
          roles: agent.roles,
          persona: effectivePersona,
          systemPrompt: agent.systemPrompt,
        },
        assignments: {
          ideas: ideas.filter(i => ["assigned", "in_progress"].includes(i.status)),
          tasks: tasks.filter(t => ["assigned", "in_progress"].includes(t.status)),
        },
        pending: {
          ideasCount: ideas.length,
          tasksCount: tasks.length,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // chorus_get_my_assignments - 获取自己认领的 Ideas + Tasks
  server.registerTool(
    "chorus_get_my_assignments",
    {
      description: "获取自己认领的所有 Ideas 和 Tasks",
      inputSchema: z.object({}),
    },
    async () => {
      const { ideas, tasks } = await assignmentService.getMyAssignments(auth);

      return {
        content: [{ type: "text", text: JSON.stringify({ ideas, tasks }, null, 2) }],
      };
    }
  );

  // chorus_get_available_ideas - 获取可认领的 Ideas
  server.registerTool(
    "chorus_get_available_ideas",
    {
      description: "获取项目中可认领的 Ideas（status=open）",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
      }),
    },
    async ({ projectUuid }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const { ideas } = await assignmentService.getAvailableItems(
        auth.companyId,
        projectId,
        true,
        false
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ ideas }, null, 2) }],
      };
    }
  );

  // chorus_get_available_tasks - 获取可认领的 Tasks
  server.registerTool(
    "chorus_get_available_tasks",
    {
      description: "获取项目中可认领的 Tasks（status=open）",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
      }),
    },
    async ({ projectUuid }) => {
      const projectId = await projectService.getProjectIdByUuid(auth.companyId, projectUuid);
      if (!projectId) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      const { tasks } = await assignmentService.getAvailableItems(
        auth.companyId,
        projectId,
        false,
        true
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ tasks }, null, 2) }],
      };
    }
  );
}

// src/mcp/tools/pm.ts
// PM Agent 专属 MCP 工具 (ARCHITECTURE.md §5.2)
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { projectExists } from "@/services/project.service";
import * as ideaService from "@/services/idea.service";
import * as proposalService from "@/services/proposal.service";
import * as documentService from "@/services/document.service";
import * as taskService from "@/services/task.service";
import * as activityService from "@/services/activity.service";
import { getAgentByUuid } from "@/services/agent.service";

export function registerPmTools(server: McpServer, auth: AgentAuthContext) {
  // chorus_claim_idea - 认领 Idea
  server.registerTool(
    "chorus_claim_idea",
    {
      description: "认领一个 Idea（open → assigned）",
      inputSchema: z.object({
        ideaUuid: z.string().describe("Idea UUID"),
      }),
    },
    async ({ ideaUuid }) => {
      const idea = await ideaService.getIdeaByUuid(auth.companyUuid, ideaUuid);
      if (!idea) {
        return { content: [{ type: "text", text: "Idea 不存在" }], isError: true };
      }

      if (idea.status !== "open") {
        return { content: [{ type: "text", text: "只能认领 open 状态的 Idea" }], isError: true };
      }

      const updated = await ideaService.claimIdea({
        ideaUuid: idea.uuid,
        companyUuid: auth.companyUuid,
        assigneeType: "agent",
        assigneeUuid: auth.actorUuid,
      });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        projectUuid: idea.projectUuid,
        targetType: "idea",
        targetUuid: idea.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "assigned",
        value: { assigneeType: "agent", assigneeUuid: auth.actorUuid },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  // chorus_release_idea - 放弃认领 Idea
  server.registerTool(
    "chorus_release_idea",
    {
      description: "放弃认领 Idea（assigned → open）",
      inputSchema: z.object({
        ideaUuid: z.string().describe("Idea UUID"),
      }),
    },
    async ({ ideaUuid }) => {
      const idea = await ideaService.getIdeaByUuid(auth.companyUuid, ideaUuid);
      if (!idea) {
        return { content: [{ type: "text", text: "Idea 不存在" }], isError: true };
      }

      if (idea.status !== "assigned") {
        return { content: [{ type: "text", text: "只能放弃 assigned 状态的 Idea" }], isError: true };
      }

      // 检查是否是认领者 (UUID comparison)
      const isAssignee =
        (idea.assigneeType === "agent" && idea.assigneeUuid === auth.actorUuid) ||
        (idea.assigneeType === "user" && auth.ownerUuid && idea.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "只有认领者可以放弃认领" }], isError: true };
      }

      const updated = await ideaService.releaseIdea(idea.uuid);

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        projectUuid: idea.projectUuid,
        targetType: "idea",
        targetUuid: idea.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "released",
      });

      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  // chorus_update_idea_status - 更新 Idea 状态
  server.registerTool(
    "chorus_update_idea_status",
    {
      description: "更新 Idea 状态（仅认领者可操作）",
      inputSchema: z.object({
        ideaUuid: z.string().describe("Idea UUID"),
        status: z.enum(["in_progress", "pending_review", "completed"]).describe("新状态"),
      }),
    },
    async ({ ideaUuid, status }) => {
      const idea = await ideaService.getIdeaByUuid(auth.companyUuid, ideaUuid);
      if (!idea) {
        return { content: [{ type: "text", text: "Idea 不存在" }], isError: true };
      }

      // 检查是否是认领者 (UUID comparison)
      const isAssignee =
        (idea.assigneeType === "agent" && idea.assigneeUuid === auth.actorUuid) ||
        (idea.assigneeType === "user" && auth.ownerUuid && idea.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "只有认领者可以更新状态" }], isError: true };
      }

      // 验证状态转换
      if (!ideaService.isValidIdeaStatusTransition(idea.status, status)) {
        return {
          content: [{ type: "text", text: `无效的状态转换: ${idea.status} → ${status}` }],
          isError: true,
        };
      }

      const updated = await ideaService.updateIdea(idea.uuid, auth.companyUuid, { status });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        projectUuid: idea.projectUuid,
        targetType: "idea",
        targetUuid: idea.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "status_changed",
        value: { status },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  // chorus_pm_create_proposal - 创建提议（容器模型）
  server.registerTool(
    "chorus_pm_create_proposal",
    {
      description: "创建提议容器（可包含文档草稿和任务草稿）",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        title: z.string().describe("提议标题"),
        description: z.string().optional().describe("提议描述"),
        inputType: z.enum(["idea", "document"]).describe("输入来源类型"),
        inputUuids: z.array(z.string()).describe("输入 UUID 列表"),
        documentDrafts: z.array(z.object({
          type: z.string().describe("文档类型（prd, tech_design, adr, spec, guide）"),
          title: z.string().describe("文档标题"),
          content: z.string().describe("文档内容（Markdown）"),
        })).optional().describe("文档草稿列表"),
        taskDrafts: z.array(z.object({
          title: z.string().describe("任务标题"),
          description: z.string().optional().describe("任务描述"),
          storyPoints: z.number().optional().describe("工作量估算（Agent 小时）"),
          priority: z.enum(["low", "medium", "high"]).optional().describe("优先级"),
          acceptanceCriteria: z.string().optional().describe("验收标准（Markdown）"),
        })).optional().describe("任务草稿列表"),
      }),
    },
    async ({ projectUuid, title, description, inputType, inputUuids, documentDrafts, taskDrafts }) => {
      // 验证项目存在
      if (!(await projectExists(auth.companyUuid, projectUuid))) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      // 如果输入类型是 idea，验证认领者和唯一性
      if (inputType === "idea") {
        const assigneeCheck = await proposalService.checkIdeasAssignee(
          auth.companyUuid,
          inputUuids,
          auth.actorUuid,
          "agent"
        );
        if (!assigneeCheck.valid) {
          return {
            content: [{ type: "text", text: "只能基于自己认领的 Ideas 创建 Proposal" }],
            isError: true,
          };
        }

        const availabilityCheck = await proposalService.checkIdeasAvailability(
          auth.companyUuid,
          inputUuids
        );
        if (!availabilityCheck.available) {
          const usedIdea = availabilityCheck.usedIdeas[0];
          return {
            content: [{ type: "text", text: `Idea 已被 Proposal "${usedIdea.proposalTitle}" 使用` }],
            isError: true,
          };
        }
      }

      const proposal = await proposalService.createProposal({
        companyUuid: auth.companyUuid,
        projectUuid,
        title,
        description,
        inputType,
        inputUuids,
        documentDrafts: documentDrafts || undefined,
        taskDrafts: taskDrafts || undefined,
        createdByUuid: auth.actorUuid,
        createdByType: "agent",
      });

      return {
        content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
      };
    }
  );

  // chorus_pm_submit_proposal - 提交 Proposal 审批
  server.registerTool(
    "chorus_pm_submit_proposal",
    {
      description: "提交 Proposal 进入审批流程（draft → pending）",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
      }),
    },
    async ({ proposalUuid }) => {
      try {
        const proposal = await proposalService.submitProposal(
          proposalUuid,
          auth.companyUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `提交 Proposal 失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_create_document - 创建文档
  server.registerTool(
    "chorus_pm_create_document",
    {
      description: "创建文档（PRD、技术设计、ADR 等）",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        type: z.enum(["prd", "tech_design", "adr", "spec", "guide"]).describe("文档类型"),
        title: z.string().describe("文档标题"),
        content: z.string().optional().describe("文档内容（Markdown）"),
        proposalUuid: z.string().optional().describe("关联的 Proposal UUID（可选）"),
      }),
    },
    async ({ projectUuid, type, title, content, proposalUuid }) => {
      // 验证项目存在
      if (!(await projectExists(auth.companyUuid, projectUuid))) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      // 验证 Proposal 存在（如果提供）
      if (proposalUuid) {
        const proposal = await proposalService.getProposalByUuid(auth.companyUuid, proposalUuid);
        if (!proposal) {
          return { content: [{ type: "text", text: "Proposal 不存在" }], isError: true };
        }
      }

      const document = await documentService.createDocument({
        companyUuid: auth.companyUuid,
        projectUuid,
        type,
        title,
        content: content || null,
        proposalUuid: proposalUuid || null,
        createdByUuid: auth.actorUuid,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(document, null, 2) }],
      };
    }
  );

  // chorus_pm_create_tasks - 批量创建任务
  server.registerTool(
    "chorus_pm_create_tasks",
    {
      description: "批量创建任务（可关联 Proposal）",
      inputSchema: z.object({
        projectUuid: z.string().describe("项目 UUID"),
        proposalUuid: z.string().optional().describe("关联的 Proposal UUID（可选）"),
        tasks: z.array(z.object({
          title: z.string().describe("任务标题"),
          description: z.string().optional().describe("任务描述"),
          priority: z.enum(["low", "medium", "high"]).optional().describe("优先级"),
          storyPoints: z.number().optional().describe("工作量估算（Agent 小时）"),
          acceptanceCriteria: z.string().optional().describe("验收标准（Markdown）"),
        })).describe("任务列表"),
      }),
    },
    async ({ projectUuid, proposalUuid, tasks }) => {
      // 验证项目存在
      if (!(await projectExists(auth.companyUuid, projectUuid))) {
        return { content: [{ type: "text", text: "项目不存在" }], isError: true };
      }

      // 验证 Proposal 存在（如果提供）
      if (proposalUuid) {
        const proposal = await proposalService.getProposalByUuid(auth.companyUuid, proposalUuid);
        if (!proposal) {
          return { content: [{ type: "text", text: "Proposal 不存在" }], isError: true };
        }
      }

      // 批量创建任务
      const createdTasks = await Promise.all(
        tasks.map(task =>
          taskService.createTask({
            companyUuid: auth.companyUuid,
            projectUuid,
            title: task.title,
            description: task.description || null,
            priority: task.priority,
            storyPoints: task.storyPoints || null,
            acceptanceCriteria: task.acceptanceCriteria || null,
            proposalUuid: proposalUuid || null,
            createdByUuid: auth.actorUuid,
          })
        )
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ tasks: createdTasks, count: createdTasks.length }, null, 2) }],
      };
    }
  );

  // chorus_pm_update_document - 更新文档内容
  server.registerTool(
    "chorus_pm_update_document",
    {
      description: "更新文档内容（会增加版本号）",
      inputSchema: z.object({
        documentUuid: z.string().describe("文档 UUID"),
        title: z.string().optional().describe("新标题"),
        content: z.string().optional().describe("新内容（Markdown）"),
      }),
    },
    async ({ documentUuid, title, content }) => {
      const doc = await documentService.getDocument(auth.companyUuid, documentUuid);
      if (!doc) {
        return { content: [{ type: "text", text: "文档不存在" }], isError: true };
      }

      const updated = await documentService.updateDocument(documentUuid, {
        title,
        content,
        incrementVersion: true,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  // ===== Proposal Draft 管理工具 =====

  // chorus_pm_add_document_draft - 添加文档草稿到 Proposal
  server.registerTool(
    "chorus_pm_add_document_draft",
    {
      description: "添加文档草稿到待审批的 Proposal 容器中",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
        type: z.string().describe("文档类型（prd, tech_design, adr, spec, guide）"),
        title: z.string().describe("文档标题"),
        content: z.string().describe("文档内容（Markdown）"),
      }),
    },
    async ({ proposalUuid, type, title, content }) => {
      try {
        const proposal = await proposalService.addDocumentDraft(
          proposalUuid,
          auth.companyUuid,
          { type, title, content }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `添加文档草稿失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_add_task_draft - 添加任务草稿到 Proposal
  server.registerTool(
    "chorus_pm_add_task_draft",
    {
      description: "添加任务草稿到待审批的 Proposal 容器中",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
        title: z.string().describe("任务标题"),
        description: z.string().optional().describe("任务描述"),
        storyPoints: z.number().optional().describe("工作量估算（Agent 小时）"),
        priority: z.enum(["low", "medium", "high"]).optional().describe("优先级"),
        acceptanceCriteria: z.string().optional().describe("验收标准（Markdown）"),
      }),
    },
    async ({ proposalUuid, title, description, storyPoints, priority, acceptanceCriteria }) => {
      try {
        const proposal = await proposalService.addTaskDraft(
          proposalUuid,
          auth.companyUuid,
          { title, description, storyPoints, priority, acceptanceCriteria }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `添加任务草稿失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_update_document_draft - 更新文档草稿
  server.registerTool(
    "chorus_pm_update_document_draft",
    {
      description: "更新 Proposal 中的文档草稿",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
        draftUuid: z.string().describe("文档草稿 UUID"),
        type: z.string().optional().describe("文档类型"),
        title: z.string().optional().describe("文档标题"),
        content: z.string().optional().describe("文档内容（Markdown）"),
      }),
    },
    async ({ proposalUuid, draftUuid, type, title, content }) => {
      try {
        const updates: { type?: string; title?: string; content?: string } = {};
        if (type !== undefined) updates.type = type;
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;

        const proposal = await proposalService.updateDocumentDraft(
          proposalUuid,
          auth.companyUuid,
          draftUuid,
          updates
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `更新文档草稿失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_update_task_draft - 更新任务草稿
  server.registerTool(
    "chorus_pm_update_task_draft",
    {
      description: "更新 Proposal 中的任务草稿",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
        draftUuid: z.string().describe("任务草稿 UUID"),
        title: z.string().optional().describe("任务标题"),
        description: z.string().optional().describe("任务描述"),
        storyPoints: z.number().optional().describe("工作量估算（Agent 小时）"),
        priority: z.enum(["low", "medium", "high"]).optional().describe("优先级"),
        acceptanceCriteria: z.string().optional().describe("验收标准（Markdown）"),
      }),
    },
    async ({ proposalUuid, draftUuid, title, description, storyPoints, priority, acceptanceCriteria }) => {
      try {
        const updates: { title?: string; description?: string; storyPoints?: number; priority?: string; acceptanceCriteria?: string } = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (storyPoints !== undefined) updates.storyPoints = storyPoints;
        if (priority !== undefined) updates.priority = priority;
        if (acceptanceCriteria !== undefined) updates.acceptanceCriteria = acceptanceCriteria;

        const proposal = await proposalService.updateTaskDraft(
          proposalUuid,
          auth.companyUuid,
          draftUuid,
          updates
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `更新任务草稿失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_remove_document_draft - 删除文档草稿
  server.registerTool(
    "chorus_pm_remove_document_draft",
    {
      description: "从 Proposal 中删除文档草稿",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
        draftUuid: z.string().describe("文档草稿 UUID"),
      }),
    },
    async ({ proposalUuid, draftUuid }) => {
      try {
        const proposal = await proposalService.removeDocumentDraft(
          proposalUuid,
          auth.companyUuid,
          draftUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `删除文档草稿失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_remove_task_draft - 删除任务草稿
  server.registerTool(
    "chorus_pm_remove_task_draft",
    {
      description: "从 Proposal 中删除任务草稿",
      inputSchema: z.object({
        proposalUuid: z.string().describe("Proposal UUID"),
        draftUuid: z.string().describe("任务草稿 UUID"),
      }),
    },
    async ({ proposalUuid, draftUuid }) => {
      try {
        const proposal = await proposalService.removeTaskDraft(
          proposalUuid,
          auth.companyUuid,
          draftUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify(proposal, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `删除任务草稿失败: ${error instanceof Error ? error.message : "未知错误"}` }],
          isError: true,
        };
      }
    }
  );

  // chorus_pm_assign_task - 分配任务给 Developer Agent
  server.registerTool(
    "chorus_pm_assign_task",
    {
      description: "将任务分配给指定的 Developer Agent（task 须为 open 或 assigned 状态）",
      inputSchema: z.object({
        taskUuid: z.string().describe("Task UUID"),
        agentUuid: z.string().describe("目标 Developer Agent UUID"),
      }),
    },
    async ({ taskUuid, agentUuid }) => {
      // 验证 task 存在
      const task = await taskService.getTaskByUuid(auth.companyUuid, taskUuid);
      if (!task) {
        return { content: [{ type: "text", text: "Task 不存在" }], isError: true };
      }

      // 验证 task 状态
      if (task.status !== "open" && task.status !== "assigned") {
        return {
          content: [{ type: "text", text: `只能分配 open 或 assigned 状态的 Task，当前状态: ${task.status}` }],
          isError: true,
        };
      }

      // 验证目标 agent 存在且属于同一 company
      const targetAgent = await getAgentByUuid(auth.companyUuid, agentUuid);
      if (!targetAgent) {
        return { content: [{ type: "text", text: "目标 Agent 不存在" }], isError: true };
      }

      // 验证目标 agent 具有 developer 角色
      const hasDeveloperRole = targetAgent.roles.some(
        (r: string) => r === "developer" || r === "developer_agent"
      );
      if (!hasDeveloperRole) {
        return {
          content: [{ type: "text", text: `Agent "${targetAgent.name}" 不具有 developer 角色` }],
          isError: true,
        };
      }

      // 执行分配
      const updated = await taskService.claimTask({
        taskUuid: task.uuid,
        companyUuid: auth.companyUuid,
        assigneeType: "agent",
        assigneeUuid: agentUuid,
        assignedByUuid: auth.actorUuid, // PM Agent 作为分配者
      });

      // 记录 activity
      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        projectUuid: task.projectUuid,
        targetType: "task",
        targetUuid: task.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "assigned",
        value: { assigneeType: "agent", assigneeUuid: agentUuid, assignedBy: auth.actorUuid },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );
}

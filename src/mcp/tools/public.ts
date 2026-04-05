// src/mcp/tools/public.ts
// Public MCP tools - available to all Agents (ARCHITECTURE.md §5.2)
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as researchProjectService from "@/services/research-project.service";
import * as researchQuestionService from "@/services/research-question.service";
import * as documentService from "@/services/document.service";
import * as experimentRunService from "@/services/experiment-run.service";
import * as experimentDesignService from "@/services/experiment-design.service";
import * as activityService from "@/services/activity.service";
import * as commentService from "@/services/comment.service";
import * as assignmentService from "@/services/assignment.service";
import * as notificationService from "@/services/notification.service";
import * as projectGroupService from "@/services/project-group.service";
import * as mentionService from "@/services/mention.service";
import { prisma } from "@/lib/prisma";

export function registerPublicTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_get_research_project - Get research project details and context
  server.registerTool(
    "synapse_get_research_project",
    {
      description: "Get research project details and context",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
      }),
    },
    async ({ researchProjectUuid }) => {
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(project, null, 2) }],
      };
    }
  );

  // synapse_list_research_projects - List all research projects
  server.registerTool(
    "synapse_list_research_projects",
    {
      description: "List all research projects for the current company. Returns projects with counts of research questions, documents, experiment runs, and experiment designs.",
      inputSchema: z.object({
        page: z.number().default(1).describe("Page number"),
        pageSize: z.number().default(20).describe("Items per page"),
      }),
    },
    async ({ page, pageSize }) => {
      const skip = (page - 1) * pageSize;
      const result = await researchProjectService.listResearchProjects({
        companyUuid: auth.companyUuid,
        skip,
        take: pageSize,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // synapse_get_research_questions - Get Research Questions list
  server.registerTool(
    "synapse_get_research_questions",
    {
      description: "Get the list of Research Questions for a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        status: z.string().optional().describe("Filter by status: open, elaborating, proposal_created, completed, closed"),
        page: z.number().optional().default(1).describe("Page number"),
        pageSize: z.number().optional().default(20).describe("Items per page"),
      }),
    },
    async ({ researchProjectUuid, status, page = 1, pageSize = 20 }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { researchQuestions, total } = await researchQuestionService.listResearchQuestions({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        skip,
        take: pageSize,
        status,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ researchQuestions, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // synapse_get_documents - Get Documents list
  server.registerTool(
    "synapse_get_documents",
    {
      description: "Get the list of Documents for a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        type: z.string().optional().describe("Filter by type: prd, tech_design, adr, etc."),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(20),
      }),
    },
    async ({ researchProjectUuid, type, page = 1, pageSize = 20 }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { documents, total } = await documentService.listDocuments({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        skip,
        take: pageSize,
        type,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ documents, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // synapse_get_document - Get single Document details
  server.registerTool(
    "synapse_get_document",
    {
      description: "Get the detailed content of a single Document",
      inputSchema: z.object({
        documentUuid: z.string().describe("Document UUID"),
      }),
    },
    async ({ documentUuid }) => {
      const document = await documentService.getDocument(auth.companyUuid, documentUuid);
      if (!document) {
        return { content: [{ type: "text", text: "Document not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(document, null, 2) }],
      };
    }
  );

  // synapse_get_experiment_designs - Get Experiment Designs list
  server.registerTool(
    "synapse_get_experiment_designs",
    {
      description: "Get the list of Experiment Designs and their statuses for a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        status: z.string().optional().describe("Filter by status: pending, approved, rejected, revised"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(20),
      }),
    },
    async ({ researchProjectUuid, status, page = 1, pageSize = 20 }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { experimentDesigns, total } = await experimentDesignService.listExperimentDesigns({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        skip,
        take: pageSize,
        status,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ experimentDesigns, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // synapse_get_experiment_run - Get Experiment Run details
  server.registerTool(
    "synapse_get_experiment_run",
    {
      description: "Get detailed information and context for a single Experiment Run",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ runUuid }) => {
      const run = await experimentRunService.getExperimentRun(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(run, null, 2) }],
      };
    }
  );

  // synapse_list_experiment_runs - List Experiment Runs
  server.registerTool(
    "synapse_list_experiment_runs",
    {
      description: "List Experiment Runs for a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        status: z.string().optional().describe("Filter by status: open, assigned, in_progress, to_verify, done, closed"),
        priority: z.string().optional().describe("Filter by priority: low, medium, high"),
        experimentDesignUuids: z.array(z.string()).optional().describe("Filter experiment runs by Experiment Design UUIDs"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(20),
      }),
    },
    async ({ researchProjectUuid, status, priority, experimentDesignUuids, page = 1, pageSize = 20 }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { tasks, total } = await experimentRunService.listExperimentRuns({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        skip,
        take: pageSize,
        status,
        priority,
        experimentDesignUuids,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ experimentRuns: tasks, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // synapse_get_activity - Get project activity stream
  server.registerTool(
    "synapse_get_activity",
    {
      description: "Get the activity stream for a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        page: z.number().optional().default(1),
        pageSize: z.number().optional().default(50),
      }),
    },
    async ({ researchProjectUuid, page = 1, pageSize = 50 }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const skip = (page - 1) * pageSize;
      const { activities, total } = await activityService.listActivities({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        skip,
        take: pageSize,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ activities, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // synapse_add_comment - Add a comment
  server.registerTool(
    "synapse_add_comment",
    {
      description: "Add a comment to a Research Question/Experiment/Experiment Design/Experiment Run/Document",
      inputSchema: z.object({
        targetType: z.enum(["research_question", "experiment", "experiment_design", "experiment_run", "document"]).describe("Target type"),
        targetUuid: z.string().describe("Target UUID"),
        content: z.string().describe("Comment content"),
      }),
    },
    async ({ targetType, targetUuid, content }) => {
      try {
        const comment = await commentService.createComment({
          companyUuid: auth.companyUuid,
          targetType,
          targetUuid,
          content,
          authorType: "agent",
          authorUuid: auth.actorUuid,
        });

        // Resolve projectUuid from the target entity
        const projectUuid = await commentService.resolveProjectUuid(targetType, targetUuid);
        if (projectUuid) {
          await activityService.createActivity({
            companyUuid: auth.companyUuid,
            researchProjectUuid: projectUuid,
            targetType: targetType as "research_question" | "experiment" | "experiment_design" | "experiment_run" | "document",
            targetUuid,
            actorType: "agent",
            actorUuid: auth.actorUuid,
            action: "comment_added",
          });
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: comment.uuid, targetType, targetUuid }, null, 2) }],
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          return { content: [{ type: "text", text: `${targetType} not found` }], isError: true };
        }
        throw error;
      }
    }
  );

  // synapse_checkin - Agent heartbeat check-in
  server.registerTool(
    "synapse_checkin",
    {
      description: "Agent check-in. Returns agent identity (including owner/master info), roles, assigned work, and pending counts. Recommended at session start.",
      inputSchema: z.object({}),
    },
    async () => {
      // Update last active time and get Agent info (query by UUID)
      const agent = await prisma.agent.update({
        where: { uuid: auth.actorUuid },
        data: { lastActiveAt: new Date() },
        select: {
          uuid: true,
          name: true,
          roles: true,
          persona: true,
          systemPrompt: true,
          ownerUuid: true,
          owner: { select: { uuid: true, name: true, email: true } },
        },
      });

      // Get pending Research Questions and Experiment Runs
      const { researchQuestions, experimentRuns } = await assignmentService.getMyAssignments(auth, auth.researchProjectUuids);

      // Get unread notification count
      const unreadNotificationCount = await notificationService.getUnreadCount(
        auth.companyUuid,
        auth.type,
        auth.actorUuid
      );

      // Build default persona (if no custom persona is set)
      const defaultPersonas: Record<string, string> = {
        research_lead: `You are an experienced Research Lead Agent. Your responsibilities are:
- Analyze user requirements, distill core research questions
- Transform vague ideas into clear experiment designs
- Break down experiment runs appropriately, estimate compute budget (in agent hours)
- Identify risks and dependencies
- Communicate with the team, drive project progress

Work style: pragmatic, detail-oriented, strong communicator`,
        researcher: `You are a professional Researcher Agent. Your responsibilities are:
- Understand experiment run requirements, execute high-quality research
- Follow project conventions and architecture guidelines
- Report progress promptly after completing experiment runs
- Communicate proactively when encountering issues, avoid making assumptions

Work style: rigorous, efficient, quality-focused`,
      };

      // Determine the effective persona
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
          owner: agent.owner ? { uuid: agent.owner.uuid, name: agent.owner.name, email: agent.owner.email } : null,
        },
        assignments: {
          researchQuestions: researchQuestions.filter((i: { status: string }) => ["assigned", "in_progress"].includes(i.status)),
          experimentRuns: experimentRuns.filter((t: { status: string }) => ["assigned", "in_progress"].includes(t.status)),
        },
        pending: {
          researchQuestionsCount: researchQuestions.length,
          experimentRunsCount: experimentRuns.length,
        },
        notifications: {
          unreadCount: unreadNotificationCount,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // synapse_get_my_assignments - Get own claimed Research Questions + Experiment Runs
  server.registerTool(
    "synapse_get_my_assignments",
    {
      description: "Get all Research Questions and Experiment Runs claimed by the current Agent",
      inputSchema: z.object({}),
    },
    async () => {
      const { researchQuestions, experimentRuns } = await assignmentService.getMyAssignments(auth, auth.researchProjectUuids);

      return {
        content: [{ type: "text", text: JSON.stringify({ researchQuestions, experimentRuns }, null, 2) }],
      };
    }
  );

  // synapse_get_available_research_questions - Get claimable Research Questions
  server.registerTool(
    "synapse_get_available_research_questions",
    {
      description: "Get Research Questions available to claim in a research project (status=open)",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
      }),
    },
    async ({ researchProjectUuid }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const { researchQuestions } = await assignmentService.getAvailableItems(
        auth.companyUuid,
        researchProjectUuid,
        true,
        false
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ researchQuestions }, null, 2) }],
      };
    }
  );

  // synapse_get_available_experiment_runs - Get claimable Experiment Runs
  server.registerTool(
    "synapse_get_available_experiment_runs",
    {
      description: "Get Experiment Runs available to claim in a research project (status=open)",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        experimentDesignUuids: z.array(z.string()).optional().describe("Filter experiment runs by Experiment Design UUIDs"),
      }),
    },
    async ({ researchProjectUuid, experimentDesignUuids }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const { experimentRuns } = await assignmentService.getAvailableItems(
        auth.companyUuid,
        researchProjectUuid,
        false,
        true,
        experimentDesignUuids
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ experimentRuns }, null, 2) }],
      };
    }
  );

  // synapse_get_research_question - Get single Research Question details
  server.registerTool(
    "synapse_get_research_question",
    {
      description: "Get detailed information for a single Research Question",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
      }),
    },
    async ({ researchQuestionUuid }) => {
      const researchQuestion = await researchQuestionService.getResearchQuestion(auth.companyUuid, researchQuestionUuid);
      if (!researchQuestion) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(researchQuestion, null, 2) }],
      };
    }
  );

  // synapse_get_experiment_design - Get single Experiment Design details (including drafts)
  server.registerTool(
    "synapse_get_experiment_design",
    {
      description: "Get detailed information for a single Experiment Design, including document drafts and experiment run drafts",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
      }),
    },
    async ({ experimentDesignUuid }) => {
      // Use getProposal to return the full formatted response, including drafts
      const experimentDesign = await experimentDesignService.getExperimentDesign(auth.companyUuid, experimentDesignUuid);
      if (!experimentDesign) {
        return { content: [{ type: "text", text: "Experiment Design not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(experimentDesign, null, 2) }],
      };
    }
  );

  // synapse_get_unblocked_experiment_runs - Get unblocked experiment runs (all dependencies resolved)
  server.registerTool(
    "synapse_get_unblocked_experiment_runs",
    {
      description: "Get experiment runs that are ready to start — status is open/assigned and all dependencies are resolved (done/to_verify). Useful for discovering what work can begin next after an experiment run completes.",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        experimentDesignUuids: z.array(z.string()).optional().describe("Filter experiment runs by Experiment Design UUIDs"),
      }),
    },
    async ({ researchProjectUuid, experimentDesignUuids }) => {
      // Verify project exists
      const project = await researchProjectService.getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
      if (!project) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      const { tasks, total } = await experimentRunService.getUnblockedExperimentRuns({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        experimentDesignUuids,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ experimentRuns: tasks, total }, null, 2) }],
      };
    }
  );

  // synapse_get_comments - Get comments list
  server.registerTool(
    "synapse_get_comments",
    {
      description: "Get the list of comments for a Research Question/Experiment/Experiment Design/Experiment Run/Document",
      inputSchema: z.object({
        targetType: z.enum(["research_question", "experiment", "experiment_design", "experiment_run", "document"]).describe("Target type"),
        targetUuid: z.string().describe("Target UUID"),
        page: z.number().optional().default(1).describe("Page number"),
        pageSize: z.number().optional().default(20).describe("Items per page"),
      }),
    },
    async ({ targetType, targetUuid, page = 1, pageSize = 20 }) => {
      const skip = (page - 1) * pageSize;
      const { comments, total } = await commentService.listComments({
        companyUuid: auth.companyUuid,
        targetType,
        targetUuid,
        skip,
        take: pageSize,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ comments, total, page, pageSize }, null, 2) }],
      };
    }
  );

  // synapse_get_notifications - Get notifications for the current Agent
  server.registerTool(
    "synapse_get_notifications",
    {
      description: "Get the list of notifications for the current Agent. By default, fetching unread notifications automatically marks them as read. Set autoMarkRead=false to keep them unread.",
      inputSchema: z.object({
        status: z.enum(["unread", "read", "all"]).default("unread").optional().describe("Filter by status"),
        limit: z.number().default(20).optional().describe("Items per page"),
        offset: z.number().default(0).optional().describe("Offset"),
        autoMarkRead: z.boolean().default(true).optional().describe("Automatically mark fetched unread notifications as read (default: true)"),
      }),
    },
    async (params) => {
      const statusValue = params.status ?? "unread";
      const result = await notificationService.list({
        companyUuid: auth.companyUuid,
        recipientType: auth.type,
        recipientUuid: auth.actorUuid,
        readFilter: statusValue === "unread" ? "unread" : statusValue === "read" ? "read" : "all",
        skip: params.offset ?? 0,
        take: params.limit ?? 20,
      });

      // Auto-mark fetched unread notifications as read
      if ((params.autoMarkRead ?? true) && statusValue === "unread" && result.notifications?.length > 0) {
        const unreadUuids = result.notifications
          .filter((n: { readAt?: string | null }) => !n.readAt)
          .map((n: { uuid: string }) => n.uuid);
        if (unreadUuids.length > 0) {
          await Promise.all(
            unreadUuids.map((uuid: string) =>
              notificationService.markRead(uuid, auth.companyUuid, auth.type, auth.actorUuid).catch(() => {})
            )
          );
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // synapse_mark_notification_read - Mark notification(s) as read
  server.registerTool(
    "synapse_mark_notification_read",
    {
      description: "Mark notification(s) as read (single or all)",
      inputSchema: z.object({
        notificationUuid: z.string().optional().describe("Single notification UUID"),
        all: z.boolean().default(false).optional().describe("Whether to mark all as read"),
      }),
    },
    async (params) => {
      if (params.all) {
        await notificationService.markAllRead(auth.companyUuid, auth.type, auth.actorUuid);
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }, null, 2) }] };
      }
      if (!params.notificationUuid) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "notificationUuid or all=true required" }) }], isError: true };
      }
      await notificationService.markRead(params.notificationUuid, auth.companyUuid, auth.type, auth.actorUuid);
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }, null, 2) }] };
    }
  );

  // ===== Project Group Tools =====

  // synapse_get_project_groups - List all project groups
  server.registerTool(
    "synapse_get_project_groups",
    {
      description: "List all project groups for the current company. Returns groups with project counts.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await projectGroupService.listProjectGroups(auth.companyUuid);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // synapse_get_project_group - Get a single project group by UUID
  server.registerTool(
    "synapse_get_project_group",
    {
      description: "Get a single project group by UUID with its projects list.",
      inputSchema: z.object({
        groupUuid: z.string().describe("Project Group UUID"),
      }),
    },
    async ({ groupUuid }) => {
      const group = await projectGroupService.getProjectGroup(auth.companyUuid, groupUuid);
      if (!group) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(group, null, 2) }],
      };
    }
  );

  // synapse_get_group_dashboard - Get aggregated dashboard stats for a project group
  server.registerTool(
    "synapse_get_group_dashboard",
    {
      description: "Get aggregated dashboard stats for a project group (project count, experiment runs, completion rate, research questions, experiment designs, activity stream).",
      inputSchema: z.object({
        groupUuid: z.string().describe("Project Group UUID"),
      }),
    },
    async ({ groupUuid }) => {
      const dashboard = await projectGroupService.getGroupDashboard(auth.companyUuid, groupUuid);
      if (!dashboard) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }],
      };
    }
  );

  // synapse_search_mentionables - Search for @mentionable users and agents
  server.registerTool(
    "synapse_search_mentionables",
    {
      description: "Search for users and agents that can be @mentioned. Returns name, type, and UUID. Use the UUID to write mentions as @[Name](type:uuid) in comment/description text.",
      inputSchema: z.object({
        query: z.string().describe("Name or keyword to search"),
        limit: z.number().optional().default(10).describe("Max results to return (default 10)"),
      }),
    },
    async ({ query, limit }) => {
      const results = await mentionService.searchMentionables({
        companyUuid: auth.companyUuid,
        query,
        actorType: auth.type,
        actorUuid: auth.actorUuid,
        ownerUuid: auth.ownerUuid,
        limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );
}

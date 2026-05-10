// src/mcp/tools/pi.ts
// PI Agent exclusive MCP tools (ARCHITECTURE.md S5.2)
// PI Agent acts on behalf of humans for approvals, verification, and research project management
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as researchProjectService from "@/services/research-project.service";
import * as researchQuestionService from "@/services/research-question.service";
import * as documentService from "@/services/document.service";
import * as activityService from "@/services/activity.service";
import * as projectGroupService from "@/services/project-group.service";
import * as baselineService from "@/services/baseline.service";

export function registerAdminTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_create_research_project - Create a new research project
  server.registerTool(
    "synapse_create_research_project",
    {
      description: "Create a new research project (PI exclusive, acts on behalf of humans). To assign to a project group, first call synapse_get_project_groups to list available groups, then pass projectGroupUuid (or the alias groupUuid).",
      inputSchema: z.object({
        name: z.string().describe("Research Project name"),
        description: z.string().optional().describe("Research Project description"),
        projectGroupUuid: z
          .string()
          .optional()
          .describe("Optional project group UUID to assign this project to. Use synapse_get_project_groups to list available groups."),
        groupUuid: z
          .string()
          .optional()
          .describe("Alias for projectGroupUuid (deprecated). If both are provided, projectGroupUuid wins."),
      }),
    },
    async ({ name, description, projectGroupUuid, groupUuid }) => {
      // F-031: accept `projectGroupUuid` as the canonical name; keep `groupUuid` as a deprecated alias.
      // If both are provided, `projectGroupUuid` wins.
      const resolvedGroupUuid = projectGroupUuid ?? groupUuid ?? null;
      const project = await researchProjectService.createResearchProject({
        companyUuid: auth.companyUuid,
        name,
        description: description || null,
        groupUuid: resolvedGroupUuid,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: project.uuid, name: project.name, groupUuid: project.groupUuid }) }],
      };
    }
  );

  server.registerTool(
    "synapse_review_research_question",
    {
      description: "Review a research idea and either accept it into the execution pipeline or reject it back out of scope.",
      inputSchema: z.object({
        researchQuestionUuid: z.string(),
        decision: z.enum(["accepted", "rejected"]),
        reviewNote: z.string().optional(),
      }),
    },
    async ({ researchQuestionUuid, decision, reviewNote }) => {
      const question = await researchQuestionService.getResearchQuestionByUuid(auth.companyUuid, researchQuestionUuid);
      if (!question) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }

      const updated = await researchQuestionService.reviewResearchQuestion(
        auth.companyUuid,
        researchQuestionUuid,
        decision,
        auth.actorUuid,
        reviewNote || null,
      );

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: question.researchProjectUuid,
        targetType: "research_question",
        targetUuid: researchQuestionUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: decision === "accepted" ? "approved" : "rejected",
        value: reviewNote ? { reviewNote } : undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  // synapse_delete_research_question - Delete a Research Question
  server.registerTool(
    "synapse_delete_research_question",
    {
      description: "Delete a Research Question (PI exclusive, can delete any Research Question)",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
      }),
    },
    async ({ researchQuestionUuid }) => {
      const researchQuestion = await researchQuestionService.getResearchQuestionByUuid(auth.companyUuid, researchQuestionUuid);
      if (!researchQuestion) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }

      await researchQuestionService.deleteResearchQuestion(researchQuestionUuid);

      return {
        content: [{ type: "text", text: `Research Question ${researchQuestionUuid} deleted` }],
      };
    }
  );

  // synapse_delete_document - Delete a Document
  server.registerTool(
    "synapse_delete_document",
    {
      description: "Delete a Document (PI exclusive, can delete any Document)",
      inputSchema: z.object({
        documentUuid: z.string().describe("Document UUID"),
      }),
    },
    async ({ documentUuid }) => {
      const doc = await documentService.getDocument(auth.companyUuid, documentUuid);
      if (!doc) {
        return { content: [{ type: "text", text: "Document not found" }], isError: true };
      }

      await documentService.deleteDocument(documentUuid);

      return {
        content: [{ type: "text", text: `Document ${documentUuid} deleted` }],
      };
    }
  );

  // synapse_close_research_question - Close a Research Question (any -> closed)
  server.registerTool(
    "synapse_close_research_question",
    {
      description: "Close a Research Question (any status -> closed, PI exclusive)",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
      }),
    },
    async ({ researchQuestionUuid }) => {
      const researchQuestion = await researchQuestionService.getResearchQuestionByUuid(auth.companyUuid, researchQuestionUuid);
      if (!researchQuestion) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }

      if (researchQuestion.status === "closed") {
        return { content: [{ type: "text", text: "Research Question is already in closed status" }], isError: true };
      }

      const updated = await researchQuestionService.updateResearchQuestion(researchQuestionUuid, auth.companyUuid, { status: "closed" });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: researchQuestion.researchProjectUuid,
        targetType: "research_question",
        targetUuid: researchQuestionUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "closed",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }) }],
      };
    }
  );

  // ===== Project Group PI Tools =====

  // synapse_create_project_group - Create a new project group
  server.registerTool(
    "synapse_create_project_group",
    {
      description: "Create a new project group (PI exclusive)",
      inputSchema: z.object({
        name: z.string().describe("Project group name"),
        description: z.string().optional().describe("Project group description"),
      }),
    },
    async ({ name, description }) => {
      const group = await projectGroupService.createProjectGroup({
        companyUuid: auth.companyUuid,
        name,
        description: description || null,
      });

      // F-042: mirror the `get_project_group` shape so callers see a
      // consistent record (always carries a `projects` array — empty on create).
      return {
        content: [{ type: "text", text: JSON.stringify({ ...group, projects: [] }, null, 2) }],
      };
    }
  );

  // synapse_update_project_group - Update a project group
  server.registerTool(
    "synapse_update_project_group",
    {
      description: "Update a project group (PI exclusive)",
      inputSchema: z.object({
        groupUuid: z.string().describe("Project Group UUID"),
        name: z.string().optional().describe("New group name"),
        description: z.string().optional().describe("New group description"),
      }),
    },
    async ({ groupUuid, name, description }) => {
      const updated = await projectGroupService.updateProjectGroup({
        companyUuid: auth.companyUuid,
        groupUuid,
        name,
        description,
      });

      if (!updated) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }

      // F-042: re-fetch with projects list so the response shape matches
      // `synapse_create_project_group` and `synapse_get_project_group`.
      const detail = await projectGroupService.getProjectGroup(auth.companyUuid, groupUuid);
      const response = detail ?? { ...updated, projects: [] };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  // synapse_delete_project_group - Delete a project group
  server.registerTool(
    "synapse_delete_project_group",
    {
      description: "Delete a project group (PI exclusive). By default refuses if the group contains projects. Pass force=true to cascade-delete all child projects.",
      inputSchema: z.object({
        groupUuid: z.string().describe("Project Group UUID"),
        force: z
          .boolean()
          .optional()
          .describe("If true, cascade-delete all child projects instead of refusing."),
      }),
    },
    async ({ groupUuid, force }) => {
      const group = await projectGroupService.getProjectGroup(auth.companyUuid, groupUuid);
      if (!group) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }

      if (group.projectCount > 0 && !force) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot delete project group with ${group.projectCount} project(s). Pass force=true to cascade-delete child projects, or move them first with synapse_move_research_project_to_group.`,
            },
          ],
          isError: true,
        };
      }

      // If force=true, cascade-delete each child project through the project-delete service
      // so that per-project cleanup semantics apply (e.g. unsetting parentQuestionUuid).
      if (group.projectCount > 0 && force) {
        for (const project of group.projects) {
          await researchProjectService.deleteResearchProject(project.uuid);
        }
      }

      const deleted = await projectGroupService.deleteProjectGroup(auth.companyUuid, groupUuid);
      if (!deleted) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }

      return {
        content: [
          {
            type: "text",
            text:
              group.projectCount > 0 && force
                ? `Project group ${groupUuid} and ${group.projectCount} child project(s) deleted`
                : `Project group ${groupUuid} deleted`,
          },
        ],
      };
    }
  );

  // synapse_move_research_project_to_group - Move a research project to a group or ungroup it
  server.registerTool(
    "synapse_move_research_project_to_group",
    {
      description: "Move a research project to a different group or ungroup it (PI exclusive). Set groupUuid to null to ungroup.",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        groupUuid: z.string().nullable().describe("Target Project Group UUID (null to ungroup)"),
      }),
    },
    async ({ researchProjectUuid, groupUuid }) => {
      const result = await projectGroupService.moveProjectToGroup(
        auth.companyUuid,
        researchProjectUuid,
        groupUuid
      );

      if (!result) {
        return { content: [{ type: "text", text: "Research Project or project group not found" }], isError: true };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ===== Research Verification Tools =====
  // F-037: `synapse_verify_reproducibility` was removed. It was tied to the
  // legacy ExperimentRegistry, which is not created for new Experiments.
  // The underlying `experimentRegistryService.markReproducible` is still
  // reachable via the legacy `/api/experiment-runs/[uuid]/registry` route.

  // synapse_set_active_baseline — Set which baseline is the current active one
  server.registerTool(
    "synapse_set_active_baseline",
    {
      description: "Set the active baseline for a research project (deactivates all others)",
      inputSchema: z.object({
        baselineUuid: z.string(),
      }),
    },
    async (params) => {
      const result = await baselineService.setActiveBaseline(auth.companyUuid, params.baselineUuid);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}

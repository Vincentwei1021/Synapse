// src/mcp/tools/pi.ts
// PI Agent exclusive MCP tools (ARCHITECTURE.md S5.2)
// PI Agent acts on behalf of humans for approvals, verification, and research project management
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as researchProjectService from "@/services/research-project.service";
import * as experimentDesignService from "@/services/experiment-design.service";
import * as experimentRunService from "@/services/experiment-run.service";
import * as researchQuestionService from "@/services/research-question.service";
import * as documentService from "@/services/document.service";
import * as activityService from "@/services/activity.service";
import * as projectGroupService from "@/services/project-group.service";

export function registerPiTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_pi_create_research_project - Create a new research project
  server.registerTool(
    "synapse_pi_create_research_project",
    {
      description: "Create a new research project (PI exclusive, acts on behalf of humans). To assign to a project group, first call synapse_get_project_groups to list available groups, then pass the groupUuid.",
      inputSchema: z.object({
        name: z.string().describe("Research Project name"),
        description: z.string().optional().describe("Research Project description"),
        groupUuid: z.string().optional().describe("Optional project group UUID to assign this project to. Use synapse_get_project_groups to list available groups."),
      }),
    },
    async ({ name, description, groupUuid }) => {
      const project = await researchProjectService.createResearchProject({
        companyUuid: auth.companyUuid,
        name,
        description: description || null,
        groupUuid: groupUuid || null,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: project.uuid, name: project.name, groupUuid: project.groupUuid }) }],
      };
    }
  );

  // synapse_pi_create_research_question moved to research-lead.ts as synapse_research_lead_create_research_question

  // synapse_pi_approve_experiment_design - Approve an Experiment Design
  server.registerTool(
    "synapse_pi_approve_experiment_design",
    {
      description: "Approve an Experiment Design (PI exclusive, acts on behalf of humans). On approval, documentDrafts and taskDrafts in the Experiment Design are automatically materialized into real Document and Experiment Run entities -- no need to manually call create_document/create_experiment_runs.",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        reviewNote: z.string().optional().describe("Review note"),
      }),
    },
    async ({ experimentDesignUuid, reviewNote }) => {
      const experimentDesign = await experimentDesignService.getExperimentDesignByUuid(auth.companyUuid, experimentDesignUuid);
      if (!experimentDesign) {
        return { content: [{ type: "text", text: "Experiment Design not found" }], isError: true };
      }

      if (experimentDesign.status !== "pending") {
        return { content: [{ type: "text", text: `Can only approve pending Experiment Designs, current status: ${experimentDesign.status}` }], isError: true };
      }

      const updated = await experimentDesignService.approveExperimentDesign(
        experimentDesignUuid,
        auth.companyUuid,
        auth.actorUuid,  // PI Agent as reviewer
        reviewNote || null
      );

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: experimentDesign.researchProjectUuid,
        targetType: "experiment_design",
        targetUuid: experimentDesignUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "approved",
        value: reviewNote ? { reviewNote } : undefined,
      });

      const result: Record<string, unknown> = { uuid: updated.uuid, status: updated.status };
      if (updated.materializedTasks) result.materializedExperimentRuns = updated.materializedTasks;
      if (updated.materializedDocuments) result.materializedDocuments = updated.materializedDocuments;

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // synapse_pi_reject_experiment_design - Reject an Experiment Design (returns to draft for re-editing)
  server.registerTool(
    "synapse_pi_reject_experiment_design",
    {
      description: "Reject an Experiment Design (PI exclusive, acts on behalf of humans). After rejection, the Experiment Design returns to draft status and can be re-edited and resubmitted. The reviewNote is preserved as reference for revisions.",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        reviewNote: z.string().describe("Rejection reason (required, serves as revision reference)"),
      }),
    },
    async ({ experimentDesignUuid, reviewNote }) => {
      const experimentDesign = await experimentDesignService.getExperimentDesignByUuid(auth.companyUuid, experimentDesignUuid);
      if (!experimentDesign) {
        return { content: [{ type: "text", text: "Experiment Design not found" }], isError: true };
      }

      if (experimentDesign.status !== "pending") {
        return { content: [{ type: "text", text: `Can only reject pending Experiment Designs, current status: ${experimentDesign.status}` }], isError: true };
      }

      const updated = await experimentDesignService.rejectExperimentDesign(
        experimentDesignUuid,
        auth.actorUuid,  // PI Agent as reviewer
        reviewNote
      );

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: experimentDesign.researchProjectUuid,
        targetType: "experiment_design",
        targetUuid: experimentDesignUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "rejected_to_draft",
        value: { reviewNote },
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }) }],
      };
    }
  );

  // synapse_pi_close_experiment_design - Close an Experiment Design (terminal state)
  server.registerTool(
    "synapse_pi_close_experiment_design",
    {
      description: "Close an Experiment Design (PI exclusive, permanently closes the experiment design). After closing, the Experiment Design enters the closed terminal state and cannot be edited.",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        reviewNote: z.string().describe("Reason for closing (required)"),
      }),
    },
    async ({ experimentDesignUuid, reviewNote }) => {
      const experimentDesign = await experimentDesignService.getExperimentDesignByUuid(auth.companyUuid, experimentDesignUuid);
      if (!experimentDesign) {
        return { content: [{ type: "text", text: "Experiment Design not found" }], isError: true };
      }

      if (experimentDesign.status !== "pending") {
        return { content: [{ type: "text", text: `Can only close pending Experiment Designs, current status: ${experimentDesign.status}` }], isError: true };
      }

      const updated = await experimentDesignService.closeExperimentDesign(
        experimentDesignUuid,
        auth.actorUuid,
        reviewNote
      );

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: experimentDesign.researchProjectUuid,
        targetType: "experiment_design",
        targetUuid: experimentDesignUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "closed",
        value: { reviewNote },
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }) }],
      };
    }
  );

  // synapse_pi_verify_experiment_run - Verify an Experiment Run (to_verify -> done)
  server.registerTool(
    "synapse_pi_verify_experiment_run",
    {
      description: "Verify an Experiment Run (to_verify -> done, PI exclusive, acts on behalf of humans)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ runUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      if (run.status !== "to_verify") {
        return { content: [{ type: "text", text: `Can only verify Experiment Runs in to_verify status, current status: ${run.status}` }], isError: true };
      }

      // Check acceptance criteria gate
      const gate = await experimentRunService.checkAcceptanceCriteriaGate(run.uuid);
      if (!gate.allowed) {
        return { content: [{ type: "text", text: `Cannot verify experiment run: ${gate.reason}` }], isError: true };
      }

      const updated = await experimentRunService.updateExperimentRun(run.uuid, { status: "done" });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "verified",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }) }],
      };
    }
  );

  // synapse_pi_reopen_experiment_run - Reopen an Experiment Run (to_verify -> in_progress)
  server.registerTool(
    "synapse_pi_reopen_experiment_run",
    {
      description: "Reopen an Experiment Run (to_verify -> in_progress, used when verification fails). If the experiment run has unresolved dependencies, use force=true to bypass the dependency check.",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        force: z.boolean().optional().describe("Force status change, bypassing dependency check"),
      }),
    },
    async ({ runUuid, force }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      if (run.status !== "to_verify") {
        return { content: [{ type: "text", text: `Can only reopen Experiment Runs in to_verify status, current status: ${run.status}` }], isError: true };
      }

      // Check dependencies unless force is true
      if (force !== true) {
        const depCheck = await experimentRunService.checkDependenciesResolved(run.uuid);
        if (!depCheck.resolved) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: "blocked_by_dependencies",
                message: `Experiment Run is blocked by ${depCheck.blockers.length} unresolved dependency(ies). Use force=true to bypass.`,
                blockers: depCheck.blockers,
              }),
            }],
            isError: true,
          };
        }
      }

      const updated = await experimentRunService.updateExperimentRun(run.uuid, { status: "in_progress" });

      // Log force_status_change activity when force is used
      if (force === true) {
        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: run.researchProjectUuid,
          targetType: "experiment_run",
          targetUuid: run.uuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "force_status_change",
          value: { status: "in_progress", force: true },
        });
      }

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "reopened",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }) }],
      };
    }
  );

  // synapse_mark_acceptance_criteria - Mark acceptance criteria as passed or failed
  server.registerTool(
    "synapse_mark_acceptance_criteria",
    {
      description: "Mark acceptance criteria as passed or failed (PI verification)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        criteria: z.array(z.object({
          uuid: z.string().describe("AcceptanceCriterion UUID"),
          status: z.enum(["passed", "failed"]).describe("Verification result"),
          evidence: z.string().optional().describe("Optional evidence/notes"),
        })).describe("Criteria verification results (batch)"),
      }),
    },
    async ({ runUuid, criteria }) => {
      const result = await experimentRunService.markAcceptanceCriteria(
        auth.companyUuid,
        runUuid,
        criteria,
        { type: auth.type, actorUuid: auth.actorUuid },
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // synapse_pi_close_experiment_run - Close an Experiment Run (any -> closed)
  server.registerTool(
    "synapse_pi_close_experiment_run",
    {
      description: "Close an Experiment Run (any status -> closed, PI exclusive)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ runUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      if (run.status === "closed") {
        return { content: [{ type: "text", text: "Experiment Run is already in closed status" }], isError: true };
      }

      const updated = await experimentRunService.updateExperimentRun(run.uuid, { status: "closed" });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "closed",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }) }],
      };
    }
  );

  // synapse_pi_delete_research_question - Delete a Research Question
  server.registerTool(
    "synapse_pi_delete_research_question",
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

  // synapse_pi_delete_experiment_run - Delete an Experiment Run
  server.registerTool(
    "synapse_pi_delete_experiment_run",
    {
      description: "Delete an Experiment Run (PI exclusive, can delete any Experiment Run)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ runUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      await experimentRunService.deleteExperimentRun(runUuid);

      return {
        content: [{ type: "text", text: `Experiment Run ${runUuid} deleted` }],
      };
    }
  );

  // synapse_pi_delete_document - Delete a Document
  server.registerTool(
    "synapse_pi_delete_document",
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

  // synapse_pi_close_research_question - Close a Research Question (any -> closed)
  server.registerTool(
    "synapse_pi_close_research_question",
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

  // synapse_pi_create_project_group - Create a new project group
  server.registerTool(
    "synapse_pi_create_project_group",
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

      return {
        content: [{ type: "text", text: JSON.stringify(group, null, 2) }],
      };
    }
  );

  // synapse_pi_update_project_group - Update a project group
  server.registerTool(
    "synapse_pi_update_project_group",
    {
      description: "Update a project group (PI exclusive)",
      inputSchema: z.object({
        groupUuid: z.string().describe("Project Group UUID"),
        name: z.string().optional().describe("New group name"),
        description: z.string().optional().describe("New group description"),
      }),
    },
    async ({ groupUuid, name, description }) => {
      const group = await projectGroupService.updateProjectGroup({
        companyUuid: auth.companyUuid,
        groupUuid,
        name,
        description,
      });

      if (!group) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(group, null, 2) }],
      };
    }
  );

  // synapse_pi_delete_project_group - Delete a project group
  server.registerTool(
    "synapse_pi_delete_project_group",
    {
      description: "Delete a project group (PI exclusive). Projects in the group become ungrouped.",
      inputSchema: z.object({
        groupUuid: z.string().describe("Project Group UUID"),
      }),
    },
    async ({ groupUuid }) => {
      const deleted = await projectGroupService.deleteProjectGroup(auth.companyUuid, groupUuid);

      if (!deleted) {
        return { content: [{ type: "text", text: "Project group not found" }], isError: true };
      }

      return {
        content: [{ type: "text", text: `Project group ${groupUuid} deleted` }],
      };
    }
  );

  // synapse_pi_move_research_project_to_group - Move a research project to a group or ungroup it
  server.registerTool(
    "synapse_pi_move_research_project_to_group",
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
}

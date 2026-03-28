// src/mcp/tools/research-lead.ts
// Research Lead Agent MCP Tools (ARCHITECTURE.md §5.2)
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { prisma } from "@/lib/prisma";
import { getResearchProjectByUuid, researchProjectExists } from "@/services/research-project.service";
import * as researchQuestionService from "@/services/research-question.service";
import * as experimentDesignService from "@/services/experiment-design.service";
import * as documentService from "@/services/document.service";
import * as experimentRunService from "@/services/experiment-run.service";
import * as activityService from "@/services/activity.service";
import * as hypothesisFormulationService from "@/services/hypothesis-formulation.service";
import * as baselineService from "@/services/baseline.service";
import { getAgentByUuid } from "@/services/agent.service";
import { AlreadyClaimedError, NotClaimedError } from "@/lib/errors";
import { zArray } from "./schema-utils";
import {
  createMcpTool,
  defineMcpTools,
  jsonTextResult,
  registerMcpTools,
  textResult,
} from "./tool-registry";

export function registerResearchLeadTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_claim_research_question - Claim a Research Question
  server.registerTool(
    "synapse_claim_research_question",
    {
      description: "Claim a Research Question (open -> elaborating). Claiming automatically transitions the Research Question to 'elaborating' status. After claiming, start hypothesis formulation with synapse_research_lead_start_hypothesis_formulation or skip with synapse_research_lead_skip_hypothesis_formulation.",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
      }),
    },
    async ({ researchQuestionUuid }) => {
      const researchQuestion = await researchQuestionService.getResearchQuestionByUuid(auth.companyUuid, researchQuestionUuid);
      if (!researchQuestion) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }

      try {
        const updated = await researchQuestionService.claimResearchQuestion({
          researchQuestionUuid: researchQuestion.uuid,
          companyUuid: auth.companyUuid,
          assigneeType: "agent",
          assigneeUuid: auth.actorUuid,
        });

        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: researchQuestion.researchProjectUuid,
          targetType: "research_question",
          targetUuid: researchQuestion.uuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "assigned",
          value: { assigneeType: "agent", assigneeUuid: auth.actorUuid },
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
        };
      } catch (e) {
        if (e instanceof AlreadyClaimedError) {
          return { content: [{ type: "text", text: "Can only claim Research Questions with open status" }], isError: true };
        }
        throw e;
      }
    }
  );

  // synapse_release_research_question - Release a claimed Research Question
  server.registerTool(
    "synapse_release_research_question",
    {
      description: "Release a claimed Research Question (assigned -> open)",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
      }),
    },
    async ({ researchQuestionUuid }) => {
      const researchQuestion = await researchQuestionService.getResearchQuestionByUuid(auth.companyUuid, researchQuestionUuid);
      if (!researchQuestion) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }

      // Check if the caller is the assignee (UUID comparison)
      const isAssignee =
        (researchQuestion.assigneeType === "agent" && researchQuestion.assigneeUuid === auth.actorUuid) ||
        (researchQuestion.assigneeType === "user" && auth.ownerUuid && researchQuestion.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "Only the assignee can release a claimed Research Question" }], isError: true };
      }

      try {
        const updated = await researchQuestionService.releaseResearchQuestion(researchQuestion.uuid);

        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: researchQuestion.researchProjectUuid,
          targetType: "research_question",
          targetUuid: researchQuestion.uuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "released",
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
        };
      } catch (e) {
        if (e instanceof NotClaimedError) {
          return { content: [{ type: "text", text: "Can only release Research Questions with assigned status" }], isError: true };
        }
        throw e;
      }
    }
  );

  // synapse_update_research_question_status - Update Research Question status
  server.registerTool(
    "synapse_update_research_question_status",
    {
      description: "Update Research Question status (only assignee can operate). Valid statuses: open, elaborating, proposal_created, completed, closed. Claiming auto-transitions to elaborating; use this tool for proposal_created (after Experiment Design submission) or completed (after approval).",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
        status: z
          .enum(["elaborating", "proposal_created", "completed", "in_progress", "pending_review"])
          .describe("New status"),
      }),
    },
    async ({ researchQuestionUuid, status }) => {
      const researchQuestion = await researchQuestionService.getResearchQuestionByUuid(auth.companyUuid, researchQuestionUuid);
      if (!researchQuestion) {
        return { content: [{ type: "text", text: "Research Question not found" }], isError: true };
      }

      // Check if the caller is the assignee (UUID comparison)
      const isAssignee =
        (researchQuestion.assigneeType === "agent" && researchQuestion.assigneeUuid === auth.actorUuid) ||
        (researchQuestion.assigneeType === "user" && auth.ownerUuid && researchQuestion.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "Only the assignee can update the status" }], isError: true };
      }

      const normalizedStatus =
        status === "in_progress"
          ? "elaborating"
          : status === "pending_review"
            ? "proposal_created"
            : status;

      // Validate status transition
      if (!researchQuestionService.isValidResearchQuestionStatusTransition(researchQuestion.status, normalizedStatus)) {
        return {
          content: [{ type: "text", text: `Invalid status transition: ${researchQuestion.status} -> ${normalizedStatus}` }],
          isError: true,
        };
      }

      const updated = await researchQuestionService.updateResearchQuestion(researchQuestion.uuid, auth.companyUuid, { status: normalizedStatus });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: researchQuestion.researchProjectUuid,
        targetType: "research_question",
        targetUuid: researchQuestion.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "status_changed",
        value: { status: normalizedStatus },
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
      };
    }
  );

  // synapse_research_lead_create_experiment_design - Create an Experiment Design (container model)
  server.registerTool(
    "synapse_research_lead_create_experiment_design",
    {
      description: "Create an empty Experiment Design container. Use synapse_research_lead_add_document_draft and synapse_research_lead_add_experiment_run_draft to populate it afterwards.",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        title: z.string().describe("Experiment Design title"),
        description: z.string().optional().describe("Experiment Design description"),
        inputType: z.enum(["research_question", "document"]).describe("Input source type"),
        inputUuids: zArray(z.string()).describe("Input UUID list"),
      }),
    },
    async ({ researchProjectUuid, title, description, inputType, inputUuids }) => {
      // Validate project exists
      if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      // If input type is research_question, validate assignee
      let reusedWarning = "";
      if (inputType === "research_question") {
        const assigneeCheck = await experimentDesignService.checkResearchQuestionsAssignee(
          auth.companyUuid,
          inputUuids,
          auth.actorUuid,
          "agent"
        );
        if (!assigneeCheck.valid) {
          return {
            content: [{ type: "text", text: "Can only create Experiment Designs based on Research Questions you have claimed" }],
            isError: true,
          };
        }

        // Check if research questions are already used by other experiment designs (informational only, not blocking)
        const availabilityCheck = await experimentDesignService.checkResearchQuestionsAvailability(
          auth.companyUuid,
          inputUuids
        );
        reusedWarning = !availabilityCheck.available
          ? `\nNote: Research Question is also referenced by existing Experiment Design(s): ${availabilityCheck.usedResearchQuestions.map((u: { proposalTitle: string }) => `"${u.proposalTitle}"`).join(", ")}`
          : "";
      }

      const experimentDesign = await experimentDesignService.createExperimentDesign({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        title,
        description,
        inputType,
        inputUuids,
        createdByUuid: auth.actorUuid,
        createdByType: "agent",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: experimentDesign.uuid, title: experimentDesign.title, status: experimentDesign.status }, null, 2) + reusedWarning }],
      };
    }
  );

  // synapse_research_lead_validate_experiment_design - Validate Experiment Design completeness
  server.registerTool(
    "synapse_research_lead_validate_experiment_design",
    {
      description: "Validate an Experiment Design's completeness before submission. Returns errors (block submission), warnings (advisory), and info (hints). Call this before synapse_research_lead_submit_experiment_design to preview issues.",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID to validate"),
      }),
    },
    async ({ experimentDesignUuid }) => {
      try {
        const result = await experimentDesignService.validateExperimentDesign(
          auth.companyUuid,
          experimentDesignUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to validate Experiment Design: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_submit_experiment_design - Submit Experiment Design for approval
  server.registerTool(
    "synapse_research_lead_submit_experiment_design",
    {
      description: "Submit an Experiment Design for approval (draft -> pending). Requires all input Research Questions to have elaborationStatus = 'resolved'. Call synapse_research_lead_start_hypothesis_formulation or synapse_research_lead_skip_hypothesis_formulation first to resolve hypothesis formulation before submitting.",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
      }),
    },
    async ({ experimentDesignUuid }) => {
      try {
        const experimentDesign = await experimentDesignService.submitExperimentDesign(
          experimentDesignUuid,
          auth.companyUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: experimentDesign.uuid, status: experimentDesign.status }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to submit Experiment Design: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_create_document - Create a document
  server.registerTool(
    "synapse_research_lead_create_document",
    {
      description: "Create a document (PRD, tech design, ADR, spec, guide, etc.)",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        type: z.enum(["prd", "tech_design", "adr", "spec", "guide"]).describe("Document type"),
        title: z.string().describe("Document title"),
        content: z.string().optional().describe("Document content (Markdown)"),
        experimentDesignUuid: z.string().optional().describe("Associated Experiment Design UUID (optional)"),
      }),
    },
    async ({ researchProjectUuid, type, title, content, experimentDesignUuid }) => {
      // Validate project exists
      if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      // Validate Experiment Design exists (if provided)
      if (experimentDesignUuid) {
        const experimentDesign = await experimentDesignService.getExperimentDesignByUuid(auth.companyUuid, experimentDesignUuid);
        if (!experimentDesign) {
          return { content: [{ type: "text", text: "Experiment Design not found" }], isError: true };
        }
      }

      const document = await documentService.createDocument({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        type,
        title,
        content: content || null,
        experimentDesignUuid: experimentDesignUuid || null,
        createdByUuid: auth.actorUuid,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: document.uuid, title: document.title, type: document.type }, null, 2) }],
      };
    }
  );

  // synapse_research_lead_create_experiment_runs - Batch create experiment runs
  server.registerTool(
    "synapse_research_lead_create_experiment_runs",
    {
      description: "Batch create experiment runs (can associate with an Experiment Design, supports intra-batch dependencies)",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        experimentDesignUuid: z.string().optional().describe("Associated Experiment Design UUID (optional)"),
        experimentRuns: zArray(z.object({
          title: z.string().describe("Experiment Run title"),
          description: z.string().optional().describe("Experiment Run description"),
          priority: z.enum(["low", "medium", "high"]).optional().describe("Priority"),
          computeBudgetHours: z.number().optional().describe("Effort estimate (agent hours)"),
          acceptanceCriteriaItems: zArray(z.object({
            description: z.string().describe("Criterion description"),
            required: z.boolean().optional().describe("Whether this criterion is required (default: true)"),
          })).optional().describe("Structured acceptance criteria items"),
          draftUuid: z.string().optional().describe("Temporary UUID for intra-batch dependsOnDraftUuids references"),
          dependsOnDraftUuids: zArray(z.string()).optional().describe("Dependent draftUuid list within this batch"),
          dependsOnRunUuids: zArray(z.string()).optional().describe("Dependent existing Experiment Run UUID list"),
        })).describe("Experiment Run list"),
      }),
    },
    async ({ researchProjectUuid, experimentDesignUuid, experimentRuns }) => {
      // Validate project exists
      if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
        return { content: [{ type: "text", text: "Research Project not found" }], isError: true };
      }

      // Validate Experiment Design exists (if provided)
      if (experimentDesignUuid) {
        const experimentDesign = await experimentDesignService.getExperimentDesignByUuid(auth.companyUuid, experimentDesignUuid);
        if (!experimentDesign) {
          return { content: [{ type: "text", text: "Experiment Design not found" }], isError: true };
        }
      }

      // 1. Batch create experiment runs
      const createdRuns = await Promise.all(
        experimentRuns.map(run =>
          experimentRunService.createExperimentRun({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            title: run.title,
            description: run.description || null,
            priority: run.priority,
            computeBudgetHours: run.computeBudgetHours ?? null,
            experimentDesignUuid: experimentDesignUuid || null,
            createdByUuid: auth.actorUuid,
          })
        )
      );

      // 2. Build draftUuid -> realUuid map
      const draftToRunUuidMap: Record<string, string> = {};
      for (let i = 0; i < experimentRuns.length; i++) {
        if (experimentRuns[i].draftUuid) {
          draftToRunUuidMap[experimentRuns[i].draftUuid!] = createdRuns[i].uuid;
        }
      }

      // 3. Create dependencies
      const warnings: string[] = [];
      for (let i = 0; i < experimentRuns.length; i++) {
        const run = experimentRuns[i];
        const realUuid = createdRuns[i].uuid;

        // Handle dependsOnDraftUuids (intra-batch dependencies)
        if (run.dependsOnDraftUuids) {
          for (const draftUuid of run.dependsOnDraftUuids) {
            const depRealUuid = draftToRunUuidMap[draftUuid];
            if (!depRealUuid) {
              warnings.push(`Experiment Run "${run.title}": draftUuid "${draftUuid}" not found in this batch`);
              continue;
            }
            try {
              await experimentRunService.addRunDependency(auth.companyUuid, realUuid, depRealUuid);
            } catch (error) {
              warnings.push(`Experiment Run "${run.title}" -> draftUuid "${draftUuid}": ${error instanceof Error ? error.message : "unknown error"}`);
            }
          }
        }

        // Handle dependsOnRunUuids (existing Experiment Run dependencies)
        if (run.dependsOnRunUuids) {
          for (const depUuid of run.dependsOnRunUuids) {
            try {
              await experimentRunService.addRunDependency(auth.companyUuid, realUuid, depUuid);
            } catch (error) {
              warnings.push(`Experiment Run "${run.title}" -> runUuid "${depUuid}": ${error instanceof Error ? error.message : "unknown error"}`);
            }
          }
        }

        // Create acceptance criteria items
        if (run.acceptanceCriteriaItems && run.acceptanceCriteriaItems.length > 0) {
          const validItems = run.acceptanceCriteriaItems.filter(
            (item) => item.description && item.description.trim().length > 0
          );
          if (validItems.length > 0) {
            try {
              await prisma.acceptanceCriterion.createMany({
                data: validItems.map((item, index) => ({
                  runUuid: realUuid,
                  description: item.description.trim(),
                  required: item.required ?? true,
                  sortOrder: index,
                })),
              });
            } catch (error) {
              warnings.push(`Experiment Run "${run.title}": failed to create acceptance criteria: ${error instanceof Error ? error.message : "unknown error"}`);
            }
          }
        }
      }

      const result: {
        experimentRuns: { uuid: string; title: string }[];
        warnings?: string[];
      } = { experimentRuns: createdRuns.map(t => ({ uuid: t.uuid, title: t.title })) };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // synapse_research_lead_update_document - Update document content
  server.registerTool(
    "synapse_research_lead_update_document",
    {
      description: "Update document content (increments version number)",
      inputSchema: z.object({
        documentUuid: z.string().describe("Document UUID"),
        title: z.string().optional().describe("New title"),
        content: z.string().optional().describe("New content (Markdown)"),
      }),
    },
    async ({ documentUuid, title, content }) => {
      const doc = await documentService.getDocument(auth.companyUuid, documentUuid);
      if (!doc) {
        return { content: [{ type: "text", text: "Document not found" }], isError: true };
      }

      const updated = await documentService.updateDocument(documentUuid, {
        title,
        content,
        incrementVersion: true,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, version: updated.version }, null, 2) }],
      };
    }
  );

  // ===== Experiment Design Draft Management Tools =====

  // synapse_research_lead_add_document_draft - Add document draft to Experiment Design
  server.registerTool(
    "synapse_research_lead_add_document_draft",
    {
      description: "Add a document draft to a pending Experiment Design container",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        type: z.string().describe("Document type (prd, tech_design, adr, spec, guide)"),
        title: z.string().describe("Document title"),
        content: z.string().describe("Document content (Markdown)"),
      }),
    },
    async ({ experimentDesignUuid, type, title, content }) => {
      try {
        const experimentDesign = await experimentDesignService.addDocumentDraft(
          experimentDesignUuid,
          auth.companyUuid,
          { type, title, content }
        );
        const documentDrafts = experimentDesign.documentDrafts as Array<{ uuid: string; title: string }> | null;
        const newDraft = documentDrafts?.[documentDrafts.length - 1];
        return {
          content: [{ type: "text", text: JSON.stringify({ experimentDesignUuid: experimentDesign.uuid, action: "document_draft_added", draftUuid: newDraft?.uuid, draftTitle: newDraft?.title }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to add document draft: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_add_experiment_run_draft - Add experiment run draft to Experiment Design
  server.registerTool(
    "synapse_research_lead_add_experiment_run_draft",
    {
      description: "Add an experiment run draft to a pending Experiment Design container",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        title: z.string().describe("Experiment Run title"),
        description: z.string().optional().describe("Experiment Run description"),
        computeBudgetHours: z.number().optional().describe("Effort estimate (agent hours)"),
        priority: z.enum(["low", "medium", "high"]).optional().describe("Priority"),
        acceptanceCriteriaItems: zArray(z.object({
          description: z.string().describe("Criterion description"),
          required: z.boolean().optional().describe("Whether this criterion is required (default: true)"),
        })).optional().describe("Structured acceptance criteria items (materialized on approval)"),
        dependsOnDraftUuids: zArray(z.string()).optional().describe("Dependent experiment run draft UUID list"),
      }),
    },
    async ({ experimentDesignUuid, title, description, computeBudgetHours, priority, acceptanceCriteriaItems, dependsOnDraftUuids }) => {
      try {
        const experimentDesign = await experimentDesignService.addRunDraft(
          experimentDesignUuid,
          auth.companyUuid,
          { title, description, computeBudgetHours: computeBudgetHours, priority, acceptanceCriteriaItems, dependsOnDraftUuids }
        );
        const taskDrafts = experimentDesign.taskDrafts as Array<{ uuid: string; title: string }> | null;
        const newDraft = taskDrafts?.[taskDrafts.length - 1];
        return {
          content: [{ type: "text", text: JSON.stringify({ experimentDesignUuid: experimentDesign.uuid, action: "experiment_run_draft_added", draftUuid: newDraft?.uuid, draftTitle: newDraft?.title }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to add experiment run draft: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_update_document_draft - Update document draft
  server.registerTool(
    "synapse_research_lead_update_document_draft",
    {
      description: "Update a document draft in an Experiment Design",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        draftUuid: z.string().describe("Document draft UUID"),
        type: z.string().optional().describe("Document type"),
        title: z.string().optional().describe("Document title"),
        content: z.string().optional().describe("Document content (Markdown)"),
      }),
    },
    async ({ experimentDesignUuid, draftUuid, type, title, content }) => {
      try {
        const updates: { type?: string; title?: string; content?: string } = {};
        if (type !== undefined) updates.type = type;
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;

        const experimentDesign = await experimentDesignService.updateDocumentDraft(
          experimentDesignUuid,
          auth.companyUuid,
          draftUuid,
          updates
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ experimentDesignUuid: experimentDesign.uuid, draftUuid, action: "document_draft_updated" }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to update document draft: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_update_experiment_run_draft - Update experiment run draft
  server.registerTool(
    "synapse_research_lead_update_experiment_run_draft",
    {
      description: "Update an experiment run draft in an Experiment Design",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        draftUuid: z.string().describe("Experiment Run draft UUID"),
        title: z.string().optional().describe("Experiment Run title"),
        description: z.string().optional().describe("Experiment Run description"),
        computeBudgetHours: z.number().optional().describe("Effort estimate (agent hours)"),
        priority: z.enum(["low", "medium", "high"]).optional().describe("Priority"),
        acceptanceCriteriaItems: zArray(z.object({
          description: z.string().describe("Criterion description"),
          required: z.boolean().optional().describe("Whether this criterion is required (default: true)"),
        })).optional().describe("Structured acceptance criteria items (replaces existing items)"),
        dependsOnDraftUuids: zArray(z.string()).optional().describe("Dependent experiment run draft UUID list"),
      }),
    },
    async ({ experimentDesignUuid, draftUuid, title, description, computeBudgetHours, priority, acceptanceCriteriaItems, dependsOnDraftUuids }) => {
      try {
        const updates: { title?: string; description?: string; storyPoints?: number; priority?: string; acceptanceCriteriaItems?: Array<{ description: string; required?: boolean }>; dependsOnDraftUuids?: string[] } = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (computeBudgetHours !== undefined) updates.storyPoints = computeBudgetHours;
        if (priority !== undefined) updates.priority = priority;
        if (acceptanceCriteriaItems !== undefined) updates.acceptanceCriteriaItems = acceptanceCriteriaItems;
        if (dependsOnDraftUuids !== undefined) updates.dependsOnDraftUuids = dependsOnDraftUuids;

        const experimentDesign = await experimentDesignService.updateRunDraft(
          experimentDesignUuid,
          auth.companyUuid,
          draftUuid,
          updates
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ experimentDesignUuid: experimentDesign.uuid, draftUuid, action: "experiment_run_draft_updated" }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to update experiment run draft: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_remove_document_draft - Remove document draft
  server.registerTool(
    "synapse_research_lead_remove_document_draft",
    {
      description: "Remove a document draft from an Experiment Design",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        draftUuid: z.string().describe("Document draft UUID"),
      }),
    },
    async ({ experimentDesignUuid, draftUuid }) => {
      try {
        const experimentDesign = await experimentDesignService.removeDocumentDraft(
          experimentDesignUuid,
          auth.companyUuid,
          draftUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ experimentDesignUuid: experimentDesign.uuid, draftUuid, action: "document_draft_removed" }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to remove document draft: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_remove_experiment_run_draft - Remove experiment run draft
  server.registerTool(
    "synapse_research_lead_remove_experiment_run_draft",
    {
      description: "Remove an experiment run draft from an Experiment Design",
      inputSchema: z.object({
        experimentDesignUuid: z.string().describe("Experiment Design UUID"),
        draftUuid: z.string().describe("Experiment Run draft UUID"),
      }),
    },
    async ({ experimentDesignUuid, draftUuid }) => {
      try {
        const experimentDesign = await experimentDesignService.removeRunDraft(
          experimentDesignUuid,
          auth.companyUuid,
          draftUuid
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ experimentDesignUuid: experimentDesign.uuid, draftUuid, action: "experiment_run_draft_removed" }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to remove experiment run draft: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_add_experiment_run_dependency - Add experiment run dependency
  server.registerTool(
    "synapse_add_experiment_run_dependency",
    {
      description: "Add an experiment run dependency (runUuid depends on dependsOnRunUuid). Includes same-project validation, self-dependency check, and cycle detection.",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID (downstream run)"),
        dependsOnRunUuid: z.string().describe("Dependent Experiment Run UUID (upstream run)"),
      }),
    },
    async ({ runUuid, dependsOnRunUuid }) => {
      try {
        const dep = await experimentRunService.addRunDependency(auth.companyUuid, runUuid, dependsOnRunUuid);
        return {
          content: [{ type: "text", text: JSON.stringify(dep, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to add dependency: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_remove_experiment_run_dependency - Remove experiment run dependency
  server.registerTool(
    "synapse_remove_experiment_run_dependency",
    {
      description: "Remove an experiment run dependency",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        dependsOnRunUuid: z.string().describe("Dependent Experiment Run UUID to remove"),
      }),
    },
    async ({ runUuid, dependsOnRunUuid }) => {
      try {
        await experimentRunService.removeRunDependency(auth.companyUuid, runUuid, dependsOnRunUuid);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, runUuid, dependsOnRunUuid }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to remove dependency: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_assign_experiment_run - Assign experiment run to a Researcher Agent
  server.registerTool(
    "synapse_research_lead_assign_experiment_run",
    {
      description: "Assign an experiment run to a specified Researcher Agent (experiment run must be in open or assigned status)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        agentUuid: z.string().describe("Target Researcher Agent UUID"),
      }),
    },
    async ({ runUuid, agentUuid }) => {
      // Validate experiment run exists
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      // Validate experiment run status
      if (run.status !== "open" && run.status !== "assigned") {
        return {
          content: [{ type: "text", text: `Can only assign experiment runs with open or assigned status, current status: ${run.status}` }],
          isError: true,
        };
      }

      // Validate target agent exists and belongs to the same company
      const targetAgent = await getAgentByUuid(auth.companyUuid, agentUuid);
      if (!targetAgent) {
        return { content: [{ type: "text", text: "Target Agent not found" }], isError: true };
      }

      // Validate target agent has the researcher role
      const hasResearcherRole = targetAgent.roles.some(
        (r: string) => r === "researcher" || r === "researcher_agent"
      );
      if (!hasResearcherRole) {
        return {
          content: [{ type: "text", text: `Agent "${targetAgent.name}" does not have the researcher role` }],
          isError: true,
        };
      }

      // Execute assignment
      try {
        const updated = await experimentRunService.claimExperimentRun({
          runUuid: run.uuid,
          companyUuid: auth.companyUuid,
          assigneeType: "agent",
          assigneeUuid: agentUuid,
          assignedByUuid: auth.actorUuid,
        });

        // Log activity
        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: run.researchProjectUuid,
          targetType: "experiment_run",
          targetUuid: run.uuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "assigned",
          value: { assigneeType: "agent", assigneeUuid: agentUuid, assignedBy: auth.actorUuid },
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status, assigneeUuid: agentUuid }, null, 2) }],
        };
      } catch (e) {
        if (e instanceof AlreadyClaimedError) {
          return {
            content: [{ type: "text", text: "Experiment Run is already claimed and cannot be assigned" }],
            isError: true,
          };
        }
        throw e;
      }
    }
  );

  // ===== Hypothesis Formulation Tools =====

  // synapse_research_lead_start_hypothesis_formulation - Start hypothesis formulation for a Research Question
  server.registerTool(
    "synapse_research_lead_start_hypothesis_formulation",
    {
      description: "Start a hypothesis formulation round for a Research Question. Creates structured questions for the Research Question creator/stakeholder to answer, clarifying requirements before experiment design creation. Recommended for every Research Question. Structured hypothesis formulation improves Experiment Design quality and reduces rejection cycles. IMPORTANT: After this tool returns pending_answers, you MUST use an interactive prompt tool (e.g., AskUserQuestion in Claude Code) to present the questions to the user — do NOT display questions as plain text. Collect answers interactively, then call synapse_answer_hypothesis_formulation. IMPORTANT: Even if the user discusses requirements with you outside of hypothesis formulation (e.g., in chat), you should still record key decisions and clarifications as hypothesis formulation rounds so they are persisted to the Research Question as an audit trail. Do NOT include an 'Other' option — the UI automatically adds a free-text 'Other' option to every question.",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
        depth: z.enum(["minimal", "standard", "comprehensive"]).describe("Hypothesis formulation depth level"),
        questions: zArray(z.object({
          id: z.string().describe("Unique question identifier"),
          text: z.string().describe("Question text"),
          category: z.enum(["hypothesis", "methodology", "prior_work", "resources", "success_metrics", "scope"]).describe("Question category"),
          options: zArray(z.object({
            id: z.string().describe("Option identifier"),
            label: z.string().describe("Option label"),
            description: z.string().optional().describe("Option description"),
          })).describe("Answer options (2-5). Do NOT include 'Other' — the UI adds it automatically."),
          required: z.boolean().optional().describe("Whether the question is required (default: true)"),
        })).describe("Questions to ask (1-15 per round)"),
      }),
    },
    async ({ researchQuestionUuid, depth, questions }) => {
      try {
        const round = await hypothesisFormulationService.startHypothesisFormulation({
          companyUuid: auth.companyUuid,
          researchQuestionUuid: researchQuestionUuid,
          actorUuid: auth.actorUuid,
          actorType: "agent",
          depth,
          questions,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(round, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to start hypothesis formulation: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_validate_hypothesis_formulation - Validate answers from a hypothesis formulation round
  server.registerTool(
    "synapse_research_lead_validate_hypothesis_formulation",
    {
      description: "Validate answers from a hypothesis formulation round. If no issues are found, the hypothesis formulation is marked as resolved. If issues exist, optionally provide follow-up questions for a new round. IMPORTANT: Before resolving (empty issues), always confirm with the user that they have no remaining concerns or topics to discuss.",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
        roundUuid: z.string().describe("Hypothesis formulation round UUID"),
        issues: zArray(z.object({
          questionId: z.string().describe("Question ID with the issue"),
          type: z.enum(["contradiction", "ambiguity", "incomplete"]).describe("Issue type"),
          description: z.string().describe("Issue description"),
        })).describe("List of issues found (empty array = all valid)"),
        followUpQuestions: zArray(z.object({
          id: z.string().describe("Unique question identifier"),
          text: z.string().describe("Question text"),
          category: z.enum(["hypothesis", "methodology", "prior_work", "resources", "success_metrics", "scope"]).describe("Question category"),
          options: zArray(z.object({
            id: z.string().describe("Option identifier"),
            label: z.string().describe("Option label"),
            description: z.string().optional().describe("Option description"),
          })).describe("Answer options (2-5). Do NOT include 'Other' — the UI adds it automatically."),
          required: z.boolean().optional().describe("Whether the question is required (default: true)"),
        })).optional().describe("Follow-up questions for next round (only when issues exist)"),
      }),
    },
    async ({ researchQuestionUuid, roundUuid, issues, followUpQuestions }) => {
      try {
        const result = await hypothesisFormulationService.validateHypothesisFormulation({
          companyUuid: auth.companyUuid,
          researchQuestionUuid: researchQuestionUuid,
          roundUuid,
          actorUuid: auth.actorUuid,
          actorType: "agent",
          issues,
          followUpQuestions,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to validate hypothesis formulation: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  // synapse_research_lead_skip_hypothesis_formulation - Skip hypothesis formulation for a Research Question
  server.registerTool(
    "synapse_research_lead_skip_hypothesis_formulation",
    {
      description: "Skip hypothesis formulation for a Research Question (marks as resolved with minimal depth). Use only for trivially clear Research Questions (e.g., bug fixes with clear reproduction steps). A reason is required and logged in the activity stream. IMPORTANT: You MUST ask the user for permission before skipping — never skip on your own judgment alone. Prefer synapse_research_lead_start_hypothesis_formulation for most Research Questions.",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
        reason: z.string().describe("Reason for skipping hypothesis formulation"),
      }),
    },
    async ({ researchQuestionUuid, reason }) => {
      try {
        await hypothesisFormulationService.skipHypothesisFormulation({
          companyUuid: auth.companyUuid,
          researchQuestionUuid: researchQuestionUuid,
          actorUuid: auth.actorUuid,
          actorType: "agent",
          reason,
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ researchQuestionUuid, action: "hypothesis_formulation_skipped", reason }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Failed to skip hypothesis formulation: ${error instanceof Error ? error.message : "Unknown error"}` }],
          isError: true,
        };
      }
    }
  );

  const lateStageResearchLeadTools = defineMcpTools([
    createMcpTool({
      name: "synapse_move_research_question",
      description: "Move a Research Question to a different research project within the same company. Also moves linked draft/pending Experiment Designs.",
      inputSchema: z.object({
        researchQuestionUuid: z.string().describe("Research Question UUID"),
        targetResearchProjectUuid: z.string().describe("Target Research Project UUID"),
      }),
      async execute({ researchQuestionUuid, targetResearchProjectUuid }) {
        try {
          const updated = await researchQuestionService.moveResearchQuestion(
            auth.companyUuid,
            researchQuestionUuid,
            targetResearchProjectUuid,
            auth.actorUuid,
            auth.type
          );

          return jsonTextResult({ uuid: updated.uuid, project: updated.project });
        } catch (error) {
          return textResult(
            `Failed to move Research Question: ${error instanceof Error ? error.message : "Unknown error"}`,
            true
          );
        }
      },
    }),
    createMcpTool({
      name: "synapse_research_lead_create_research_question",
      description: "Create a Research Question (submits requirements on behalf of humans)",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        title: z.string().describe("Research Question title"),
        content: z.string().optional().describe("Research Question detailed description"),
      }),
      async execute({ researchProjectUuid, title, content }) {
        const exists = await researchProjectExists(auth.companyUuid, researchProjectUuid);
        if (!exists) {
          return textResult("Research Project not found", true);
        }

        const researchQuestion = await researchQuestionService.createResearchQuestion({
          companyUuid: auth.companyUuid,
          researchProjectUuid,
          title,
          content: content || null,
          createdByUuid: auth.actorUuid,
        });

        return jsonTextResult({ uuid: researchQuestion.uuid, title: researchQuestion.title });
      },
    }),
    createMcpTool({
      name: "synapse_research_lead_generate_project_ideas",
      description: "Create one or more agent-generated research ideas from a project brief so they enter the human review board.",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        ideas: z.array(
          z.object({
            title: z.string().describe("Research idea title"),
            content: z.string().optional().describe("Supporting rationale, approach, or ablation details"),
          })
        ).min(1).max(12),
      }),
      async execute({ researchProjectUuid, ideas }) {
        const project = await getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
        if (!project) {
          return textResult("Research Project not found", true);
        }

        const created = await Promise.all(
          ideas.map((idea) =>
            researchQuestionService.createResearchQuestion({
              companyUuid: auth.companyUuid,
              researchProjectUuid,
              title: idea.title,
              content: idea.content || null,
              createdByUuid: auth.actorUuid,
              sourceType: "agent",
              sourceLabel: `Generated by ${auth.agentName || "agent"} from project brief`,
              generatedByAgentUuid: auth.actorUuid,
            })
          )
        );

        return jsonTextResult({
          researchProjectUuid,
          createdCount: created.length,
          ideas: created.map((idea) => ({
            uuid: idea.uuid,
            title: idea.title,
            reviewStatus: idea.reviewStatus,
            sourceType: idea.sourceType,
          })),
        });
      },
    }),
    createMcpTool({
      name: "synapse_create_baseline",
      description: "Register a baseline result for comparison in a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        name: z.string(),
        metrics: z.record(z.string(), z.number()),
        experimentUuid: z.string().optional(),
      }),
      async execute(params) {
        const result = await baselineService.createBaseline(auth.companyUuid, params);
        return jsonTextResult(result);
      },
    }),
    createMcpTool({
      name: "synapse_list_baselines",
      description: "List all baselines for a research project",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
      }),
      async execute({ researchProjectUuid }) {
        const result = await baselineService.listBaselines(auth.companyUuid, researchProjectUuid);
        return jsonTextResult(result);
      },
    }),
    createMcpTool({
      name: "synapse_compare_results",
      description: "Compare experiment run results against the active baseline",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        experimentResults: z.record(z.string(), z.number()),
      }),
      async execute({ researchProjectUuid, experimentResults }) {
        const baseline = await baselineService.getActiveBaseline(auth.companyUuid, researchProjectUuid);
        if (!baseline) {
          return jsonTextResult({ error: "No active baseline found" });
        }

        const comparison: Record<string, { baseline: number; experiment: number; delta: number; improved: boolean }> = {};
        const baselineMetrics = baseline.metrics as Record<string, number>;
        for (const [key, value] of Object.entries(experimentResults)) {
          if (key in baselineMetrics) {
            const baseVal = baselineMetrics[key];
            comparison[key] = {
              baseline: baseVal,
              experiment: value,
              delta: value - baseVal,
              improved: value > baseVal,
            };
          }
        }

        return jsonTextResult({ baseline: baseline.name, comparison });
      },
    }),
    createMcpTool({
      name: "synapse_create_rdr",
      description: "Create a Research Decision Record documenting why a particular approach was chosen",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string(),
        content: z.string(),
      }),
      async execute({ researchProjectUuid, title, content }) {
        const result = await documentService.createDocument({
          researchProjectUuid,
          type: "rdr",
          title,
          content,
          createdByUuid: auth.actorUuid,
          companyUuid: auth.companyUuid,
        });

        return jsonTextResult(result);
      },
    }),
  ]);

  registerMcpTools(server, lateStageResearchLeadTools);
}

// src/mcp/tools/research-lead.ts
// Research Lead Agent MCP Tools (ARCHITECTURE.md §5.2)
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { getResearchProjectByUuid, researchProjectExists } from "@/services/research-project.service";
import * as researchQuestionService from "@/services/research-question.service";
import * as experimentDesignService from "@/services/experiment-design.service";
import * as documentService from "@/services/document.service";
import * as activityService from "@/services/activity.service";
import * as baselineService from "@/services/baseline.service";
import { AlreadyClaimedError, NotClaimedError } from "@/lib/errors";
import {
  createMcpTool,
  defineMcpTools,
  jsonTextResult,
  registerMcpTools,
  textResult,
} from "./tool-registry";

export function registerResearchTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_claim_research_question - Claim a Research Question
  server.registerTool(
    "synapse_claim_research_question",
    {
      description: "Claim a Research Question (open -> elaborating). Claiming automatically transitions the Research Question to 'elaborating' status.",
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

  // synapse_research_lead_create_document - Create a document
  server.registerTool(
    "synapse_create_document",
    {
      description: "Create a document (PRD, tech design, ADR, spec, guide, etc.)",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        type: z.enum(["prd", "tech_design", "adr", "spec", "guide", "literature_review"]).describe("Document type"),
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

  // synapse_research_lead_update_document - Update document content
  server.registerTool(
    "synapse_update_document",
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
    "synapse_add_document_draft",
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

  // synapse_research_lead_update_document_draft - Update document draft
  server.registerTool(
    "synapse_update_document_draft",
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

  // synapse_research_lead_remove_document_draft - Remove document draft
  server.registerTool(
    "synapse_remove_document_draft",
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
      name: "synapse_create_research_question",
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
      name: "synapse_generate_project_ideas",
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

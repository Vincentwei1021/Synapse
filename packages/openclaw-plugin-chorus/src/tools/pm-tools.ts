// src/tools/pm-tools.ts
// PM workflow tools for OpenClaw Chorus plugin
// Wraps Chorus MCP PM tools for use via the OpenClaw plugin API

import type { ChorusMcpClient } from "../mcp-client.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenClawPluginApi = any;

export function registerPmTools(
  api: OpenClawPluginApi,
  mcpClient: ChorusMcpClient
) {
  // 1. chorus_claim_idea — Claim an open Idea for elaboration
  api.registerTool({
    name: "chorus_claim_idea",
    description:
      "Claim an open Idea for elaboration (open -> elaborating). After claiming, start elaboration with chorus_start_elaboration or create a proposal directly.",
    parameters: {
      ideaUuid: { type: "string", description: "UUID of the idea to claim" },
    },
    async execute({ ideaUuid }: { ideaUuid: string }) {
      const result = await mcpClient.callTool("chorus_claim_idea", {
        ideaUuid,
      });
      return JSON.stringify(result, null, 2);
    },
  });

  // 2. chorus_start_elaboration — Start elaboration round for an Idea
  api.registerTool({
    name: "chorus_start_elaboration",
    description:
      "Start an elaboration round for an Idea. Creates structured questions for the Idea creator/stakeholder to answer, clarifying requirements before proposal creation.",
    parameters: {
      ideaUuid: { type: "string", description: "UUID of the idea" },
      depth: {
        type: "string",
        description:
          'Elaboration depth: "minimal", "standard", or "comprehensive"',
      },
      questions: {
        type: "array",
        description:
          "Array of questions. Each: { id: string, text: string, category: string, options: [{ id, label, description? }] }",
      },
    },
    async execute({
      ideaUuid,
      depth,
      questions,
    }: {
      ideaUuid: string;
      depth: "minimal" | "standard" | "comprehensive";
      questions: Array<{
        id: string;
        text: string;
        category: string;
        options: Array<{ id: string; label: string; description?: string }>;
      }>;
    }) {
      const result = await mcpClient.callTool(
        "chorus_pm_start_elaboration",
        { ideaUuid, depth, questions }
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // 3. chorus_answer_elaboration — Answer elaboration questions
  api.registerTool({
    name: "chorus_answer_elaboration",
    description:
      "Answer elaboration questions for an Idea. Submits answers for a specific elaboration round.",
    parameters: {
      ideaUuid: { type: "string", description: "UUID of the idea" },
      roundUuid: {
        type: "string",
        description: "UUID of the elaboration round",
      },
      answers: {
        type: "array",
        description:
          "Array of answers. Each: { questionId: string, selectedOptionId: string|null, customText: string|null }",
      },
    },
    async execute({
      ideaUuid,
      roundUuid,
      answers,
    }: {
      ideaUuid: string;
      roundUuid: string;
      answers: Array<{
        questionId: string;
        selectedOptionId: string | null;
        customText: string | null;
      }>;
    }) {
      const result = await mcpClient.callTool("chorus_answer_elaboration", {
        ideaUuid,
        roundUuid,
        answers,
      });
      return JSON.stringify(result, null, 2);
    },
  });

  // 4. chorus_validate_elaboration — Validate elaboration answers
  api.registerTool({
    name: "chorus_validate_elaboration",
    description:
      "Validate answers from an elaboration round. If no issues found, elaboration is marked as resolved. If issues exist, they are recorded for follow-up.",
    parameters: {
      ideaUuid: { type: "string", description: "UUID of the idea" },
      roundUuid: {
        type: "string",
        description: "UUID of the elaboration round",
      },
      issues: {
        type: "array",
        description:
          'Array of issues. Each: { questionId: string, type: "contradiction"|"ambiguity"|"incomplete", description: string }. Empty array = all valid.',
      },
    },
    async execute({
      ideaUuid,
      roundUuid,
      issues,
    }: {
      ideaUuid: string;
      roundUuid: string;
      issues: Array<{
        questionId: string;
        type: "contradiction" | "ambiguity" | "incomplete";
        description: string;
      }>;
    }) {
      const result = await mcpClient.callTool(
        "chorus_pm_validate_elaboration",
        { ideaUuid, roundUuid, issues }
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // 5. chorus_create_proposal — Create proposal with drafts
  api.registerTool({
    name: "chorus_create_proposal",
    description:
      "Create a Proposal container with optional document drafts and task drafts. Proposals hold drafts that materialize into real entities on approval.",
    parameters: {
      projectUuid: { type: "string", description: "Project UUID" },
      title: { type: "string", description: "Proposal title" },
      inputType: {
        type: "string",
        description: 'Input source type: "idea" or "document"',
      },
      inputUuids: {
        type: "array",
        description: "Array of input UUIDs (idea or document UUIDs)",
      },
      description: {
        type: "string",
        description: "Proposal description (optional)",
        optional: true,
      },
      documentDrafts: {
        type: "array",
        description:
          "Array of document drafts. Each: { type: string, title: string, content: string } (optional)",
        optional: true,
      },
      taskDrafts: {
        type: "array",
        description:
          "Array of task drafts. Each: { title: string, description?: string, priority?: string, storyPoints?: number, acceptanceCriteria?: string, dependsOnDraftUuids?: string[] } (optional)",
        optional: true,
      },
    },
    async execute({
      projectUuid,
      title,
      inputType,
      inputUuids,
      description,
      documentDrafts,
      taskDrafts,
    }: {
      projectUuid: string;
      title: string;
      inputType: "idea" | "document";
      inputUuids: string[];
      description?: string;
      documentDrafts?: Array<{
        type: string;
        title: string;
        content: string;
      }>;
      taskDrafts?: Array<{
        title: string;
        description?: string;
        priority?: string;
        storyPoints?: number;
        acceptanceCriteria?: string;
        dependsOnDraftUuids?: string[];
      }>;
    }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args: Record<string, any> = {
        projectUuid,
        title,
        inputType,
        inputUuids,
      };
      if (description !== undefined) args.description = description;
      if (documentDrafts !== undefined) args.documentDrafts = documentDrafts;
      if (taskDrafts !== undefined) args.taskDrafts = taskDrafts;

      const result = await mcpClient.callTool(
        "chorus_pm_create_proposal",
        args
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // 6. chorus_add_document_draft — Add document draft to proposal
  api.registerTool({
    name: "chorus_add_document_draft",
    description: "Add a document draft to a pending Proposal container.",
    parameters: {
      proposalUuid: { type: "string", description: "Proposal UUID" },
      type: {
        type: "string",
        description:
          "Document type (prd, tech_design, adr, spec, guide)",
      },
      title: { type: "string", description: "Document title" },
      content: { type: "string", description: "Document content (Markdown)" },
    },
    async execute({
      proposalUuid,
      type,
      title,
      content,
    }: {
      proposalUuid: string;
      type: string;
      title: string;
      content: string;
    }) {
      const result = await mcpClient.callTool(
        "chorus_pm_add_document_draft",
        { proposalUuid, type, title, content }
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // 7. chorus_add_task_draft — Add task draft to proposal
  api.registerTool({
    name: "chorus_add_task_draft",
    description: "Add a task draft to a pending Proposal container.",
    parameters: {
      proposalUuid: { type: "string", description: "Proposal UUID" },
      title: { type: "string", description: "Task title" },
      description: {
        type: "string",
        description: "Task description (optional)",
        optional: true,
      },
      priority: {
        type: "string",
        description: 'Priority: "low", "medium", or "high" (optional)',
        optional: true,
      },
      storyPoints: {
        type: "number",
        description: "Effort estimate in agent hours (optional)",
        optional: true,
      },
      acceptanceCriteria: {
        type: "string",
        description: "Acceptance criteria in Markdown (optional)",
        optional: true,
      },
      dependsOnDraftUuids: {
        type: "array",
        description:
          "Array of dependent task draft UUIDs within the same proposal (optional)",
        optional: true,
      },
    },
    async execute({
      proposalUuid,
      title,
      description,
      priority,
      storyPoints,
      acceptanceCriteria,
      dependsOnDraftUuids,
    }: {
      proposalUuid: string;
      title: string;
      description?: string;
      priority?: string;
      storyPoints?: number;
      acceptanceCriteria?: string;
      dependsOnDraftUuids?: string[];
    }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args: Record<string, any> = { proposalUuid, title };
      if (description !== undefined) args.description = description;
      if (priority !== undefined) args.priority = priority;
      if (storyPoints !== undefined) args.storyPoints = storyPoints;
      if (acceptanceCriteria !== undefined)
        args.acceptanceCriteria = acceptanceCriteria;
      if (dependsOnDraftUuids !== undefined)
        args.dependsOnDraftUuids = dependsOnDraftUuids;

      const result = await mcpClient.callTool(
        "chorus_pm_add_task_draft",
        args
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // 8. chorus_validate_proposal — Validate proposal completeness
  api.registerTool({
    name: "chorus_validate_proposal",
    description:
      "Validate a Proposal's completeness before submission. Returns errors, warnings, and info. Call this before chorus_submit_proposal.",
    parameters: {
      proposalUuid: {
        type: "string",
        description: "Proposal UUID to validate",
      },
    },
    async execute({ proposalUuid }: { proposalUuid: string }) {
      const result = await mcpClient.callTool(
        "chorus_pm_validate_proposal",
        { proposalUuid }
      );
      return JSON.stringify(result, null, 2);
    },
  });

  // 9. chorus_submit_proposal — Submit proposal for approval
  api.registerTool({
    name: "chorus_submit_proposal",
    description:
      "Submit a Proposal for approval (draft -> pending). Requires all input Ideas to have elaboration resolved first.",
    parameters: {
      proposalUuid: { type: "string", description: "Proposal UUID to submit" },
    },
    async execute({ proposalUuid }: { proposalUuid: string }) {
      const result = await mcpClient.callTool(
        "chorus_pm_submit_proposal",
        { proposalUuid }
      );
      return JSON.stringify(result, null, 2);
    },
  });
}

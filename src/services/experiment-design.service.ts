// src/services/experiment-design.service.ts
// ExperimentDesign Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs
// Container Model: ExperimentDesign contains documentDrafts and taskDrafts

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { formatCreatedBy, formatReview } from "@/lib/uuid-resolver";
import { eventBus } from "@/lib/event-bus";
import { createDocumentFromProposal } from "./document.service";
import { createExperimentRunsFromDesign } from "./experiment-run.service";

// ===== UUID Helper Functions =====

// Ensure DocumentDraft has a UUID
export function ensureDocumentDraftUuid(draft: Omit<DocumentDraft, "uuid"> & { uuid?: string }): DocumentDraft {
  return {
    ...draft,
    uuid: draft.uuid || randomUUID(),
  };
}

// Ensure TaskDraft has a UUID
export function ensureRunDraftUuid(draft: Omit<TaskDraft, "uuid"> & { uuid?: string }): TaskDraft {
  return {
    ...draft,
    uuid: draft.uuid || randomUUID(),
  };
}

// ===== Type Definitions =====

export interface ExperimentDesignListParams {
  companyUuid: string;
  researchProjectUuid: string;
  skip: number;
  take: number;
  status?: string;
}

// Document draft type (with UUID for tracking and modification)
export interface DocumentDraft {
  uuid: string;      // Draft UUID for tracking
  type: string;
  title: string;
  content: string;
}

// Acceptance criteria item (stored in taskDrafts JSON)
export interface AcceptanceCriteriaItem {
  description: string;
  required?: boolean;  // defaults to true
}

// Task draft type (with UUID for tracking and modification)
export interface TaskDraft {
  uuid: string;      // Draft UUID for tracking
  title: string;
  description?: string;
  computeBudgetHours?: number;
  priority?: string;
  acceptanceCriteria?: string;  // legacy Markdown (read-only, kept for backward-compatible viewing of old data)
  acceptanceCriteriaItems?: AcceptanceCriteriaItem[];  // structured acceptance criteria items (primary format)
  dependsOnDraftUuids?: string[];  // list of dependent taskDraft UUIDs
}

// Input types (uuid is optional, will be auto-generated)
export type DocumentDraftInput = Omit<DocumentDraft, "uuid"> & { uuid?: string };
export type RunDraftInput = Omit<TaskDraft, "uuid"> & { uuid?: string };

export interface ExperimentDesignCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  title: string;
  description?: string | null;
  inputType: string;
  inputUuids: string[];  // UUID array
  documentDrafts?: DocumentDraftInput[];  // Optional: used by frontend, not exposed via MCP
  taskDrafts?: RunDraftInput[];          // Optional: used by frontend, not exposed via MCP
  createdByUuid: string;
  createdByType?: string;  // agent | user
}

// API response format
export interface ExperimentDesignResponse {
  uuid: string;
  title: string;
  description: string | null;
  inputType: string;
  inputUuids: string[];
  documentDrafts: DocumentDraft[] | null;
  taskDrafts: TaskDraft[] | null;
  status: string;
  project?: { uuid: string; name: string };
  createdBy: { type: string; uuid: string; name: string } | null;
  createdByType: string;
  review: {
    reviewedBy: { type: string; uuid: string; name: string };
    reviewNote: string | null;
    reviewedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

// ===== Internal Helper Functions =====

// Format a single Proposal into API response format
async function formatExperimentDesignResponse(
  proposal: {
    uuid: string;
    title: string;
    description: string | null;
    inputType: string;
    inputUuids: unknown;  // JSON field - array of UUID strings
    documentDrafts: unknown;
    taskDrafts: unknown;
    status: string;
    createdByUuid: string;
    createdByType: string;
    reviewedByUuid: string | null;
    reviewNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    project?: { uuid: string; name: string };
  }
): Promise<ExperimentDesignResponse> {
  const creatorType = proposal.createdByType === "user" ? "user" : "agent";
  const [createdBy, review] = await Promise.all([
    formatCreatedBy(proposal.createdByUuid, creatorType),
    formatReview(proposal.reviewedByUuid, proposal.reviewNote, proposal.reviewedAt),
  ]);

  const response: ExperimentDesignResponse = {
    uuid: proposal.uuid,
    title: proposal.title,
    description: proposal.description,
    inputType: proposal.inputType,
    inputUuids: proposal.inputUuids as string[],
    documentDrafts: proposal.documentDrafts as DocumentDraft[] | null,
    taskDrafts: proposal.taskDrafts as TaskDraft[] | null,
    status: proposal.status,
    createdBy,
    createdByType: proposal.createdByType,
    review,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };

  if (proposal.project) {
    response.project = proposal.project;
  }

  return response;
}

// ===== Validation Functions =====

export interface ValidationIssue {
  id: string;       // e.g. "E1", "W2"
  level: "error" | "warning" | "info";
  message: string;  // Human-readable English message
  field?: string;   // Optional: which draft/field has the issue
}

export interface ValidationResult {
  valid: boolean;           // true if no errors
  issues: ValidationIssue[];
}

// Validate Proposal completeness before submission
export async function validateExperimentDesign(
  companyUuid: string,
  experimentDesignUuid: string
): Promise<ValidationResult> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found");
  }

  const issues: ValidationIssue[] = [];
  const documentDrafts = (proposal.documentDrafts as unknown as DocumentDraft[]) || [];
  const taskDrafts = (proposal.taskDrafts as unknown as TaskDraft[]) || [];
  const inputUuids = (proposal.inputUuids as string[]) || [];

  // --- Error Level ---

  // E1: Must have at least one document draft (any type)
  if (documentDrafts.length === 0) {
    issues.push({
      id: "E1",
      level: "error",
      message: "Proposal must contain at least one document draft",
    });
  }

  // E2: Every document draft must have content >= 100 characters
  for (const draft of documentDrafts) {
    if (!draft.content || draft.content.length < 100) {
      issues.push({
        id: "E2",
        level: "error",
        message: `Document draft "${draft.title}" must have content with at least 100 characters`,
        field: draft.title,
      });
    }
  }

  // E3: Must have at least one task draft
  if (taskDrafts.length === 0) {
    issues.push({
      id: "E3",
      level: "error",
      message: "Proposal must contain at least one task draft",
    });
  }

  // E4: inputUuids must be non-empty
  if (inputUuids.length === 0) {
    issues.push({
      id: "E4",
      level: "error",
      message: "Proposal must have at least one input (idea or other source)",
    });
  }

  // E5: All input Ideas must have elaborationStatus === "resolved"
  if (proposal.inputType === "research_question" && inputUuids.length > 0) {
    const ideas = await prisma.researchQuestion.findMany({
      where: { uuid: { in: inputUuids }, companyUuid },
      select: { uuid: true, title: true, elaborationStatus: true },
    });
    for (const idea of ideas) {
      if (idea.elaborationStatus !== "resolved") {
        issues.push({
          id: "E5",
          level: "error",
          message: `Input idea "${idea.title}" has unresolved elaboration (status: ${idea.elaborationStatus})`,
          field: idea.title,
        });
      }
    }
  }

  // --- Warning Level ---

  // W1: Should have at least one tech_design document draft
  if (!documentDrafts.some((d) => d.type === "tech_design")) {
    issues.push({
      id: "W1",
      level: "warning",
      message: "Proposal should contain at least one tech design document draft",
    });
  }

  // W2: Every task draft should have a non-empty description
  for (const draft of taskDrafts) {
    if (!draft.description || draft.description.trim().length === 0) {
      issues.push({
        id: "W2",
        level: "warning",
        message: `Task draft "${draft.title}" is missing a description`,
        field: draft.title,
      });
    }
  }

  // E-AC: Every task draft must have structured acceptance criteria items
  for (const draft of taskDrafts) {
    if (!draft.acceptanceCriteriaItems || draft.acceptanceCriteriaItems.length === 0) {
      issues.push({
        id: "E-AC",
        level: "error",
        message: `Task draft "${draft.title}" is missing acceptance criteria (structured items required)`,
        field: draft.title,
      });
    }
  }

  // W4: When >= 2 task drafts, at least one should have dependsOnDraftUuids
  if (taskDrafts.length >= 2) {
    const hasDeps = taskDrafts.some(
      (d) => d.dependsOnDraftUuids && d.dependsOnDraftUuids.length > 0
    );
    if (!hasDeps) {
      issues.push({
        id: "W4",
        level: "warning",
        message: "When there are multiple tasks, at least one should declare dependencies",
      });
    }
  }

  // W5: Proposal description should be non-empty
  if (!proposal.description || proposal.description.trim().length === 0) {
    issues.push({
      id: "W5",
      level: "warning",
      message: "Proposal description should not be empty",
    });
  }

  // --- Info Level ---

  // I1: Every task draft should have priority set
  for (const draft of taskDrafts) {
    if (!draft.priority) {
      issues.push({
        id: "I1",
        level: "info",
        message: `Task draft "${draft.title}" does not have a priority set`,
        field: draft.title,
      });
    }
  }

  // I2: Every task draft should have computeBudgetHours set
  for (const draft of taskDrafts) {
    if (draft.computeBudgetHours == null) {
      issues.push({
        id: "I2",
        level: "info",
        message: `Task draft "${draft.title}" does not have story points set`,
        field: draft.title,
      });
    }
  }

  const hasErrors = issues.some((i) => i.level === "error");
  return {
    valid: !hasErrors,
    issues,
  };
}

// Check if ResearchQuestions are already used by other Proposals
export async function checkResearchQuestionsAvailability(
  companyUuid: string,
  researchQuestionUuids: string[]
): Promise<{ available: boolean; usedResearchQuestions: { uuid: string; experimentDesignUuid: string; proposalTitle: string }[] }> {
  // Find all proposals that use any of the given ideas
  const proposals = await prisma.experimentDesign.findMany({
    where: {
      companyUuid,
      inputType: "research_question",
    },
    select: {
      uuid: true,
      title: true,
      inputUuids: true,
    },
  });

  const usedResearchQuestions: { uuid: string; experimentDesignUuid: string; proposalTitle: string }[] = [];

  for (const proposal of proposals) {
    const proposalInputUuids = proposal.inputUuids as string[];
    for (const researchQuestionUuid of researchQuestionUuids) {
      if (proposalInputUuids.includes(researchQuestionUuid)) {
        usedResearchQuestions.push({
          uuid: researchQuestionUuid,
          experimentDesignUuid: proposal.uuid,
          proposalTitle: proposal.title,
        });
      }
    }
  }

  return {
    available: usedResearchQuestions.length === 0,
    usedResearchQuestions,
  };
}

// Check if the current user is the assignee of the ResearchQuestions
export async function checkResearchQuestionsAssignee(
  companyUuid: string,
  researchQuestionUuids: string[],
  actorUuid: string,
  actorType: string
): Promise<{ valid: boolean; unassignedResearchQuestions: string[] }> {
  const ideas = await prisma.researchQuestion.findMany({
    where: {
      uuid: { in: researchQuestionUuids },
      companyUuid,
    },
    select: {
      uuid: true,
      assigneeType: true,
      assigneeUuid: true,
    },
  });

  const unassignedResearchQuestions: string[] = [];

  for (const idea of ideas) {
    // Check if current actor is the assignee
    const isAssignee =
      idea.assigneeType === actorType && idea.assigneeUuid === actorUuid;

    if (!isAssignee) {
      unassignedResearchQuestions.push(idea.uuid);
    }
  }

  return {
    valid: unassignedResearchQuestions.length === 0,
    unassignedResearchQuestions,
  };
}

// ===== Service Methods =====

// List proposals query
export async function listExperimentDesigns({
  companyUuid,
  researchProjectUuid,
  skip,
  take,
  status,
}: ExperimentDesignListParams): Promise<{ proposals: ExperimentDesignResponse[]; total: number }> {
  const where = {
    researchProjectUuid,
    companyUuid,
    ...(status && { status }),
  };

  const [rawProposals, total] = await Promise.all([
    prisma.experimentDesign.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        uuid: true,
        title: true,
        description: true,
        inputType: true,
        inputUuids: true,
        documentDrafts: true,
        taskDrafts: true,
        status: true,
        createdByUuid: true,
        createdByType: true,
        reviewedByUuid: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.experimentDesign.count({ where }),
  ]);

  const proposals = await Promise.all(
    rawProposals.map((p) => formatExperimentDesignResponse(p))
  );
  return { proposals, total };
}

// Get Proposal details
export async function getExperimentDesign(
  companyUuid: string,
  uuid: string
): Promise<ExperimentDesignResponse | null> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid, companyUuid },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  if (!proposal) return null;
  return formatExperimentDesignResponse(proposal);
}

// Get raw Proposal data by UUID (internal use)
export async function getExperimentDesignByUuid(companyUuid: string, uuid: string) {
  return prisma.experimentDesign.findFirst({
    where: { uuid, companyUuid },
  });
}

// Create Proposal (container)
export async function createExperimentDesign(
  params: ExperimentDesignCreateParams
): Promise<ExperimentDesignResponse> {
  // Ensure all drafts have UUIDs (frontend may still pass drafts at creation time)
  const documentDraftsWithUuids = params.documentDrafts?.map(ensureDocumentDraftUuid);
  const taskDraftsWithUuids = params.taskDrafts?.map(ensureRunDraftUuid);

  const proposal = await prisma.experimentDesign.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      title: params.title,
      description: params.description,
      inputType: params.inputType,
      inputUuids: params.inputUuids as unknown as Prisma.InputJsonValue,
      ...(documentDraftsWithUuids && { documentDrafts: documentDraftsWithUuids as unknown as Prisma.InputJsonValue }),
      ...(taskDraftsWithUuids && { taskDrafts: taskDraftsWithUuids as unknown as Prisma.InputJsonValue }),
      status: "draft",
      createdByUuid: params.createdByUuid,
      createdByType: params.createdByType || "agent",
    },
    select: {
      uuid: true,
      title: true,
      description: true,
      inputType: true,
      inputUuids: true,
      documentDrafts: true,
      taskDrafts: true,
      status: true,
      createdByUuid: true,
      createdByType: true,
      reviewedByUuid: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  eventBus.emitChange({ companyUuid: params.companyUuid, researchProjectUuid: params.researchProjectUuid, entityType: "experiment_design", entityUuid: proposal.uuid, action: "created" });

  return formatExperimentDesignResponse(proposal);
}

// Update Proposal content (add/modify document drafts and tasks)
export async function updateExperimentDesignContent(
  experimentDesignUuid: string,
  companyUuid: string,
  updates: {
    title?: string;
    description?: string | null;
    documentDrafts?: DocumentDraft[] | null;
    taskDrafts?: TaskDraft[] | null;
  }
): Promise<ExperimentDesignResponse> {
  // Build update data with proper JSON null handling
  const updateData: Prisma.ExperimentDesignUpdateInput = {};

  if (updates.title) {
    updateData.title = updates.title;
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description;
  }
  if (updates.documentDrafts !== undefined) {
    updateData.documentDrafts = updates.documentDrafts === null
      ? Prisma.JsonNull
      : (updates.documentDrafts as unknown as Prisma.InputJsonValue);
  }
  if (updates.taskDrafts !== undefined) {
    updateData.taskDrafts = updates.taskDrafts === null
      ? Prisma.JsonNull
      : (updates.taskDrafts as unknown as Prisma.InputJsonValue);
  }

  const proposal = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid, companyUuid },
    data: updateData,
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(proposal);
}

// Approve Proposal
export interface ApprovalResult extends ExperimentDesignResponse {
  materializedTasks?: Array<{ draftUuid: string; runUuid: string; title: string }>;
  materializedDocuments?: Array<{ draftUuid: string; documentUuid: string; title: string }>;
}

export async function approveExperimentDesign(
  experimentDesignUuid: string,
  companyUuid: string,
  reviewedByUuid: string,
  reviewNote?: string | null
): Promise<ApprovalResult> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found");
  }

  // Start transaction
  const { updatedProposal, materializedTasks, materializedDocuments } = await prisma.$transaction(async (tx) => {
    // Update Proposal status
    const updated = await tx.proposal.update({
      where: { uuid: experimentDesignUuid },
      data: {
        status: "approved",
        reviewedByUuid,
        reviewNote: reviewNote || null,
        reviewedAt: new Date(),
      },
      include: {
        project: { select: { uuid: true, name: true } },
      },
    });

    // Create artifacts from container content
    const documentDrafts = proposal.documentDrafts as DocumentDraft[] | null;
    const taskDrafts = proposal.taskDrafts as TaskDraft[] | null;

    // Track materialized entities
    const matTasks: Array<{ draftUuid: string; runUuid: string; title: string }> = [];
    const matDocs: Array<{ draftUuid: string; documentUuid: string; title: string }> = [];

    // Create documents (if document drafts exist)
    if (documentDrafts && documentDrafts.length > 0) {
      for (const draft of documentDrafts) {
        const doc = await createDocumentFromProposal(
          proposal.companyUuid,
          proposal.researchProjectUuid,
          proposal.uuid,
          proposal.createdByUuid,
          draft
        );
        matDocs.push({ draftUuid: draft.uuid, documentUuid: doc.uuid, title: doc.title });
      }
    }

    // Create tasks (if task drafts exist)
    if (taskDrafts && taskDrafts.length > 0) {
      // Validate acceptanceCriteriaItems before materializing
      for (const draft of taskDrafts) {
        if (draft.acceptanceCriteriaItems && draft.acceptanceCriteriaItems.length > 0) {
          for (let i = 0; i < draft.acceptanceCriteriaItems.length; i++) {
            const item = draft.acceptanceCriteriaItems[i];
            if (!item.description || typeof item.description !== "string" || item.description.trim().length === 0) {
              throw new Error(
                `Task draft "${draft.title}": acceptanceCriteriaItems[${i}] has an empty or invalid description`
              );
            }
          }
        }
      }

      const { draftToTaskUuidMap } = await createExperimentRunsFromDesign(
        proposal.companyUuid,
        proposal.researchProjectUuid,
        proposal.uuid,
        proposal.createdByUuid,
        taskDrafts
      );

      // Build materialized tasks list
      for (const draft of taskDrafts) {
        const runUuid = draftToTaskUuidMap.get(draft.uuid);
        if (runUuid) {
          matTasks.push({ draftUuid: draft.uuid, runUuid, title: draft.title });
        }
      }

      // Materialize dependencies: convert draftUuid references to real taskUuids
      for (const draft of taskDrafts) {
        if (draft.dependsOnDraftUuids && draft.dependsOnDraftUuids.length > 0) {
          const runUuid = draftToTaskUuidMap.get(draft.uuid);
          if (!runUuid) continue;

          for (const depDraftUuid of draft.dependsOnDraftUuids) {
            const depTaskUuid = draftToTaskUuidMap.get(depDraftUuid);
            if (!depTaskUuid) continue;

            await tx.runDependency.create({
              data: { runUuid, dependsOnRunUuid: depTaskUuid },
            });
          }
        }

        // Materialize acceptance criteria items
        if (draft.acceptanceCriteriaItems && draft.acceptanceCriteriaItems.length > 0) {
          const runUuid = draftToTaskUuidMap.get(draft.uuid);
          if (!runUuid) continue;

          await tx.acceptanceCriterion.createMany({
            data: draft.acceptanceCriteriaItems.map((item, index) => ({
              runUuid,
              description: item.description.trim(),
              required: item.required ?? true,
              sortOrder: index,
            })),
          });
        }
      }
    }

    return { updatedProposal: updated, materializedTasks: matTasks, materializedDocuments: matDocs };
  });

  eventBus.emitChange({ companyUuid: proposal.companyUuid, researchProjectUuid: proposal.researchProjectUuid, entityType: "experiment_design", entityUuid: experimentDesignUuid, action: "updated" });

  // Auto-complete input ResearchQuestions when proposal is approved
  if (proposal.inputType === "research_question") {
    const inputUuids = (proposal.inputUuids as string[]) || [];
    if (inputUuids.length > 0) {
      await prisma.researchQuestion.updateMany({
        where: { uuid: { in: inputUuids }, companyUuid, status: "proposal_created" },
        data: { status: "completed" },
      });
    }
  }

  const response: ApprovalResult = await formatExperimentDesignResponse(updatedProposal);
  if (materializedTasks.length > 0) response.materializedTasks = materializedTasks;
  if (materializedDocuments.length > 0) response.materializedDocuments = materializedDocuments;
  return response;
}

// Reject Proposal (reject -> draft, can be re-edited)
// Preserve reviewedByUuid/reviewedAt/reviewNote as revision reference
export async function rejectExperimentDesign(
  experimentDesignUuid: string,
  reviewedByUuid: string,
  reviewNote: string
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      status: "draft",
      reviewedByUuid,
      reviewNote,
      reviewedAt: new Date(),
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({ companyUuid: proposal.companyUuid, researchProjectUuid: proposal.researchProjectUuid, entityType: "experiment_design", entityUuid: proposal.uuid, action: "updated" });

  return formatExperimentDesignResponse(proposal);
}

// Close Proposal (terminal state)
export async function closeExperimentDesign(
  experimentDesignUuid: string,
  closedByUuid: string,
  reviewNote: string
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      status: "closed",
      reviewedByUuid: closedByUuid,
      reviewNote,
      reviewedAt: new Date(),
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({ companyUuid: proposal.companyUuid, researchProjectUuid: proposal.researchProjectUuid, entityType: "experiment_design", entityUuid: proposal.uuid, action: "updated" });

  return formatExperimentDesignResponse(proposal);
}

// Delete Proposal (only draft or closed)
export async function deleteExperimentDesign(
  experimentDesignUuid: string,
  companyUuid: string
): Promise<void> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found");
  }

  await prisma.experimentDesign.delete({ where: { uuid: experimentDesignUuid } });

  eventBus.emitChange({ companyUuid: proposal.companyUuid, researchProjectUuid: proposal.researchProjectUuid, entityType: "experiment_design", entityUuid: proposal.uuid, action: "deleted" });
}

// ===== Draft Management Functions =====

// Submit Proposal for review (draft -> pending)
export async function submitExperimentDesign(
  experimentDesignUuid: string,
  companyUuid: string
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found");
  }

  if (proposal.status !== "draft") {
    throw new Error("Only draft experiment designs can be submitted for review");
  }

  // Run full validation (includes elaboration gate E5 and all other checks)
  const validation = await validateExperimentDesign(companyUuid, experimentDesignUuid);
  if (!validation.valid) {
    const lines = validation.issues.map(
      (i) => `[${i.level}] ${i.message}`
    );
    throw new Error(`Proposal validation failed:\n${lines.join("\n")}`);
  }

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      status: "pending",
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  // Auto-transition input ResearchQuestions to proposal_created
  if (proposal.inputType === "research_question") {
    const inputUuids = (proposal.inputUuids as string[]) || [];
    if (inputUuids.length > 0) {
      await prisma.researchQuestion.updateMany({
        where: { uuid: { in: inputUuids }, companyUuid, status: "elaborating" },
        data: { status: "proposal_created" },
      });
    }
  }

  eventBus.emitChange({ companyUuid: updated.companyUuid, researchProjectUuid: updated.researchProjectUuid, entityType: "experiment_design", entityUuid: updated.uuid, action: "updated" });

  return formatExperimentDesignResponse(updated);
}

// Add document draft to Proposal
export async function addDocumentDraft(
  experimentDesignUuid: string,
  companyUuid: string,
  draft: Omit<DocumentDraft, "uuid"> & { uuid?: string }
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid, status: "draft" },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found or not in draft status");
  }

  const existingDrafts = (proposal.documentDrafts as unknown as DocumentDraft[]) || [];
  const newDraft = ensureDocumentDraftUuid(draft);
  const updatedDrafts = [...existingDrafts, newDraft];

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      documentDrafts: updatedDrafts as unknown as Prisma.InputJsonValue,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(updated);
}

// Add task draft to Proposal
export async function addRunDraft(
  experimentDesignUuid: string,
  companyUuid: string,
  draft: Omit<TaskDraft, "uuid"> & { uuid?: string }
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid, status: "draft" },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found or not in draft status");
  }

  const existingDrafts = (proposal.taskDrafts as unknown as TaskDraft[]) || [];
  const newDraft = ensureRunDraftUuid(draft);
  const updatedDrafts = [...existingDrafts, newDraft];

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      taskDrafts: updatedDrafts as unknown as Prisma.InputJsonValue,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(updated);
}

// Update document draft
export async function updateDocumentDraft(
  experimentDesignUuid: string,
  companyUuid: string,
  draftUuid: string,
  updates: Partial<Omit<DocumentDraft, "uuid">>
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid, status: "draft" },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found or not in draft status");
  }

  const existingDrafts = (proposal.documentDrafts as unknown as DocumentDraft[]) || [];
  const draftIndex = existingDrafts.findIndex(d => d.uuid === draftUuid);

  if (draftIndex === -1) {
    throw new Error("Document draft not found");
  }

  existingDrafts[draftIndex] = { ...existingDrafts[draftIndex], ...updates };

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      documentDrafts: existingDrafts as unknown as Prisma.InputJsonValue,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(updated);
}

// Update task draft
export async function updateRunDraft(
  experimentDesignUuid: string,
  companyUuid: string,
  draftUuid: string,
  updates: Partial<Omit<TaskDraft, "uuid">>
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid, status: "draft" },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found or not in draft status");
  }

  const existingDrafts = (proposal.taskDrafts as unknown as TaskDraft[]) || [];
  const draftIndex = existingDrafts.findIndex(d => d.uuid === draftUuid);

  if (draftIndex === -1) {
    throw new Error("Task draft not found");
  }

  existingDrafts[draftIndex] = { ...existingDrafts[draftIndex], ...updates };

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      taskDrafts: existingDrafts as unknown as Prisma.InputJsonValue,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(updated);
}

// Remove document draft
export async function removeDocumentDraft(
  experimentDesignUuid: string,
  companyUuid: string,
  draftUuid: string
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid, status: "draft" },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found or not in draft status");
  }

  const existingDrafts = (proposal.documentDrafts as unknown as DocumentDraft[]) || [];
  const updatedDrafts = existingDrafts.filter(d => d.uuid !== draftUuid);

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      documentDrafts: updatedDrafts.length > 0
        ? (updatedDrafts as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(updated);
}

// Remove task draft
export async function removeRunDraft(
  experimentDesignUuid: string,
  companyUuid: string,
  draftUuid: string
): Promise<ExperimentDesignResponse> {
  const proposal = await prisma.experimentDesign.findFirst({
    where: { uuid: experimentDesignUuid, companyUuid, status: "draft" },
  });

  if (!proposal) {
    throw new Error("ExperimentDesign not found or not in draft status");
  }

  const existingDrafts = (proposal.taskDrafts as unknown as TaskDraft[]) || [];
  const updatedDrafts = existingDrafts
    .filter(d => d.uuid !== draftUuid)
    .map(d => ({
      ...d,
      dependsOnDraftUuids: d.dependsOnDraftUuids?.filter(uuid => uuid !== draftUuid),
    }));

  const updated = await prisma.experimentDesign.update({
    where: { uuid: experimentDesignUuid },
    data: {
      taskDrafts: updatedDrafts.length > 0
        ? (updatedDrafts as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  return formatExperimentDesignResponse(updated);
}

// Get lightweight proposal list with task counts (for filter dropdown)
export async function getProjectExperimentDesigns(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<Array<{ uuid: string; title: string; sequenceNumber: number; taskCount: number }>> {
  const proposals = await prisma.experimentDesign.findMany({
    where: { companyUuid, researchProjectUuid, status: "approved" },
    select: {
      uuid: true,
      title: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Count tasks per proposal
  const taskCounts = await prisma.experimentRun.groupBy({
    by: ["experimentDesignUuid"],
    where: {
      companyUuid,
      researchProjectUuid,
      experimentDesignUuid: { in: proposals.map(p => p.uuid) },
    },
    _count: true,
  });

  const countMap = new Map(taskCounts.map(tc => [tc.experimentDesignUuid, tc._count]));

  return proposals.map((p, index) => ({
    uuid: p.uuid,
    title: p.title,
    sequenceNumber: index + 1,
    taskCount: countMap.get(p.uuid) ?? 0,
  }));
}

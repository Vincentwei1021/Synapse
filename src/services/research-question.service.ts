// src/services/research-question.service.ts
// ResearchQuestion Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import { formatAssigneeComplete, formatCreatedBy } from "@/lib/uuid-resolver";
import { eventBus } from "@/lib/event-bus";
import { AlreadyClaimedError, NotClaimedError, isPrismaNotFound } from "@/lib/errors";
import { ApiError } from "@/lib/api-handler";
import * as mentionService from "@/services/mention.service";
import * as activityService from "@/services/activity.service";

// ===== Type Definitions =====

export interface ResearchQuestionListParams {
  companyUuid: string;
  researchProjectUuid: string;
  skip: number;
  take: number;
  status?: string;
  assignedToMe?: boolean;  // Filter for ideas assigned to current user
  actorUuid?: string;      // Current user/agent UUID for assignedToMe filter
  actorType?: string;      // "user" | "agent" for assignedToMe filter
}

export interface ResearchQuestionCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  title: string;
  content?: string | null;
  attachments?: unknown;
  parentQuestionUuid?: string | null;
  createdByUuid: string;
  sourceType?: string;
  sourceLabel?: string | null;
  generatedByAgentUuid?: string | null;
}

export interface ResearchQuestionClaimParams {
  researchQuestionUuid: string;
  companyUuid: string;
  assigneeType: string;
  assigneeUuid: string;
  assignedByUuid?: string | null;
}

// API response format
export interface ResearchQuestionResponse {
  uuid: string;
  title: string;
  content: string | null;
  attachments: unknown;
  parentQuestionUuid: string | null;
  childQuestionUuids: string[];
  experimentCount: number;
  sourceType: string;
  sourceLabel: string | null;
  generatedByAgentUuid: string | null;
  reviewStatus: string;
  reviewedByUuid: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  status: string;
  assignee: {
    type: string;
    uuid: string;
    name: string;
    assignedAt: string | null;
    assignedBy: { type: string; uuid: string; name: string } | null;
  } | null;
  project?: { uuid: string; name: string };
  elaborationStatus?: string;
  elaborationDepth?: string;
  createdBy: { type: string; uuid: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ResearchQuestion status transition rules — simplified AI-DLC lifecycle
// open → elaborating → proposal_created → completed → closed
export const RESEARCH_QUESTION_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["elaborating", "closed"],
  elaborating: ["experiment_created", "closed"],
  experiment_created: ["completed", "elaborating", "closed"],
  completed: ["closed"],
  closed: [],
};

// Map legacy statuses to current ones (for backward compatibility with historical data)
export function normalizeResearchQuestionStatus(status: string): string {
  switch (status) {
    case "assigned":
    case "in_progress":
      return "elaborating";
    case "pending_review":
      return "experiment_created";
    default:
      return status;
  }
}

// Validate whether a status transition is valid
export function isValidResearchQuestionStatusTransition(from: string, to: string): boolean {
  const normalizedFrom = normalizeResearchQuestionStatus(from);
  const allowed = RESEARCH_QUESTION_STATUS_TRANSITIONS[normalizedFrom] || [];
  return allowed.includes(to);
}

// ===== Internal Helper Functions =====

// Format a single Idea into API response format
async function formatResearchQuestionResponse(
  idea: {
    uuid: string;
    title: string;
    content: string | null;
    attachments: unknown;
    parentQuestionUuid: string | null;
    childQuestions?: Array<{ uuid: string }>;
    _count?: { experiments: number };
    sourceType: string;
    sourceLabel: string | null;
    generatedByAgentUuid: string | null;
    reviewStatus: string;
    reviewedByUuid: string | null;
    reviewNote: string | null;
    reviewedAt: Date | null;
    status: string;
    elaborationStatus?: string | null;
    elaborationDepth?: string | null;
    assigneeType: string | null;
    assigneeUuid: string | null;
    assignedAt: Date | null;
    assignedByUuid: string | null;
    createdByUuid: string;
    createdAt: Date;
    updatedAt: Date;
    researchProject?: { uuid: string; name: string };
  }
): Promise<ResearchQuestionResponse> {
  const [assignee, createdBy] = await Promise.all([
    formatAssigneeComplete(idea.assigneeType, idea.assigneeUuid, idea.assignedAt, idea.assignedByUuid),
    formatCreatedBy(idea.createdByUuid),
  ]);

  return {
    uuid: idea.uuid,
    title: idea.title,
    content: idea.content,
    attachments: idea.attachments,
    parentQuestionUuid: idea.parentQuestionUuid,
    childQuestionUuids: idea.childQuestions?.map((child) => child.uuid) ?? [],
    experimentCount: idea._count?.experiments ?? 0,
    sourceType: idea.sourceType,
    sourceLabel: idea.sourceLabel,
    generatedByAgentUuid: idea.generatedByAgentUuid,
    reviewStatus: idea.reviewStatus,
    reviewedByUuid: idea.reviewedByUuid,
    reviewNote: idea.reviewNote,
    reviewedAt: idea.reviewedAt?.toISOString() ?? null,
    status: normalizeResearchQuestionStatus(idea.status),
    assignee,
    ...(idea.researchProject && { project: idea.researchProject }),
    ...(idea.elaborationStatus != null && { elaborationStatus: idea.elaborationStatus }),
    ...(idea.elaborationDepth != null && { elaborationDepth: idea.elaborationDepth }),
    createdBy,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

// ===== Service Methods =====

// List ideas query
export async function listResearchQuestions({
  companyUuid,
  researchProjectUuid,
  skip,
  take,
  status,
  assignedToMe,
  actorUuid,
  actorType,
}: ResearchQuestionListParams): Promise<{ researchQuestions: ResearchQuestionResponse[]; total: number }> {
  const where: {
    researchProjectUuid: string;
    companyUuid: string;
    status?: string;
    assigneeUuid?: string;
    assigneeType?: string;
  } = {
    researchProjectUuid,
    companyUuid,
    ...(status && { status }),
  };

  // Add assignedToMe filter if requested
  if (assignedToMe && actorUuid && actorType) {
    where.assigneeUuid = actorUuid;
    where.assigneeType = actorType;
  }

  const [rawIdeas, total] = await Promise.all([
    prisma.researchQuestion.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        uuid: true,
        title: true,
        content: true,
        attachments: true,
        parentQuestionUuid: true,
        childQuestions: {
          select: { uuid: true },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { experiments: true },
        },
        sourceType: true,
        sourceLabel: true,
        generatedByAgentUuid: true,
        reviewStatus: true,
        reviewedByUuid: true,
        reviewNote: true,
        reviewedAt: true,
        status: true,
        elaborationStatus: true,
        elaborationDepth: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.researchQuestion.count({ where }),
  ]);

  const researchQuestions = await Promise.all(rawIdeas.map(formatResearchQuestionResponse));
  return { researchQuestions, total };
}

// Get Idea details
export async function getResearchQuestion(
  companyUuid: string,
  uuid: string
): Promise<ResearchQuestionResponse | null> {
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid, companyUuid },
    include: {
      researchProject: { select: { uuid: true, name: true } },
      childQuestions: {
        select: { uuid: true },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { experiments: true },
      },
    },
  });

  if (!idea) return null;
  return formatResearchQuestionResponse(idea);
}

// Get raw Idea data by UUID (internal use, for permission checks etc.)
export async function getResearchQuestionByUuid(companyUuid: string, uuid: string) {
  return prisma.researchQuestion.findFirst({
    where: { uuid, companyUuid },
    include: {
      parentQuestion: {
        select: { uuid: true, researchProjectUuid: true },
      },
      childQuestions: {
        select: { uuid: true },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { experiments: true },
      },
    },
  });
}

// Create Idea
export async function createResearchQuestion(params: ResearchQuestionCreateParams): Promise<ResearchQuestionResponse> {
  if (params.parentQuestionUuid) {
    const parentQuestion = await prisma.researchQuestion.findFirst({
      where: {
        uuid: params.parentQuestionUuid,
        companyUuid: params.companyUuid,
        researchProjectUuid: params.researchProjectUuid,
      },
      select: { uuid: true },
    });

    if (!parentQuestion) {
      throw new Error("Parent research question not found");
    }
  }

  const idea = await prisma.researchQuestion.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      title: params.title,
      content: params.content,
      attachments: params.attachments || undefined,
      parentQuestionUuid: params.parentQuestionUuid ?? null,
      sourceType: params.sourceType ?? "human",
      sourceLabel: params.sourceLabel ?? null,
      generatedByAgentUuid: params.generatedByAgentUuid ?? null,
      reviewStatus: params.sourceType === "agent" ? "pending" : "accepted",
      status: "open",
      createdByUuid: params.createdByUuid,
    },
    select: {
      uuid: true,
      title: true,
      content: true,
      attachments: true,
      parentQuestionUuid: true,
      childQuestions: {
        select: { uuid: true },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { experiments: true },
      },
      sourceType: true,
      sourceLabel: true,
      generatedByAgentUuid: true,
      reviewStatus: true,
      reviewedByUuid: true,
      reviewNote: true,
      reviewedAt: true,
      status: true,
      elaborationStatus: true,
      elaborationDepth: true,
      assigneeType: true,
      assigneeUuid: true,
      assignedAt: true,
      assignedByUuid: true,
      createdByUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  eventBus.emitChange({ companyUuid: params.companyUuid, researchProjectUuid: params.researchProjectUuid, entityType: "research_question", entityUuid: idea.uuid, action: "created" });

  return formatResearchQuestionResponse(idea);
}

// Update Idea
export async function updateResearchQuestion(
  uuid: string,
  companyUuid: string,
  data: { title?: string; content?: string | null; status?: string; parentQuestionUuid?: string | null },
  actorContext?: { actorType: string; actorUuid: string }
): Promise<ResearchQuestionResponse> {
  // If content is being updated and we have actor context, capture old content for mention diffing
  let oldContent: string | null = null;
  if (data.content !== undefined && actorContext) {
    const existing = await prisma.researchQuestion.findUnique({ where: { uuid }, select: { content: true } });
    oldContent = existing?.content ?? null;
  }

  const idea = await prisma.researchQuestion.update({
    where: { uuid },
    data,
    include: {
      researchProject: { select: { uuid: true, name: true } },
      childQuestions: {
        select: { uuid: true },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { experiments: true },
      },
    },
  });

  eventBus.emitChange({ companyUuid: idea.companyUuid, researchProjectUuid: idea.researchProject!.uuid, entityType: "research_question", entityUuid: idea.uuid, action: "updated" });

  // Process new @mentions in content (append-only: only new mentions)
  if (data.content !== undefined && actorContext && data.content) {
    processNewResearchQuestionMentions(
      idea.companyUuid,
      idea.researchProject!.uuid,
      idea.uuid,
      idea.title,
      oldContent,
      data.content,
      actorContext.actorType,
      actorContext.actorUuid,
    ).catch((err) => console.error("[Idea] Failed to process mentions:", err));
  }

  return formatResearchQuestionResponse(idea);
}

// Claim Idea (self-claim: only works when no assignee)
export async function claimResearchQuestion({
  researchQuestionUuid,
  companyUuid,
  assigneeType,
  assigneeUuid,
  assignedByUuid,
}: ResearchQuestionClaimParams): Promise<ResearchQuestionResponse> {
  const existing = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });
  if (!existing) throw new AlreadyClaimedError("Idea");
  if (existing.assigneeUuid) {
    throw new AlreadyClaimedError("Idea");
  }
  if (existing.reviewStatus === "rejected") {
    throw new Error("Cannot claim a rejected ResearchQuestion");
  }
  if (existing.reviewStatus !== "accepted") {
    throw new Error("ResearchQuestion must be accepted before it can be claimed");
  }
  if (existing.status === "completed" || existing.status === "closed") {
    throw new Error("Cannot claim a completed or closed ResearchQuestion");
  }

  const idea = await prisma.researchQuestion.update({
    where: { uuid: researchQuestionUuid },
    data: {
      status: "elaborating",
      assigneeType,
      assigneeUuid,
      assignedAt: new Date(),
      assignedByUuid,
    },
    include: {
      researchProject: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({ companyUuid: idea.companyUuid, researchProjectUuid: idea.researchProject!.uuid, entityType: "research_question", entityUuid: idea.uuid, action: "updated" });

  return formatResearchQuestionResponse(idea);
}

// Assign Idea (reassign: works regardless of current assignee, any non-terminal status)
export async function assignResearchQuestion({
  researchQuestionUuid,
  companyUuid,
  assigneeType,
  assigneeUuid,
  assignedByUuid,
}: ResearchQuestionClaimParams): Promise<ResearchQuestionResponse> {
  const existing = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
  });
  if (!existing) throw new Error("ResearchQuestion not found");
  if (existing.reviewStatus === "rejected") {
    throw new Error("Cannot assign a rejected ResearchQuestion");
  }
  if (existing.reviewStatus !== "accepted") {
    throw new Error("ResearchQuestion must be accepted before it can be assigned");
  }
  if (existing.status === "completed" || existing.status === "closed") {
    throw new Error("Cannot assign a completed or closed ResearchQuestion");
  }

  // If currently open, move to elaborating; otherwise keep current status
  const newStatus = existing.status === "open" ? "elaborating" : existing.status;

  const idea = await prisma.researchQuestion.update({
    where: { uuid: researchQuestionUuid },
    data: {
      status: newStatus,
      assigneeType,
      assigneeUuid,
      assignedAt: new Date(),
      assignedByUuid,
    },
    include: {
      researchProject: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({ companyUuid: idea.companyUuid, researchProjectUuid: idea.researchProject!.uuid, entityType: "research_question", entityUuid: idea.uuid, action: "updated" });

  return formatResearchQuestionResponse(idea);
}

// Release Idea (clears assignee, resets to open; any non-terminal status)
export async function releaseResearchQuestion(uuid: string): Promise<ResearchQuestionResponse> {
  const existing = await prisma.researchQuestion.findUnique({ where: { uuid } });
  if (!existing) throw new Error("ResearchQuestion not found");
  if (existing.status === "completed" || existing.status === "closed") {
    throw new Error("Cannot release a completed or closed ResearchQuestion");
  }

  const idea = await prisma.researchQuestion.update({
    where: { uuid },
    data: {
      status: "open",
      assigneeType: null,
      assigneeUuid: null,
      assignedAt: null,
      assignedByUuid: null,
      elaborationDepth: null,
      elaborationStatus: null,
    },
    include: {
      researchProject: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({ companyUuid: idea.companyUuid, researchProjectUuid: idea.researchProject!.uuid, entityType: "research_question", entityUuid: idea.uuid, action: "updated" });

  return formatResearchQuestionResponse(idea);
}

export async function reviewResearchQuestion(
  companyUuid: string,
  researchQuestionUuid: string,
  reviewStatus: "accepted" | "rejected",
  reviewedByUuid: string,
  reviewNote?: string | null
): Promise<ResearchQuestionResponse> {
  const idea = await prisma.researchQuestion.update({
    where: { uuid: researchQuestionUuid },
    data: {
      reviewStatus,
      reviewedByUuid,
      reviewNote: reviewNote ?? null,
      reviewedAt: new Date(),
      status: reviewStatus === "rejected" ? "closed" : "open",
      assigneeType: reviewStatus === "rejected" ? null : undefined,
      assigneeUuid: reviewStatus === "rejected" ? null : undefined,
      assignedAt: reviewStatus === "rejected" ? null : undefined,
      assignedByUuid: reviewStatus === "rejected" ? null : undefined,
    },
    include: {
      researchProject: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({
    companyUuid,
    researchProjectUuid: idea.researchProject!.uuid,
    entityType: "research_question",
    entityUuid: idea.uuid,
    action: "updated",
  });

  return formatResearchQuestionResponse(idea);
}

// Process new @mentions in idea content (append-only: only new mentions)
async function processNewResearchQuestionMentions(
  companyUuid: string,
  researchProjectUuid: string,
  researchQuestionUuid: string,
  researchQuestionTitle: string,
  oldContent: string | null,
  newContent: string,
  actorType: string,
  actorUuid: string,
): Promise<void> {
  const oldMentions = oldContent ? mentionService.parseMentions(oldContent) : [];
  const newMentions = mentionService.parseMentions(newContent);

  const oldKeys = new Set(oldMentions.map((m) => `${m.type}:${m.uuid}`));
  const brandNewMentions = newMentions.filter((m) => !oldKeys.has(`${m.type}:${m.uuid}`));

  if (brandNewMentions.length === 0) return;

  await mentionService.createMentions({
    companyUuid,
    sourceType: "research_question",
    sourceUuid: researchQuestionUuid,
    content: newContent,
    actorType,
    actorUuid,
    researchProjectUuid,
    entityTitle: researchQuestionTitle,
  });

  for (const mention of brandNewMentions) {
    if (mention.type === actorType && mention.uuid === actorUuid) continue;
    await activityService.createActivity({
      companyUuid,
      researchProjectUuid,
      targetType: "research_question",
      targetUuid: researchQuestionUuid,
      actorType,
      actorUuid,
      action: "mentioned",
      value: {
        mentionedType: mention.type,
        mentionedUuid: mention.uuid,
        mentionedName: mention.displayName,
        sourceType: "research_question",
        sourceUuid: researchQuestionUuid,
      },
    });
  }
}

// Delete Idea
export async function deleteResearchQuestion(uuid: string) {
  const idea = await prisma.researchQuestion.delete({ where: { uuid } });
  eventBus.emitChange({ companyUuid: idea.companyUuid, researchProjectUuid: idea.researchProjectUuid, entityType: "research_question", entityUuid: idea.uuid, action: "deleted" });
  return idea;
}

// Move Idea to a different project
export async function moveResearchQuestion(
  companyUuid: string,
  researchQuestionUuid: string,
  targetProjectUuid: string,
  actorUuid: string,
  actorType: string = "user"
): Promise<ResearchQuestionResponse> {
  // Validate idea exists and belongs to same company
  const idea = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
    include: { researchProject: { select: { uuid: true, name: true } } },
  });
  if (!idea) throw new ApiError("NOT_FOUND", "ResearchQuestion not found", 404);

  // Validate target project exists and belongs to same company
  const targetProject = await prisma.researchProject.findFirst({
    where: { uuid: targetProjectUuid, companyUuid },
    select: { uuid: true, name: true },
  });
  if (!targetProject) throw new ApiError("NOT_FOUND", "Target project not found", 404);

  if (idea.researchProjectUuid === targetProjectUuid) {
    throw new ApiError("BAD_REQUEST", "ResearchQuestion is already in the target project", 400);
  }

  const fromProjectUuid = idea.researchProjectUuid;

  // Transaction: update idea + linked proposals
  await prisma.$transaction(async (tx) => {
    // Update Idea.projectUuid
    await tx.researchQuestion.update({
      where: { uuid: researchQuestionUuid },
      data: { researchProjectUuid: targetProjectUuid },
    });

    // Update linked ExperimentDesign.researchProjectUuid (draft or pending only)
    await tx.experimentDesign.updateMany({
      where: {
        companyUuid,
        inputType: "research_question",
        inputUuids: { array_contains: [researchQuestionUuid] },
        status: { in: ["draft", "pending"] },
      },
      data: { researchProjectUuid: targetProjectUuid },
    });
  });

  // Log activity
  await activityService.createActivity({
    companyUuid,
    researchProjectUuid: targetProjectUuid,
    targetType: "research_question",
    targetUuid: researchQuestionUuid,
    actorType,
    actorUuid,
    action: "moved",
    value: {
      fromProjectUuid,
      fromProjectName: idea.researchProject!.name,
      toProjectUuid: targetProjectUuid,
      toProjectName: targetProject.name,
    },
  });

  // Emit changes for both projects
  eventBus.emitChange({ companyUuid, researchProjectUuid: fromProjectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });
  eventBus.emitChange({ companyUuid, researchProjectUuid: targetProjectUuid, entityType: "research_question", entityUuid: researchQuestionUuid, action: "updated" });

  // Return updated idea
  const updated = await prisma.researchQuestion.findFirst({
    where: { uuid: researchQuestionUuid, companyUuid },
    include: { researchProject: { select: { uuid: true, name: true } } },
  });
  return formatResearchQuestionResponse(updated!);
}

// src/services/comment.service.ts
// Comment Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import {
  getActorName,
  validateTargetExists,
  type TargetType,
} from "@/lib/uuid-resolver";
import * as mentionService from "@/services/mention.service";
import * as activityService from "@/services/activity.service";
import { eventBus, type RealtimeEvent } from "@/lib/event-bus";

export interface CommentListParams {
  companyUuid: string;
  targetType: TargetType;
  targetUuid: string;
  skip: number;
  take: number;
}

export interface CommentCreateParams {
  companyUuid: string;
  targetType: TargetType;
  targetUuid: string;
  content: string;
  authorType: "user" | "agent";
  authorUuid: string;
}

// Comment response format (using UUIDs)
export interface CommentResponse {
  uuid: string;
  targetType: string;
  targetUuid: string;
  content: string;
  author: {
    type: string;
    uuid: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

// List comments
export async function listComments({
  companyUuid,
  targetType,
  targetUuid,
  skip,
  take,
}: CommentListParams): Promise<{ comments: CommentResponse[]; total: number }> {
  // Validate target exists
  const exists = await validateTargetExists(targetType, targetUuid, companyUuid);
  if (!exists) {
    return { comments: [], total: 0 };
  }

  const where = { companyUuid, targetType, targetUuid };

  const [rawComments, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "asc" },
      select: {
        uuid: true,
        targetType: true,
        targetUuid: true,
        content: true,
        authorType: true,
        authorUuid: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.comment.count({ where }),
  ]);

  // Convert to response format
  const comments: CommentResponse[] = await Promise.all(
    rawComments.map(async (c) => {
      const authorName = await getActorName(c.authorType, c.authorUuid);
      return {
        uuid: c.uuid,
        targetType: c.targetType,
        targetUuid: c.targetUuid,
        content: c.content,
        author: {
          type: c.authorType,
          uuid: c.authorUuid,
          name: authorName ?? "Unknown",
        },
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    })
  );

  return { comments, total };
}

// Create comment
export async function createComment({
  companyUuid,
  targetType,
  targetUuid,
  content,
  authorType,
  authorUuid,
}: CommentCreateParams): Promise<CommentResponse> {
  // Validate target exists
  const exists = await validateTargetExists(targetType, targetUuid, companyUuid);
  if (!exists) {
    throw new Error(`Target ${targetType} with UUID ${targetUuid} not found`);
  }

  const comment = await prisma.comment.create({
    data: {
      companyUuid,
      targetType,
      targetUuid,
      content,
      authorType,
      authorUuid,
    },
    select: {
      uuid: true,
      targetType: true,
      targetUuid: true,
      content: true,
      authorType: true,
      authorUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Get author name
  const authorName = await getActorName(comment.authorType, comment.authorUuid);

  // Emit SSE event for real-time comment updates (fire-and-forget)
  resolveProjectUuid(targetType, targetUuid).then((researchProjectUuid) => {
    if (researchProjectUuid) {
      eventBus.emitChange({
        companyUuid,
        researchProjectUuid,
        entityType: targetType as RealtimeEvent["entityType"],
        entityUuid: targetUuid,
        action: "updated",
        actorUuid: authorUuid,
      });
    }
  }).catch(() => {});

  // Process @mentions in comment content (fire-and-forget)
  processCommentMentions(
    companyUuid,
    targetType,
    targetUuid,
    comment.uuid,
    content,
    authorType,
    authorUuid,
  ).catch((err) => console.error("[Comment] Failed to process mentions:", err));

  return {
    uuid: comment.uuid,
    targetType: comment.targetType,
    targetUuid: comment.targetUuid,
    content: comment.content,
    author: {
      type: comment.authorType,
      uuid: comment.authorUuid,
      name: authorName ?? "Unknown",
    },
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

// Resolve researchProjectUuid from a comment target entity
export async function resolveProjectUuid(
  targetType: string,
  targetUuid: string
): Promise<string | null> {
  switch (targetType) {
    case "experiment_run": {
      const task = await prisma.experimentRun.findUnique({ where: { uuid: targetUuid }, select: { researchProjectUuid: true } });
      return task?.researchProjectUuid ?? null;
    }
    case "research_question": {
      const idea = await prisma.researchQuestion.findUnique({ where: { uuid: targetUuid }, select: { researchProjectUuid: true } });
      return idea?.researchProjectUuid ?? null;
    }
    case "experiment_design": {
      const proposal = await prisma.experimentDesign.findUnique({ where: { uuid: targetUuid }, select: { researchProjectUuid: true } });
      return proposal?.researchProjectUuid ?? null;
    }
    case "document": {
      const doc = await prisma.document.findUnique({ where: { uuid: targetUuid }, select: { researchProjectUuid: true } });
      return doc?.researchProjectUuid ?? null;
    }
    default:
      return null;
  }
}

// Resolve entity title from a target type and UUID
async function resolveEntityTitle(
  targetType: string,
  targetUuid: string
): Promise<string> {
  switch (targetType) {
    case "experiment_run": {
      const task = await prisma.experimentRun.findUnique({ where: { uuid: targetUuid }, select: { title: true } });
      return task?.title ?? "Unknown Experiment Run";
    }
    case "research_question": {
      const idea = await prisma.researchQuestion.findUnique({ where: { uuid: targetUuid }, select: { title: true } });
      return idea?.title ?? "Unknown Research Question";
    }
    case "experiment_design": {
      const proposal = await prisma.experimentDesign.findUnique({ where: { uuid: targetUuid }, select: { title: true } });
      return proposal?.title ?? "Unknown Experiment Design";
    }
    case "document": {
      const doc = await prisma.document.findUnique({ where: { uuid: targetUuid }, select: { title: true } });
      return doc?.title ?? "Unknown Document";
    }
    default:
      return "Unknown";
  }
}

// Process @mentions from a comment (called after createComment)
async function processCommentMentions(
  companyUuid: string,
  targetType: string,
  targetUuid: string,
  commentUuid: string,
  content: string,
  authorType: string,
  authorUuid: string,
): Promise<void> {
  const mentions = mentionService.parseMentions(content);
  if (mentions.length === 0) return;

  const researchProjectUuid = await resolveProjectUuid(targetType, targetUuid);
  if (!researchProjectUuid) return;

  const entityTitle = await resolveEntityTitle(targetType, targetUuid);

  await mentionService.createMentions({
    companyUuid,
    sourceType: "comment",
    sourceUuid: commentUuid,
    content,
    actorType: authorType,
    actorUuid: authorUuid,
    researchProjectUuid,
    entityTitle,
  });

  // Log mention activity for each mentioned user/agent
  for (const mention of mentions) {
    if (mention.type === authorType && mention.uuid === authorUuid) continue; // skip self
    await activityService.createActivity({
      companyUuid,
      researchProjectUuid,
      targetType: targetType as activityService.TargetType,
      targetUuid,
      actorType: authorType,
      actorUuid: authorUuid,
      action: "mentioned",
      value: {
        mentionedType: mention.type,
        mentionedUuid: mention.uuid,
        mentionedName: mention.displayName,
        sourceType: "comment",
        sourceUuid: commentUuid,
      },
    });
  }
}

// Batch get comment counts
export async function batchCommentCounts(
  companyUuid: string,
  targetType: TargetType,
  targetUuids: string[]
): Promise<Record<string, number>> {
  if (targetUuids.length === 0) return {};

  const counts = await prisma.comment.groupBy({
    by: ["targetUuid"],
    where: {
      companyUuid,
      targetType,
      targetUuid: { in: targetUuids },
    },
    _count: { targetUuid: true },
  });

  const result: Record<string, number> = {};
  for (const uuid of targetUuids) {
    result[uuid] = 0;
  }
  for (const item of counts) {
    result[item.targetUuid] = item._count.targetUuid;
  }
  return result;
}

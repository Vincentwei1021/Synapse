// src/services/comment.service.ts
// Comment Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import {
  getActorName,
  validateTargetExists,
  type TargetType,
} from "@/lib/uuid-resolver";
import { logger } from "@/lib/logger";
import * as mentionService from "@/services/mention.service";
import * as activityService from "@/services/activity.service";
import * as notificationService from "@/services/notification.service";
import { eventBus, type RealtimeEvent } from "@/lib/event-bus";

const log = logger.child({ module: "comment" });

export interface CommentListParams {
  companyUuid: string;
  targetType: TargetType;
  targetUuid: string;
  skip: number;
  take: number;
}

// Explicit mention reference that can be passed alongside (or instead of)
// inline `@[Name](type:uuid)` markup in content. External API callers that
// cannot always emit the canonical markup (e.g. MCP tools, other services)
// use this array to declare who should receive a `mentioned` notification.
export interface CommentMentionInput {
  type: "user" | "agent";
  uuid: string;
  displayName?: string;
}

export interface CommentCreateParams {
  companyUuid: string;
  targetType: TargetType;
  targetUuid: string;
  content: string;
  authorType: "user" | "agent";
  authorUuid: string;
  // Optional explicit mention list. When provided, these mentions are unioned
  // with any parsed from `content` (dedupe by type+uuid). See F-028.
  mentions?: CommentMentionInput[];
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
  mentions,
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

  // Resolve the project so we can emit SSE + log activity + create notifications.
  // NOTE: previously this whole block was fire-and-forget inside a `.then()`,
  // which left notification creation racy (F-022: /api/comments produced zero
  // `comment_added` notifications). We now await it on the request path, same
  // pattern the legacy Server Actions use (see e.g. src/app/(dashboard)/
  // research-projects/[uuid]/experiment-runs/[runUuid]/comment-actions.ts).
  let researchProjectUuid: string | null = null;
  try {
    researchProjectUuid = await resolveProjectUuid(targetType, targetUuid);
  } catch (err) {
    log.error({ err }, "failed to resolve projectUuid for comment");
  }

  if (researchProjectUuid) {
    // Realtime comment refresh for the target entity
    eventBus.emitChange({
      companyUuid,
      researchProjectUuid,
      entityType: targetType as RealtimeEvent["entityType"],
      entityUuid: targetUuid,
      action: "updated",
      actorUuid: authorUuid,
    });

    // Activity log entry (for the project activity feed). We still emit this
    // because the feed renders `comment_added` entries. Notification dispatch
    // is done directly below — the notification-listener mapping for
    // `comment_added` was removed to avoid double-delivery.
    try {
      await activityService.createActivity({
        companyUuid,
        researchProjectUuid,
        targetType: targetType as activityService.TargetType,
        targetUuid,
        actorType: authorType,
        actorUuid: authorUuid,
        action: "comment_added",
      });
    } catch (err) {
      log.error({ err }, "failed to create comment_added activity");
    }

    // Direct `comment_added` notification dispatch. Recipients:
    //   - target's assignee (if any), plus
    //   - target's creator (if any),
    //   - minus the comment author,
    //   - filtered by each recipient's `commentAdded` preference.
    // Mirrors the recipient logic in notification-listener.ts (case
    // "comment_added") so the behavior lines up with what the legacy Server
    // Action paths produced via the activity->listener pipeline.
    try {
      await dispatchCommentAddedNotifications({
        companyUuid,
        researchProjectUuid,
        targetType,
        targetUuid,
        commentContent: content,
        authorType,
        authorUuid,
        authorName: authorName ?? "Someone",
      });
    } catch (err) {
      log.error({ err }, "failed to dispatch comment_added notifications");
    }
  }

  // Process @mentions before returning so notification delivery / SSE wake-up
  // stays on the request's critical path and is less likely to be dropped.
  try {
    await processCommentMentions(
      companyUuid,
      targetType,
      targetUuid,
      comment.uuid,
      content,
      authorType,
      authorUuid,
      mentions,
    );
  } catch (err) {
    log.error({ err }, "failed to process mentions");
  }

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
    case "experiment": {
      const experiment = await prisma.experiment.findUnique({
        where: { uuid: targetUuid },
        select: { researchProjectUuid: true },
      });
      return experiment?.researchProjectUuid ?? null;
    }
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
    case "experiment": {
      const experiment = await prisma.experiment.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return experiment?.title ?? "Unknown Experiment";
    }
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

// Process @mentions from a comment (called after createComment).
//
// Mentions come from two sources:
//   1. `@[Name](type:uuid)` markup parsed out of `content`.
//   2. An explicit `mentions[]` array passed by the API caller (see F-028 —
//      UI typeahead inserts canonical markup, but external API/MCP callers
//      can't always do that, so they pass a structured array instead).
//
// We union both by {type, uuid} and feed the merged list to mention.service
// for record creation + `mentioned` notification delivery.
async function processCommentMentions(
  companyUuid: string,
  targetType: string,
  targetUuid: string,
  commentUuid: string,
  content: string,
  authorType: string,
  authorUuid: string,
  explicitMentions?: CommentMentionInput[],
): Promise<void> {
  const parsed = mentionService.parseMentions(content);
  const mentions = mergeMentions(parsed, explicitMentions);
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
    explicitMentions: mentions,
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

// Merge parsed-from-content mentions with explicit mentions[] array.
// Dedupe by {type, uuid}; parsed entries win on displayName conflict because
// they carry the author's chosen rendering.
function mergeMentions(
  parsed: mentionService.MentionRef[],
  explicit: CommentMentionInput[] | undefined,
): mentionService.MentionRef[] {
  const seen = new Set<string>();
  const merged: mentionService.MentionRef[] = [];

  for (const m of parsed) {
    const key = `${m.type}:${m.uuid}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(m);
    }
  }

  if (explicit) {
    for (const m of explicit) {
      if (m.type !== "user" && m.type !== "agent") continue;
      if (!m.uuid) continue;
      const key = `${m.type}:${m.uuid}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          type: m.type,
          uuid: m.uuid,
          displayName: m.displayName ?? m.type,
        });
      }
    }
  }

  return merged;
}

// ===== Direct comment_added notification dispatch =====
//
// Resolve {assigneeType, assigneeUuid, createdByType, createdByUuid} for the
// comment target, then fan out notifications to (assignee ∪ creator) minus
// the comment author. Mirrors the recipient logic in
// notification-listener.ts case "comment_added".
interface DispatchCommentAddedParams {
  companyUuid: string;
  researchProjectUuid: string;
  targetType: string;
  targetUuid: string;
  commentContent: string;
  authorType: string;
  authorUuid: string;
  authorName: string;
}

interface CommentTargetContext {
  title: string | null;
  assigneeType?: string | null;
  assigneeUuid?: string | null;
  createdByUuid?: string | null;
  createdByType?: string | null;
}

async function resolveCommentTargetContext(
  targetType: string,
  targetUuid: string,
): Promise<CommentTargetContext | null> {
  switch (targetType) {
    case "experiment": {
      return prisma.experiment.findUnique({
        where: { uuid: targetUuid },
        select: {
          title: true,
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
          createdByType: true,
        },
      });
    }
    case "experiment_run": {
      return prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: {
          title: true,
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
        },
      });
    }
    case "research_question": {
      return prisma.researchQuestion.findUnique({
        where: { uuid: targetUuid },
        select: {
          title: true,
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
        },
      });
    }
    case "experiment_design": {
      return prisma.experimentDesign.findUnique({
        where: { uuid: targetUuid },
        select: {
          title: true,
          createdByUuid: true,
          createdByType: true,
        },
      });
    }
    case "document": {
      return prisma.document.findUnique({
        where: { uuid: targetUuid },
        select: {
          title: true,
          createdByUuid: true,
        },
      });
    }
    default:
      return null;
  }
}

async function resolveActorTypeByUuid(uuid: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { uuid },
    select: { uuid: true },
  });
  if (user) return "user";
  const agent = await prisma.agent.findUnique({
    where: { uuid },
    select: { uuid: true },
  });
  if (agent) return "agent";
  return null;
}

async function dispatchCommentAddedNotifications(
  params: DispatchCommentAddedParams,
): Promise<void> {
  const {
    companyUuid,
    researchProjectUuid,
    targetType,
    targetUuid,
    commentContent,
    authorType,
    authorUuid,
    authorName,
  } = params;

  const target = await resolveCommentTargetContext(targetType, targetUuid);
  if (!target) return;

  const entityTitle = target.title ?? fallbackCommentEntityTitle(targetType);

  const recipients: Array<{ type: string; uuid: string }> = [];

  if (target.assigneeType && target.assigneeUuid) {
    recipients.push({ type: target.assigneeType, uuid: target.assigneeUuid });
  }

  if (target.createdByUuid) {
    const creatorType =
      target.createdByType ?? (await resolveActorTypeByUuid(target.createdByUuid));
    if (creatorType) {
      recipients.push({ type: creatorType, uuid: target.createdByUuid });
    }
  }

  // Dedupe and drop the comment author themselves.
  const seen = new Set<string>();
  const uniqueRecipients = recipients.filter((r) => {
    if (r.type === authorType && r.uuid === authorUuid) return false;
    const key = `${r.type}:${r.uuid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueRecipients.length === 0) return;

  // Respect per-recipient notification preferences (commentAdded flag).
  const preferenceMap = await notificationService.getPreferencesBatch(
    companyUuid,
    uniqueRecipients.map((r) => ({ type: r.type, uuid: r.uuid })),
  );
  const eligibleRecipients = uniqueRecipients.filter((r) => {
    const prefs = preferenceMap.get(`${r.type}:${r.uuid}`);
    return prefs ? prefs.commentAdded : true;
  });

  if (eligibleRecipients.length === 0) return;

  // Build project name for notification card header.
  const project = await prisma.researchProject.findUnique({
    where: { uuid: researchProjectUuid },
    select: { name: true },
  });
  const projectName = project?.name ?? "Unknown Project";

  // Short preview of the comment — same shape the notification UI expects.
  const snippet = buildCommentSnippet(commentContent);
  const message = snippet
    ? `${authorName} commented on "${entityTitle}": ${snippet}`
    : `${authorName} commented on "${entityTitle}"`;

  const notifications: notificationService.NotificationCreateParams[] =
    eligibleRecipients.map((recipient) => ({
      companyUuid,
      researchProjectUuid,
      recipientType: recipient.type,
      recipientUuid: recipient.uuid,
      entityType: targetType,
      entityUuid: targetUuid,
      entityTitle,
      projectName,
      action: "comment_added",
      message,
      actorType: authorType,
      actorUuid: authorUuid,
      actorName: authorName,
    }));

  await notificationService.createBatch(notifications);
}

function fallbackCommentEntityTitle(targetType: string): string {
  switch (targetType) {
    case "experiment":
      return "Unknown Experiment";
    case "experiment_run":
      return "Unknown Experiment Run";
    case "research_question":
      return "Unknown Research Question";
    case "experiment_design":
      return "Unknown Experiment Design";
    case "document":
      return "Unknown Document";
    default:
      return "Unknown";
  }
}

// Same regex as mention.service so we can strip inline mention markup for a
// readable preview. Kept local to avoid cross-file coupling.
const INLINE_MENTION_REGEX =
  /@\[([^\]]+)\]\((?:user|agent):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/gi;

function buildCommentSnippet(content: string): string {
  const cleaned = content.replace(INLINE_MENTION_REGEX, "@$1").trim();
  if (cleaned.length <= 120) return cleaned;
  return cleaned.substring(0, 117) + "...";
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

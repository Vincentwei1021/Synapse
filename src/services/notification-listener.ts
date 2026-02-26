// src/services/notification-listener.ts
// Subscribes to EventBus "activity" events and generates notifications.
// Zero invasion of existing service code — all wiring happens via EventBus.

import { eventBus } from "@/lib/event-bus";
import { prisma } from "@/lib/prisma";
import * as notificationService from "./notification.service";
import type { NotificationCreateParams } from "./notification.service";

// Map (action, targetType) → notification type
// The activity action names from MCP tools are bare (e.g., "assigned", "submitted")
// while notification types are prefixed (e.g., "task_assigned").
function resolveNotificationType(action: string, targetType: string): string | null {
  const key = `${targetType}:${action}`;
  const mapping: Record<string, string> = {
    "task:assigned": "task_assigned",
    "task:status_changed": "task_status_changed",
    "task:submitted": "task_submitted_for_verify",
    "task:verified": "task_verified",
    "task:reopened": "task_reopened",
    "idea:assigned": "idea_claimed",
    "proposal:approved": "proposal_approved",
    "proposal:rejected_to_draft": "proposal_rejected",
    // comment_added is the same regardless of target type
    "task:comment_added": "comment_added",
    "idea:comment_added": "comment_added",
    "proposal:comment_added": "comment_added",
    "document:comment_added": "comment_added",
    // elaboration events (target type is always "idea")
    "idea:elaboration_started": "elaboration_requested",
    "idea:elaboration_answered": "elaboration_answered",
    "idea:elaboration_followup": "elaboration_requested",
    "idea:elaboration_resolved": "elaboration_answered",
    "idea:elaboration_skipped": "elaboration_answered",
  };
  return mapping[key] ?? null;
}

// Preference field name for each notification type
const PREF_FIELD_MAP: Record<string, keyof notificationService.NotificationPreferenceFields> = {
  task_assigned: "taskAssigned",
  task_status_changed: "taskStatusChanged",
  task_submitted_for_verify: "taskVerified",
  task_verified: "taskVerified",
  task_reopened: "taskReopened",
  proposal_submitted: "proposalSubmitted",
  proposal_approved: "proposalApproved",
  proposal_rejected: "proposalRejected",
  idea_claimed: "ideaClaimed",
  comment_added: "commentAdded",
  elaboration_requested: "elaborationRequested",
  elaboration_answered: "elaborationAnswered",
  mentioned: "mentioned",
};

interface ActivityEvent {
  uuid: string;
  companyUuid: string;
  projectUuid: string;
  targetType: string;
  targetUuid: string;
  actorType: string;
  actorUuid: string;
  action: string;
  value?: unknown;
  sessionUuid?: string;
  sessionName?: string;
}

interface Recipient {
  type: string; // "user" | "agent"
  uuid: string;
}

// ===== Resolution helpers =====

async function resolveEntityTitle(
  targetType: string,
  targetUuid: string
): Promise<string> {
  switch (targetType) {
    case "task": {
      const task = await prisma.task.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return task?.title ?? "Unknown Task";
    }
    case "idea": {
      const idea = await prisma.idea.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return idea?.title ?? "Unknown Idea";
    }
    case "proposal": {
      const proposal = await prisma.proposal.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return proposal?.title ?? "Unknown Proposal";
    }
    case "document": {
      const doc = await prisma.document.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return doc?.title ?? "Unknown Document";
    }
    default:
      return "Unknown";
  }
}

async function resolveActorName(
  actorType: string,
  actorUuid: string
): Promise<string> {
  if (actorType === "user") {
    const user = await prisma.user.findUnique({
      where: { uuid: actorUuid },
      select: { name: true, email: true },
    });
    return user?.name || user?.email || "Unknown User";
  }
  if (actorType === "agent") {
    const agent = await prisma.agent.findUnique({
      where: { uuid: actorUuid },
      select: { name: true },
    });
    return agent?.name ?? "Unknown Agent";
  }
  return "Unknown";
}

async function resolveProjectName(projectUuid: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { uuid: projectUuid },
    select: { name: true },
  });
  return project?.name ?? "Unknown Project";
}

// ===== Recipient resolution per notification type =====

async function resolveRecipients(
  notificationType: string,
  targetType: string,
  targetUuid: string,
  companyUuid: string,
  actorUuid: string
): Promise<Recipient[]> {
  switch (notificationType) {
    case "task_assigned": {
      const task = await prisma.task.findUnique({
        where: { uuid: targetUuid },
        select: { assigneeType: true, assigneeUuid: true },
      });
      if (task?.assigneeType && task?.assigneeUuid) {
        return [{ type: task.assigneeType, uuid: task.assigneeUuid }];
      }
      return [];
    }

    case "task_status_changed": {
      const task = await prisma.task.findUnique({
        where: { uuid: targetUuid },
        select: {
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
        },
      });
      if (!task) return [];
      const recipients: Recipient[] = [];
      if (task.assigneeType && task.assigneeUuid) {
        recipients.push({ type: task.assigneeType, uuid: task.assigneeUuid });
      }
      // Creator could be user or agent; resolve type
      const creatorType = await resolveActorType(task.createdByUuid);
      if (creatorType) {
        recipients.push({ type: creatorType, uuid: task.createdByUuid });
      }
      return recipients;
    }

    case "task_submitted_for_verify": {
      // Notify all admin agents in the company
      const adminAgents = await prisma.agent.findMany({
        where: {
          companyUuid,
          roles: { has: "admin_agent" },
        },
        select: { uuid: true },
      });
      // Also notify task creator
      const submittedTask = await prisma.task.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true },
      });
      const recipients: Recipient[] = adminAgents.map((a) => ({ type: "agent" as const, uuid: a.uuid }));
      if (submittedTask) {
        const creatorType = await resolveActorType(submittedTask.createdByUuid);
        if (creatorType) {
          recipients.push({ type: creatorType, uuid: submittedTask.createdByUuid });
        }
      }
      return recipients;
    }

    case "task_verified": {
      const task = await prisma.task.findUnique({
        where: { uuid: targetUuid },
        select: { assigneeType: true, assigneeUuid: true },
      });
      if (task?.assigneeType && task?.assigneeUuid) {
        return [{ type: task.assigneeType, uuid: task.assigneeUuid }];
      }
      return [];
    }

    case "task_reopened": {
      const task = await prisma.task.findUnique({
        where: { uuid: targetUuid },
        select: { assigneeType: true, assigneeUuid: true },
      });
      if (task?.assigneeType && task?.assigneeUuid) {
        return [{ type: task.assigneeType, uuid: task.assigneeUuid }];
      }
      return [];
    }

    case "proposal_approved":
    case "proposal_rejected": {
      const proposal = await prisma.proposal.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true, createdByType: true },
      });
      if (proposal) {
        return [{ type: proposal.createdByType, uuid: proposal.createdByUuid }];
      }
      return [];
    }

    case "idea_claimed": {
      const idea = await prisma.idea.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true },
      });
      if (idea) {
        // Ideas are always created by users
        return [{ type: "user", uuid: idea.createdByUuid }];
      }
      return [];
    }

    case "elaboration_requested": {
      // Notify Idea creator (user) + project admin agents
      const reqIdea = await prisma.idea.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true, projectUuid: true },
      });
      if (!reqIdea) return [];
      const reqRecipients: Recipient[] = [];
      // Idea creator is always a user
      reqRecipients.push({ type: "user", uuid: reqIdea.createdByUuid });
      // Project admin agents
      const reqAdminAgents = await prisma.agent.findMany({
        where: {
          companyUuid,
          roles: { has: "admin_agent" },
        },
        select: { uuid: true },
      });
      for (const a of reqAdminAgents) {
        reqRecipients.push({ type: "agent", uuid: a.uuid });
      }
      return reqRecipients;
    }

    case "elaboration_answered": {
      // Notify Idea assignee (the PM agent)
      const ansIdea = await prisma.idea.findUnique({
        where: { uuid: targetUuid },
        select: {
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
        },
      });
      if (!ansIdea) return [];
      const ansRecipients: Recipient[] = [];
      // For elaboration_answered from "answered" action: notify assignee (PM)
      // For elaboration_resolved/elaboration_skipped: notify idea creator
      // We distinguish based on the original action stored in the event
      // But since resolveRecipients only sees notificationType, and both map to
      // "elaboration_answered", we include both assignee and creator, then
      // the dedup + actor-exclusion in handleActivity will filter correctly.
      if (ansIdea.assigneeType && ansIdea.assigneeUuid) {
        ansRecipients.push({ type: ansIdea.assigneeType, uuid: ansIdea.assigneeUuid });
      }
      ansRecipients.push({ type: "user", uuid: ansIdea.createdByUuid });
      return ansRecipients;
    }

    case "comment_added": {
      // Notify entity assignee + creator, but EXCLUDE the comment author
      const recipients: Recipient[] = [];

      if (targetType === "task") {
        const task = await prisma.task.findUnique({
          where: { uuid: targetUuid },
          select: {
            assigneeType: true,
            assigneeUuid: true,
            createdByUuid: true,
          },
        });
        if (task) {
          if (task.assigneeType && task.assigneeUuid) {
            recipients.push({ type: task.assigneeType, uuid: task.assigneeUuid });
          }
          const creatorType = await resolveActorType(task.createdByUuid);
          if (creatorType) {
            recipients.push({ type: creatorType, uuid: task.createdByUuid });
          }
        }
      } else if (targetType === "idea") {
        const idea = await prisma.idea.findUnique({
          where: { uuid: targetUuid },
          select: {
            assigneeType: true,
            assigneeUuid: true,
            createdByUuid: true,
          },
        });
        if (idea) {
          if (idea.assigneeType && idea.assigneeUuid) {
            recipients.push({ type: idea.assigneeType, uuid: idea.assigneeUuid });
          }
          recipients.push({ type: "user", uuid: idea.createdByUuid });
        }
      } else if (targetType === "proposal") {
        const proposal = await prisma.proposal.findUnique({
          where: { uuid: targetUuid },
          select: { createdByUuid: true, createdByType: true },
        });
        if (proposal) {
          recipients.push({ type: proposal.createdByType, uuid: proposal.createdByUuid });
        }
      } else if (targetType === "document") {
        const doc = await prisma.document.findUnique({
          where: { uuid: targetUuid },
          select: { createdByUuid: true },
        });
        if (doc) {
          const creatorType = await resolveActorType(doc.createdByUuid);
          if (creatorType) {
            recipients.push({ type: creatorType, uuid: doc.createdByUuid });
          }
        }
      }

      // Exclude comment author from recipients
      return recipients.filter((r) => r.uuid !== actorUuid);
    }

    default:
      return [];
  }
}

// Helper to determine if a UUID belongs to a user or agent
async function resolveActorType(uuid: string): Promise<string | null> {
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

// Build a human-readable message for the notification
function buildMessage(
  notificationType: string,
  actorName: string,
  entityTitle: string
): string {
  switch (notificationType) {
    case "task_assigned":
      return `${actorName} assigned you to task "${entityTitle}"`;
    case "task_status_changed":
      return `${actorName} changed the status of task "${entityTitle}"`;
    case "task_submitted_for_verify":
      return `${actorName} submitted task "${entityTitle}" for verification`;
    case "task_verified":
      return `Task "${entityTitle}" has been verified`;
    case "task_reopened":
      return `Task "${entityTitle}" has been reopened`;
    case "proposal_submitted":
      return `${actorName} submitted proposal "${entityTitle}" for review`;
    case "proposal_approved":
      return `Proposal "${entityTitle}" has been approved`;
    case "proposal_rejected":
      return `Proposal "${entityTitle}" has been rejected`;
    case "idea_claimed":
      return `${actorName} claimed idea "${entityTitle}"`;
    case "comment_added":
      return `${actorName} commented on "${entityTitle}"`;
    case "elaboration_requested":
      return `${actorName} requested elaboration on idea "${entityTitle}"`;
    case "elaboration_answered":
      return `${actorName} answered elaboration questions for idea "${entityTitle}"`;
    default:
      return `${actorName} performed an action on "${entityTitle}"`;
  }
}

// ===== Main listener =====

async function handleActivity(event: ActivityEvent): Promise<void> {
  const notificationType = resolveNotificationType(event.action, event.targetType);
  if (!notificationType) return; // Not a notifiable action

  try {
    // Resolve context in parallel
    const [entityTitle, actorName, projectName] = await Promise.all([
      resolveEntityTitle(event.targetType, event.targetUuid),
      resolveActorName(event.actorType, event.actorUuid),
      resolveProjectName(event.projectUuid),
    ]);

    // Resolve recipients (pass notificationType so switch cases match)
    const recipients = await resolveRecipients(
      notificationType,
      event.targetType,
      event.targetUuid,
      event.companyUuid,
      event.actorUuid
    );

    if (recipients.length === 0) return;

    // Deduplicate recipients (same type+uuid)
    const seen = new Set<string>();
    const uniqueRecipients = recipients.filter((r) => {
      const key = `${r.type}:${r.uuid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Don't notify the actor about their own action
    const filteredRecipients = uniqueRecipients.filter(
      (r) => !(r.type === event.actorType && r.uuid === event.actorUuid)
    );

    if (filteredRecipients.length === 0) return;

    // Filter by NotificationPreference
    const prefField = PREF_FIELD_MAP[notificationType];
    const eligibleRecipients: Recipient[] = [];

    for (const recipient of filteredRecipients) {
      if (prefField) {
        const prefs = await notificationService.getPreferences(
          event.companyUuid,
          recipient.type,
          recipient.uuid
        );
        if (!prefs[prefField]) continue; // Preference is disabled
      }
      eligibleRecipients.push(recipient);
    }

    if (eligibleRecipients.length === 0) return;

    // Build notification params
    const message = buildMessage(notificationType, actorName, entityTitle);

    const notifications: NotificationCreateParams[] = eligibleRecipients.map(
      (recipient) => ({
        companyUuid: event.companyUuid,
        projectUuid: event.projectUuid,
        recipientType: recipient.type,
        recipientUuid: recipient.uuid,
        entityType: event.targetType,
        entityUuid: event.targetUuid,
        entityTitle,
        projectName,
        action: notificationType,
        message,
        actorType: event.actorType,
        actorUuid: event.actorUuid,
        actorName,
      })
    );

    await notificationService.createBatch(notifications);
  } catch (error) {
    console.error("[NotificationListener] Failed to process activity:", error);
  }
}

// Subscribe to activity events
eventBus.on("activity", (event: ActivityEvent) => {
  // Fire-and-forget — don't block the activity creation flow
  handleActivity(event);
});

console.log("[NotificationListener] Subscribed to activity events");

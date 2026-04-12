// src/services/notification-listener.ts
// Subscribes to EventBus "activity" events and generates notifications.
// Zero invasion of existing service code — all wiring happens via EventBus.

import { eventBus } from "@/lib/event-bus";
import { prisma } from "@/lib/prisma";
import * as notificationService from "./notification.service";
import type { NotificationCreateParams } from "./notification.service";

// Map (action, targetType) → notification type
// The activity action names from MCP tools are bare (e.g., "assigned", "submitted")
// while notification types are prefixed (e.g., "run_assigned").
function resolveNotificationType(action: string, targetType: string): string | null {
  const key = `${targetType}:${action}`;
  const mapping: Record<string, string> = {
    "experiment_run:assigned": "run_assigned",
    "experiment_run:status_changed": "run_status_changed",
    "experiment_run:submitted": "run_submitted_for_verify",
    "experiment_run:verified": "run_verified",
    "experiment_run:reopened": "run_reopened",
    "experiment:comment_added": "comment_added",
    "research_question:assigned": "research_question_claimed",
    "experiment_design:approved": "design_approved",
    "experiment_design:rejected_to_draft": "design_rejected",
    // comment_added is the same regardless of target type
    "experiment_run:comment_added": "comment_added",
    "research_question:comment_added": "comment_added",
    "experiment_design:comment_added": "comment_added",
    "document:comment_added": "comment_added",
    // hypothesis formulation events (target type is always "research_question")
    "research_question:hypothesis_formulation_started": "hypothesis_formulation_requested",
    "research_question:hypothesis_formulation_answered": "hypothesis_formulation_answered",
    "research_question:hypothesis_formulation_followup": "hypothesis_formulation_requested",
    "research_question:hypothesis_formulation_resolved": "hypothesis_formulation_answered",
    "research_question:hypothesis_formulation_skipped": "hypothesis_formulation_answered",
    // Experiment lifecycle events
    "experiment:status_changed": "experiment_status_changed",
    "experiment:completed": "experiment_completed",
    "experiment:progress": "experiment_progress",
    // Project-level autonomous events
    "research_project:autonomous_loop_triggered": "autonomous_loop_triggered",
    "research_project:experiment_auto_proposed": "experiment_auto_proposed",
    "research_project:synthesis_updated": "synthesis_updated",
    "research_project:auto_search_completed": "auto_search_completed",
    "research_project:deep_research_completed": "deep_research_completed",
  };
  return mapping[key] ?? null;
}

// Preference field name for each notification type
const PREF_FIELD_MAP: Record<string, keyof notificationService.NotificationPreferenceFields> = {
  run_assigned: "runAssigned",
  run_status_changed: "runStatusChanged",
  run_submitted_for_verify: "runVerified",
  run_verified: "runVerified",
  run_reopened: "runReopened",
  design_submitted: "designSubmitted",
  design_approved: "designApproved",
  design_rejected: "designRejected",
  research_question_claimed: "researchQuestionClaimed",
  comment_added: "commentAdded",
  hypothesis_formulation_requested: "hypothesisFormulationRequested",
  hypothesis_formulation_answered: "hypothesisFormulationAnswered",
  experiment_completed: "experimentCompleted",
  experiment_status_changed: "experimentStatusChanged",
  experiment_progress: "experimentProgress",
  experiment_auto_proposed: "experimentAutoProposed",
  synthesis_updated: "synthesisUpdated",
  auto_search_completed: "autoSearchCompleted",
  deep_research_completed: "deepResearchCompleted",
  autonomous_loop_triggered: "autonomousLoopTriggered",
  mentioned: "mentioned",
};

interface ActivityEvent {
  uuid: string;
  companyUuid: string;
  researchProjectUuid: string;
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

interface NotificationTargetContext {
  title: string | null;
  assigneeType?: string | null;
  assigneeUuid?: string | null;
  createdByUuid?: string | null;
  createdByType?: string | null;
}

interface ActorContext {
  name: string;
  ownerUuid: string | null;
}

// ===== Resolution helpers =====

async function resolveTargetContext(
  targetType: string,
  targetUuid: string
): Promise<NotificationTargetContext | null> {
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

function fallbackEntityTitle(targetType: string): string {
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

async function resolveActorContext(
  actorType: string,
  actorUuid: string
): Promise<ActorContext> {
  if (actorType === "user") {
    const user = await prisma.user.findUnique({
      where: { uuid: actorUuid },
      select: { name: true, email: true },
    });
    return {
      name: user?.name || user?.email || "Unknown User",
      ownerUuid: null,
    };
  }
  if (actorType === "agent") {
    const agent = await prisma.agent.findUnique({
      where: { uuid: actorUuid },
      select: { name: true, ownerUuid: true },
    });
    return {
      name: agent?.name ?? "Unknown Agent",
      ownerUuid: agent?.ownerUuid ?? null,
    };
  }
  return { name: "Unknown", ownerUuid: null };
}

async function resolveResearchProjectName(researchProjectUuid: string): Promise<string> {
  const project = await prisma.researchProject.findUnique({
    where: { uuid: researchProjectUuid },
    select: { name: true },
  });
  return project?.name ?? "Unknown Research Project";
}

// Resolve the owner of an agent. If the actor is a user, return the user directly.
// If the actor is an agent, return the agent's human owner (if set).
function resolveActorOwnerRecipient(
  actorType: string,
  actorUuid: string,
  actor: ActorContext
): Recipient | null {
  if (actorType === "user") {
    return { type: "user", uuid: actorUuid };
  }
  if (actorType === "agent" && actor.ownerUuid) {
    return { type: "user", uuid: actor.ownerUuid };
  }
  return null;
}

// ===== Recipient resolution per notification type =====

async function resolveRecipients(
  notificationType: string,
  event: ActivityEvent,
  target: NotificationTargetContext | null,
  actor: ActorContext,
  resolveActorTypeCached: (uuid: string) => Promise<string | null>
): Promise<Recipient[]> {
  switch (notificationType) {
    case "run_assigned": {
      if (target?.assigneeType && target.assigneeUuid) {
        return [{ type: target.assigneeType, uuid: target.assigneeUuid }];
      }
      return [];
    }

    case "run_status_changed": {
      if (!target) return [];
      const recipients: Recipient[] = [];
      if (target.assigneeType && target.assigneeUuid) {
        recipients.push({ type: target.assigneeType, uuid: target.assigneeUuid });
      }
      const creatorType = target.createdByType ?? (target.createdByUuid
        ? await resolveActorTypeCached(target.createdByUuid)
        : null);
      if (creatorType) {
        recipients.push({ type: creatorType, uuid: target.createdByUuid! });
      }
      return recipients;
    }

    case "run_submitted_for_verify": {
      const recipients: Recipient[] = [];
      const ownerRecipient = resolveActorOwnerRecipient(event.actorType, event.actorUuid, actor);
      if (ownerRecipient) {
        recipients.push(ownerRecipient);
      }
      if (target?.createdByUuid) {
        const creatorType = target.createdByType ?? await resolveActorTypeCached(target.createdByUuid);
        if (creatorType) {
          recipients.push({ type: creatorType, uuid: target.createdByUuid });
        }
      }
      return recipients;
    }

    case "run_verified": {
      if (target?.assigneeType && target.assigneeUuid) {
        return [{ type: target.assigneeType, uuid: target.assigneeUuid }];
      }
      return [];
    }

    case "run_reopened": {
      if (target?.assigneeType && target.assigneeUuid) {
        return [{ type: target.assigneeType, uuid: target.assigneeUuid }];
      }
      return [];
    }

    case "design_approved":
    case "design_rejected": {
      if (target?.createdByType && target.createdByUuid) {
        return [{ type: target.createdByType, uuid: target.createdByUuid }];
      }
      return [];
    }

    case "research_question_claimed": {
      if (target?.createdByUuid) {
        const recipients: Recipient[] = [
          { type: "user", uuid: target.createdByUuid },
        ];
        if (target.assigneeType && target.assigneeUuid) {
          recipients.push({ type: target.assigneeType as "user" | "agent", uuid: target.assigneeUuid });
        }
        return recipients;
      }
      return [];
    }

    case "hypothesis_formulation_requested": {
      if (!target?.createdByUuid) return [];
      const reqRecipients: Recipient[] = [];
      reqRecipients.push({ type: "user", uuid: target.createdByUuid });
      const ownerRecipient = resolveActorOwnerRecipient(event.actorType, event.actorUuid, actor);
      if (ownerRecipient) {
        reqRecipients.push(ownerRecipient);
      }
      return reqRecipients;
    }

    case "hypothesis_formulation_answered": {
      if (!target?.createdByUuid) return [];
      const ansRecipients: Recipient[] = [];
      if (target.assigneeType && target.assigneeUuid) {
        ansRecipients.push({ type: target.assigneeType, uuid: target.assigneeUuid });
      }
      ansRecipients.push({ type: "user", uuid: target.createdByUuid });
      return ansRecipients;
    }

    case "comment_added": {
      const recipients: Recipient[] = [];

      if (target?.assigneeType && target.assigneeUuid) {
        recipients.push({ type: target.assigneeType, uuid: target.assigneeUuid });
      }

      if (target?.createdByUuid) {
        const creatorType = target.createdByType ?? await resolveActorTypeCached(target.createdByUuid);
        if (creatorType) {
          recipients.push({ type: creatorType, uuid: target.createdByUuid });
        }
      }

      return recipients.filter((r) => r.uuid !== event.actorUuid);
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
  entityTitle: string,
  value?: unknown
): string {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  switch (notificationType) {
    case "run_assigned":
      return `${actorName} assigned you to experiment run "${entityTitle}"`;
    case "run_status_changed":
      return `${actorName} changed the status of experiment run "${entityTitle}"`;
    case "run_submitted_for_verify":
      return `${actorName} submitted experiment run "${entityTitle}" for verification`;
    case "run_verified":
      return `Experiment run "${entityTitle}" has been verified`;
    case "run_reopened":
      return `Experiment run "${entityTitle}" has been reopened`;
    case "design_submitted":
      return `${actorName} submitted experiment design "${entityTitle}" for review`;
    case "design_approved": {
      const approveNote = typeof v.reviewNote === "string" ? v.reviewNote.trim() : "";
      return approveNote
        ? `Experiment design "${entityTitle}" has been approved. Note: ${approveNote}`
        : `Experiment design "${entityTitle}" has been approved`;
    }
    case "design_rejected": {
      const note = typeof v.reviewNote === "string" ? v.reviewNote.trim() : "";
      return note
        ? `Experiment design "${entityTitle}" has been rejected. Reason: ${note}`
        : `Experiment design "${entityTitle}" has been rejected`;
    }
    case "research_question_claimed":
      return `${actorName} claimed research question "${entityTitle}"`;
    case "comment_added":
      return `${actorName} commented on "${entityTitle}"`;
    case "hypothesis_formulation_requested":
      return `${actorName} requested hypothesis formulation on research question "${entityTitle}"`;
    case "hypothesis_formulation_answered":
      return `${actorName} answered hypothesis formulation questions for research question "${entityTitle}"`;
    default:
      return `${actorName} performed an action on "${entityTitle}"`;
  }
}

// ===== Main listener =====

export async function handleActivity(event: ActivityEvent): Promise<void> {
  const notificationType = resolveNotificationType(event.action, event.targetType);
  if (!notificationType) return; // Not a notifiable action

  try {
    const actorTypeCache = new Map<string, string | null>();
    const resolveActorTypeCached = async (uuid: string) => {
      if (actorTypeCache.has(uuid)) {
        return actorTypeCache.get(uuid) ?? null;
      }
      const resolved = await resolveActorType(uuid);
      actorTypeCache.set(uuid, resolved);
      return resolved;
    };

    const [target, actor, projectName] = await Promise.all([
      resolveTargetContext(event.targetType, event.targetUuid),
      resolveActorContext(event.actorType, event.actorUuid),
      resolveResearchProjectName(event.researchProjectUuid),
    ]);
    const entityTitle = target?.title ?? fallbackEntityTitle(event.targetType);

    const recipients = await resolveRecipients(
      notificationType,
      event,
      target,
      actor,
      resolveActorTypeCached
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

    const prefField = PREF_FIELD_MAP[notificationType];
    const preferenceMap = prefField
      ? await notificationService.getPreferencesBatch(event.companyUuid, filteredRecipients)
      : new Map<string, notificationService.NotificationPreferenceResponse>();
    const eligibleRecipients = filteredRecipients.filter((recipient) => {
      if (!prefField) return true;
      const prefs = preferenceMap.get(`${recipient.type}:${recipient.uuid}`);
      return prefs ? Boolean(prefs[prefField]) : true;
    });

    if (eligibleRecipients.length === 0) return;

    const message = buildMessage(notificationType, actor.name, entityTitle, event.value);

    const notifications: NotificationCreateParams[] = eligibleRecipients.map(
      (recipient) => ({
        companyUuid: event.companyUuid,
        researchProjectUuid: event.researchProjectUuid,
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
        actorName: actor.name,
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

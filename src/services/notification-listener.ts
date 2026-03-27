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

// ===== Resolution helpers =====

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
      const run = await prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return run?.title ?? "Unknown Experiment Run";
    }
    case "research_question": {
      const rq = await prisma.researchQuestion.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return rq?.title ?? "Unknown Research Question";
    }
    case "experiment_design": {
      const design = await prisma.experimentDesign.findUnique({
        where: { uuid: targetUuid },
        select: { title: true },
      });
      return design?.title ?? "Unknown Experiment Design";
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

async function resolveResearchProjectName(researchProjectUuid: string): Promise<string> {
  const project = await prisma.researchProject.findUnique({
    where: { uuid: researchProjectUuid },
    select: { name: true },
  });
  return project?.name ?? "Unknown Research Project";
}

// Resolve the owner of an agent. If the actor is a user, return the user directly.
// If the actor is an agent, return the agent's human owner (if set).
async function resolveAgentOwner(
  actorType: string,
  actorUuid: string
): Promise<Recipient | null> {
  if (actorType === "user") {
    return { type: "user", uuid: actorUuid };
  }
  if (actorType === "agent") {
    const agent = await prisma.agent.findUnique({
      where: { uuid: actorUuid },
      select: { ownerUuid: true },
    });
    if (agent?.ownerUuid) {
      return { type: "user", uuid: agent.ownerUuid };
    }
  }
  return null;
}

// ===== Recipient resolution per notification type =====

async function resolveRecipients(
  notificationType: string,
  targetType: string,
  targetUuid: string,
  companyUuid: string,
  actorType: string,
  actorUuid: string
): Promise<Recipient[]> {
  switch (notificationType) {
    case "run_assigned": {
      const run = await prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: { assigneeType: true, assigneeUuid: true },
      });
      if (run?.assigneeType && run?.assigneeUuid) {
        return [{ type: run.assigneeType, uuid: run.assigneeUuid }];
      }
      return [];
    }

    case "run_status_changed": {
      const run = await prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: {
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
        },
      });
      if (!run) return [];
      const recipients: Recipient[] = [];
      if (run.assigneeType && run.assigneeUuid) {
        recipients.push({ type: run.assigneeType, uuid: run.assigneeUuid });
      }
      // Creator could be user or agent; resolve type
      const creatorType = await resolveActorType(run.createdByUuid);
      if (creatorType) {
        recipients.push({ type: creatorType, uuid: run.createdByUuid });
      }
      return recipients;
    }

    case "run_submitted_for_verify": {
      // Notify the actor's owner (human) + experiment run creator
      const recipients: Recipient[] = [];
      const ownerRecipient = await resolveAgentOwner(actorType, actorUuid);
      if (ownerRecipient) {
        recipients.push(ownerRecipient);
      }
      // Also notify experiment run creator
      const submittedRun = await prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true },
      });
      if (submittedRun) {
        const creatorType = await resolveActorType(submittedRun.createdByUuid);
        if (creatorType) {
          recipients.push({ type: creatorType, uuid: submittedRun.createdByUuid });
        }
      }
      return recipients;
    }

    case "run_verified": {
      const run = await prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: { assigneeType: true, assigneeUuid: true },
      });
      if (run?.assigneeType && run?.assigneeUuid) {
        return [{ type: run.assigneeType, uuid: run.assigneeUuid }];
      }
      return [];
    }

    case "run_reopened": {
      const run = await prisma.experimentRun.findUnique({
        where: { uuid: targetUuid },
        select: { assigneeType: true, assigneeUuid: true },
      });
      if (run?.assigneeType && run?.assigneeUuid) {
        return [{ type: run.assigneeType, uuid: run.assigneeUuid }];
      }
      return [];
    }

    case "design_approved":
    case "design_rejected": {
      const design = await prisma.experimentDesign.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true, createdByType: true },
      });
      if (design) {
        return [{ type: design.createdByType, uuid: design.createdByUuid }];
      }
      return [];
    }

    case "research_question_claimed": {
      const rq = await prisma.researchQuestion.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true, assigneeType: true, assigneeUuid: true },
      });
      if (rq) {
        const recipients: Recipient[] = [
          // Notify research question creator
          { type: "user", uuid: rq.createdByUuid },
        ];
        // Also notify the assignee (e.g., agent assigned via UI)
        if (rq.assigneeType && rq.assigneeUuid) {
          recipients.push({ type: rq.assigneeType as "user" | "agent", uuid: rq.assigneeUuid });
        }
        return recipients;
      }
      return [];
    }

    case "hypothesis_formulation_requested": {
      // Notify Research Question creator (user) + actor's owner (if actor is an agent)
      const reqRQ = await prisma.researchQuestion.findUnique({
        where: { uuid: targetUuid },
        select: { createdByUuid: true },
      });
      if (!reqRQ) return [];
      const reqRecipients: Recipient[] = [];
      // Research question creator is always a user
      reqRecipients.push({ type: "user", uuid: reqRQ.createdByUuid });
      // Actor's owner (if actor is an agent, notify the human owner)
      const ownerRecipient = await resolveAgentOwner(actorType, actorUuid);
      if (ownerRecipient) {
        reqRecipients.push(ownerRecipient);
      }
      return reqRecipients;
    }

    case "hypothesis_formulation_answered": {
      // Notify Research Question assignee (the research lead agent)
      const ansRQ = await prisma.researchQuestion.findUnique({
        where: { uuid: targetUuid },
        select: {
          assigneeType: true,
          assigneeUuid: true,
          createdByUuid: true,
        },
      });
      if (!ansRQ) return [];
      const ansRecipients: Recipient[] = [];
      if (ansRQ.assigneeType && ansRQ.assigneeUuid) {
        ansRecipients.push({ type: ansRQ.assigneeType, uuid: ansRQ.assigneeUuid });
      }
      ansRecipients.push({ type: "user", uuid: ansRQ.createdByUuid });
      return ansRecipients;
    }

    case "comment_added": {
      // Notify entity assignee + creator, but EXCLUDE the comment author
      const recipients: Recipient[] = [];

      if (targetType === "experiment") {
        const experiment = await prisma.experiment.findUnique({
          where: { uuid: targetUuid },
          select: {
            assigneeType: true,
            assigneeUuid: true,
            createdByUuid: true,
            createdByType: true,
          },
        });
        if (experiment) {
          if (experiment.assigneeType && experiment.assigneeUuid) {
            recipients.push({ type: experiment.assigneeType, uuid: experiment.assigneeUuid });
          }
          recipients.push({ type: experiment.createdByType, uuid: experiment.createdByUuid });
        }
      } else if (targetType === "experiment_run") {
        const run = await prisma.experimentRun.findUnique({
          where: { uuid: targetUuid },
          select: {
            assigneeType: true,
            assigneeUuid: true,
            createdByUuid: true,
          },
        });
        if (run) {
          if (run.assigneeType && run.assigneeUuid) {
            recipients.push({ type: run.assigneeType, uuid: run.assigneeUuid });
          }
          const creatorType = await resolveActorType(run.createdByUuid);
          if (creatorType) {
            recipients.push({ type: creatorType, uuid: run.createdByUuid });
          }
        }
      } else if (targetType === "research_question") {
        const rq = await prisma.researchQuestion.findUnique({
          where: { uuid: targetUuid },
          select: {
            assigneeType: true,
            assigneeUuid: true,
            createdByUuid: true,
          },
        });
        if (rq) {
          if (rq.assigneeType && rq.assigneeUuid) {
            recipients.push({ type: rq.assigneeType, uuid: rq.assigneeUuid });
          }
          recipients.push({ type: "user", uuid: rq.createdByUuid });
        }
      } else if (targetType === "experiment_design") {
        const design = await prisma.experimentDesign.findUnique({
          where: { uuid: targetUuid },
          select: { createdByUuid: true, createdByType: true },
        });
        if (design) {
          recipients.push({ type: design.createdByType, uuid: design.createdByUuid });
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
    // Resolve context in parallel
    const [entityTitle, actorName, projectName] = await Promise.all([
      resolveEntityTitle(event.targetType, event.targetUuid),
      resolveActorName(event.actorType, event.actorUuid),
      resolveResearchProjectName(event.researchProjectUuid),
    ]);

    // Resolve recipients (pass notificationType so switch cases match)
    const recipients = await resolveRecipients(
      notificationType,
      event.targetType,
      event.targetUuid,
      event.companyUuid,
      event.actorType,
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
    const message = buildMessage(notificationType, actorName, entityTitle, event.value);

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

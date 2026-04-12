// src/services/notification.service.ts
// Notification Service Layer — creation, querying, marking as read, preference management
// All operations scoped by companyUuid for multi-tenancy

import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";

// ===== Type Definitions =====

export interface NotificationCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  recipientType: string;
  recipientUuid: string;
  entityType: string;
  entityUuid: string;
  entityTitle: string;
  projectName: string;
  action: string;
  message: string;
  actorType: string;
  actorUuid: string;
  actorName: string;
}

export interface NotificationListParams {
  companyUuid: string;
  recipientType: string;
  recipientUuid: string;
  researchProjectUuid?: string;
  readFilter?: "all" | "unread" | "read";
  archived?: boolean;
  skip?: number;
  take?: number;
}

export interface NotificationResponse {
  uuid: string;
  researchProjectUuid: string;
  projectName: string;
  recipientType: string;
  recipientUuid: string;
  entityType: string;
  entityUuid: string;
  entityTitle: string;
  action: string;
  message: string;
  actorType: string;
  actorUuid: string;
  actorName: string;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface NotificationPreferenceFields {
  runAssigned?: boolean;
  runStatusChanged?: boolean;
  runVerified?: boolean;
  runReopened?: boolean;
  designSubmitted?: boolean;
  designApproved?: boolean;
  designRejected?: boolean;
  researchQuestionClaimed?: boolean;
  commentAdded?: boolean;
  hypothesisFormulationRequested?: boolean;
  hypothesisFormulationAnswered?: boolean;
  experimentCompleted?: boolean;
  experimentAutoProposed?: boolean;
  experimentStatusChanged?: boolean;
  experimentProgress?: boolean;
  synthesisUpdated?: boolean;
  autoSearchCompleted?: boolean;
  deepResearchCompleted?: boolean;
  autonomousLoopTriggered?: boolean;
  mentioned?: boolean;
}

export interface NotificationPreferenceResponse {
  uuid: string;
  ownerType: string;
  ownerUuid: string;
  runAssigned: boolean;
  runStatusChanged: boolean;
  runVerified: boolean;
  runReopened: boolean;
  designSubmitted: boolean;
  designApproved: boolean;
  designRejected: boolean;
  researchQuestionClaimed: boolean;
  commentAdded: boolean;
  hypothesisFormulationRequested: boolean;
  hypothesisFormulationAnswered: boolean;
  experimentCompleted: boolean;
  experimentAutoProposed: boolean;
  experimentStatusChanged: boolean;
  experimentProgress: boolean;
  synthesisUpdated: boolean;
  autoSearchCompleted: boolean;
  deepResearchCompleted: boolean;
  autonomousLoopTriggered: boolean;
  mentioned: boolean;
}

export interface NotificationPreferenceOwner {
  type: string;
  uuid: string;
}

// ===== Internal Helper Functions =====

function formatNotification(n: {
  uuid: string;
  researchProjectUuid: string;
  projectName: string;
  recipientType: string;
  recipientUuid: string;
  entityType: string;
  entityUuid: string;
  entityTitle: string;
  action: string;
  message: string;
  actorType: string;
  actorUuid: string;
  actorName: string;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
}): NotificationResponse {
  return {
    uuid: n.uuid,
    researchProjectUuid: n.researchProjectUuid,
    projectName: n.projectName,
    recipientType: n.recipientType,
    recipientUuid: n.recipientUuid,
    entityType: n.entityType,
    entityUuid: n.entityUuid,
    entityTitle: n.entityTitle,
    action: n.action,
    message: n.message,
    actorType: n.actorType,
    actorUuid: n.actorUuid,
    actorName: n.actorName,
    readAt: n.readAt?.toISOString() ?? null,
    archivedAt: n.archivedAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

// ===== Service Methods =====

/**
 * Create a single notification and emit SSE event
 */
export async function create(
  params: NotificationCreateParams
): Promise<NotificationResponse> {
  const notification = await prisma.notification.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      recipientType: params.recipientType,
      recipientUuid: params.recipientUuid,
      entityType: params.entityType,
      entityUuid: params.entityUuid,
      entityTitle: params.entityTitle,
      projectName: params.projectName,
      action: params.action,
      message: params.message,
      actorType: params.actorType,
      actorUuid: params.actorUuid,
      actorName: params.actorName,
    },
  });

  // Get updated unread count for the recipient
  const unreadCount = await prisma.notification.count({
    where: {
      companyUuid: params.companyUuid,
      recipientType: params.recipientType,
      recipientUuid: params.recipientUuid,
      readAt: null,
      archivedAt: null,
    },
  });

  // Emit SSE event for real-time notification delivery
  eventBus.emit(`notification:${params.recipientType}:${params.recipientUuid}`, {
    type: "new_notification",
    notificationUuid: notification.uuid,
    action: params.action,
    message: params.message,
    unreadCount,
  });

  return formatNotification(notification);
}

/**
 * Bulk create notifications (one per recipient) and emit per-recipient events
 */
export async function createBatch(
  notifications: NotificationCreateParams[]
): Promise<NotificationResponse[]> {
  // Create all notifications
  const created = await Promise.all(
    notifications.map((params) =>
      prisma.notification.create({
        data: {
          companyUuid: params.companyUuid,
          researchProjectUuid: params.researchProjectUuid,
          recipientType: params.recipientType,
          recipientUuid: params.recipientUuid,
          entityType: params.entityType,
          entityUuid: params.entityUuid,
          entityTitle: params.entityTitle,
          projectName: params.projectName,
          action: params.action,
          message: params.message,
          actorType: params.actorType,
          actorUuid: params.actorUuid,
          actorName: params.actorName,
        },
      })
    )
  );

  // Deduplicate recipients and emit one event per recipient
  const recipientKeys = new Set<string>();
  for (const params of notifications) {
    recipientKeys.add(`${params.recipientType}:${params.recipientUuid}:${params.companyUuid}`);
  }

  await Promise.all(
    Array.from(recipientKeys).map(async (key) => {
      const [recipientType, recipientUuid, companyUuid] = key.split(":");

      const unreadCount = await prisma.notification.count({
        where: {
          companyUuid,
          recipientType,
          recipientUuid,
          readAt: null,
          archivedAt: null,
        },
      });

      // Find the first notification for this recipient to include action/message in the event
      const recipientNotification = notifications.find(
        (n) => n.recipientType === recipientType && n.recipientUuid === recipientUuid
      );

      eventBus.emit(`notification:${recipientType}:${recipientUuid}`, {
        type: "new_notification",
        notificationUuid: created.find(
          (n) => n.recipientType === recipientType && n.recipientUuid === recipientUuid
        )?.uuid,
        action: recipientNotification?.action,
        message: recipientNotification?.message,
        unreadCount,
      });
    })
  );

  return created.map(formatNotification);
}

/**
 * List notifications for a recipient with pagination and filters
 */
export async function list(
  params: NotificationListParams
): Promise<{ notifications: NotificationResponse[]; total: number; unreadCount: number }> {
  const { companyUuid, recipientType, recipientUuid, researchProjectUuid, readFilter, archived } = params;
  const skip = params.skip ?? 0;
  const take = params.take ?? 20;

  const where = {
    companyUuid,
    recipientType,
    recipientUuid,
    ...(researchProjectUuid && { researchProjectUuid }),
    ...(readFilter === "unread" && { readAt: null }),
    ...(readFilter === "read" && { readAt: { not: null } }),
    ...(archived === false && { archivedAt: null }),
    ...(archived === true && { archivedAt: { not: null } }),
  };

  const [rawNotifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        companyUuid,
        recipientType,
        recipientUuid,
        readAt: null,
        archivedAt: null,
      },
    }),
  ]);

  return {
    notifications: rawNotifications.map(formatNotification),
    total,
    unreadCount,
  };
}

/**
 * Get unread notification count for a recipient
 */
export async function getUnreadCount(
  companyUuid: string,
  recipientType: string,
  recipientUuid: string
): Promise<number> {
  return prisma.notification.count({
    where: {
      companyUuid,
      recipientType,
      recipientUuid,
      readAt: null,
      archivedAt: null,
    },
  });
}

/**
 * Mark a single notification as read
 */
export async function markRead(
  uuid: string,
  companyUuid: string,
  recipientType: string,
  recipientUuid: string
): Promise<NotificationResponse> {
  await prisma.notification.updateMany({
    where: {
      uuid,
      companyUuid,
      recipientType,
      recipientUuid,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  // Fetch the updated notification to return
  const updated = await prisma.notification.findFirst({
    where: { uuid, companyUuid },
  });

  if (!updated) throw new Error("Notification not found");

  // Emit count update
  const unreadCount = await getUnreadCount(companyUuid, recipientType, recipientUuid);
  eventBus.emit(`notification:${recipientType}:${recipientUuid}`, {
    type: "count_update",
    unreadCount,
  });

  return formatNotification(updated);
}

/**
 * Mark all notifications as read for a recipient, optionally scoped to a project
 */
export async function markAllRead(
  companyUuid: string,
  recipientType: string,
  recipientUuid: string,
  researchProjectUuid?: string
): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: {
      companyUuid,
      recipientType,
      recipientUuid,
      readAt: null,
      ...(researchProjectUuid && { researchProjectUuid }),
    },
    data: { readAt: new Date() },
  });

  // Emit count update
  const unreadCount = await getUnreadCount(companyUuid, recipientType, recipientUuid);
  eventBus.emit(`notification:${recipientType}:${recipientUuid}`, {
    type: "count_update",
    unreadCount,
  });

  return { count: result.count };
}

/**
 * Archive a notification (soft-delete)
 */
export async function archive(
  uuid: string,
  companyUuid: string,
  recipientType: string,
  recipientUuid: string
): Promise<NotificationResponse> {
  await prisma.notification.updateMany({
    where: {
      uuid,
      companyUuid,
      recipientType,
      recipientUuid,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  const updated = await prisma.notification.findFirst({
    where: { uuid, companyUuid },
  });

  if (!updated) throw new Error("Notification not found");

  // Emit count update (archived notifications don't count as unread)
  const unreadCount = await getUnreadCount(companyUuid, recipientType, recipientUuid);
  eventBus.emit(`notification:${recipientType}:${recipientUuid}`, {
    type: "count_update",
    unreadCount,
  });

  return formatNotification(updated);
}

/**
 * Get notification preferences for an owner (user or agent), creating defaults if not found
 */
export async function getPreferences(
  companyUuid: string,
  ownerType: string,
  ownerUuid: string
): Promise<NotificationPreferenceResponse> {
  let pref = await prisma.notificationPreference.findUnique({
    where: { ownerType_ownerUuid: { ownerType, ownerUuid } },
  });

  // Create default preferences if not found
  if (!pref) {
    pref = await prisma.notificationPreference.create({
      data: {
        companyUuid,
        ownerType,
        ownerUuid,
      },
    });
  }

  return {
    uuid: pref.uuid,
    ownerType: pref.ownerType,
    ownerUuid: pref.ownerUuid,
    runAssigned: pref.runAssigned,
    runStatusChanged: pref.runStatusChanged,
    runVerified: pref.runVerified,
    runReopened: pref.runReopened,
    designSubmitted: pref.designSubmitted,
    designApproved: pref.designApproved,
    designRejected: pref.designRejected,
    researchQuestionClaimed: pref.researchQuestionClaimed,
    commentAdded: pref.commentAdded,
    hypothesisFormulationRequested: pref.hypothesisFormulationRequested,
    hypothesisFormulationAnswered: pref.hypothesisFormulationAnswered,
    mentioned: pref.mentioned,
  };
}

export async function getPreferencesBatch(
  companyUuid: string,
  owners: NotificationPreferenceOwner[]
): Promise<Map<string, NotificationPreferenceResponse>> {
  const uniqueOwners = owners.filter((owner, index, array) => {
    const key = `${owner.type}:${owner.uuid}`;
    return array.findIndex((candidate) => `${candidate.type}:${candidate.uuid}` === key) === index;
  });

  if (uniqueOwners.length === 0) {
    return new Map();
  }

  const existing = await prisma.notificationPreference.findMany({
    where: {
      companyUuid,
      OR: uniqueOwners.map((owner) => ({
        ownerType: owner.type,
        ownerUuid: owner.uuid,
      })),
    },
  });

  const existingKeys = new Set(existing.map((pref) => `${pref.ownerType}:${pref.ownerUuid}`));
  const missingOwners = uniqueOwners.filter((owner) => !existingKeys.has(`${owner.type}:${owner.uuid}`));

  if (missingOwners.length > 0) {
    await Promise.all(
      missingOwners.map((owner) =>
        prisma.notificationPreference.create({
          data: {
            companyUuid,
            ownerType: owner.type,
            ownerUuid: owner.uuid,
          },
        })
      )
    );
  }

  const allPreferences = missingOwners.length > 0
    ? await prisma.notificationPreference.findMany({
        where: {
          companyUuid,
          OR: uniqueOwners.map((owner) => ({
            ownerType: owner.type,
            ownerUuid: owner.uuid,
          })),
        },
      })
    : existing;

  return new Map(
    allPreferences.map((pref) => [
      `${pref.ownerType}:${pref.ownerUuid}`,
      {
        uuid: pref.uuid,
        ownerType: pref.ownerType,
        ownerUuid: pref.ownerUuid,
        runAssigned: pref.runAssigned,
        runStatusChanged: pref.runStatusChanged,
        runVerified: pref.runVerified,
        runReopened: pref.runReopened,
        designSubmitted: pref.designSubmitted,
        designApproved: pref.designApproved,
        designRejected: pref.designRejected,
        researchQuestionClaimed: pref.researchQuestionClaimed,
        commentAdded: pref.commentAdded,
        hypothesisFormulationRequested: pref.hypothesisFormulationRequested,
        hypothesisFormulationAnswered: pref.hypothesisFormulationAnswered,
        mentioned: pref.mentioned,
      },
    ])
  );
}

/**
 * Update (upsert) notification preferences for an owner
 */
export async function updatePreferences(
  companyUuid: string,
  ownerType: string,
  ownerUuid: string,
  prefs: NotificationPreferenceFields
): Promise<NotificationPreferenceResponse> {
  const pref = await prisma.notificationPreference.upsert({
    where: { ownerType_ownerUuid: { ownerType, ownerUuid } },
    create: {
      companyUuid,
      ownerType,
      ownerUuid,
      ...prefs,
    },
    update: prefs,
  });

  return {
    uuid: pref.uuid,
    ownerType: pref.ownerType,
    ownerUuid: pref.ownerUuid,
    runAssigned: pref.runAssigned,
    runStatusChanged: pref.runStatusChanged,
    runVerified: pref.runVerified,
    runReopened: pref.runReopened,
    designSubmitted: pref.designSubmitted,
    designApproved: pref.designApproved,
    designRejected: pref.designRejected,
    researchQuestionClaimed: pref.researchQuestionClaimed,
    commentAdded: pref.commentAdded,
    hypothesisFormulationRequested: pref.hypothesisFormulationRequested,
    hypothesisFormulationAnswered: pref.hypothesisFormulationAnswered,
    mentioned: pref.mentioned,
  };
}

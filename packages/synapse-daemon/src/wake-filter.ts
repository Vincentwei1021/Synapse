import type { SseNotificationEvent } from "./sse-listener";

const WAKE_ACTIONS = new Set(["run_assigned", "task_assigned"]);

export interface WakeDecision {
  wake: boolean;
  experimentUuid?: string;
  researchProjectUuid?: string;
  title?: string;
  message?: string;
}

export function decideWake(event: SseNotificationEvent): WakeDecision {
  if (event.type !== "new_notification") return { wake: false };
  const action = event.action ?? event.notificationType;
  if (!action || !WAKE_ACTIONS.has(action)) return { wake: false };
  if (!event.entityUuid) return { wake: false };
  return {
    wake: true,
    experimentUuid: event.entityUuid,
    researchProjectUuid: event.researchProjectUuid,
    title: event.entityTitle,
    message: event.message,
  };
}

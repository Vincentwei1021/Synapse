import type { SseNotificationEvent } from "./sse-listener.js";

const RESUME_ACTIONS = new Set(["run_assigned", "task_assigned", "experiment_instruction"]);
const INTERRUPT_ACTIONS = new Set(["experiment_interrupt"]);

export interface WakeDecision {
  wake: boolean;
  kind?: "resume" | "interrupt";
  experimentUuid?: string;
  researchProjectUuid?: string;
  title?: string;
  message?: string;
}

export function decideWake(event: SseNotificationEvent): WakeDecision {
  if (event.type !== "new_notification") return { wake: false };
  const action = event.action ?? event.notificationType;
  if (!action || !event.entityUuid) return { wake: false };
  const kind: "resume" | "interrupt" | null =
    RESUME_ACTIONS.has(action) ? "resume" : INTERRUPT_ACTIONS.has(action) ? "interrupt" : null;
  if (!kind) return { wake: false };
  return {
    wake: true,
    kind,
    experimentUuid: event.entityUuid,
    researchProjectUuid: event.researchProjectUuid,
    title: event.entityTitle,
    message: event.message,
  };
}

const MINUTE_MS = 60 * 1000;

export const AGENT_WORK_STALE_AFTER_MS = 10 * MINUTE_MS;

type TimestampValue = string | Date | null | undefined;

function toMillis(value: TimestampValue): number | null {
  if (!value) return null;
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
}

export function getLatestActivityMillis(...timestamps: TimestampValue[]): number | null {
  const values = timestamps
    .map((timestamp) => toMillis(timestamp))
    .filter((timestamp): timestamp is number => timestamp !== null);

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

export function isAgentWorkStale(input: {
  agentLastActiveAt?: TimestampValue;
  lastProgressAt?: TimestampValue;
  staleAfterMs?: number;
  now?: number | Date;
}): boolean {
  const latestActivity = getLatestActivityMillis(input.agentLastActiveAt, input.lastProgressAt);
  if (latestActivity === null) {
    return false;
  }

  const now =
    typeof input.now === "number"
      ? input.now
      : input.now instanceof Date
        ? input.now.getTime()
        : Date.now();

  return now - latestActivity > (input.staleAfterMs ?? AGENT_WORK_STALE_AFTER_MS);
}

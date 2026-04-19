const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

const configuredLevel: LogLevel =
  (typeof window !== "undefined" &&
    (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel)) ||
  (process.env.NODE_ENV === "production" ? "warn" : "debug");

const threshold = LEVELS[configuredLevel] ?? LEVELS.warn;

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= threshold;
}

export const clientLogger = {
  debug(...args: unknown[]) {
    if (shouldLog("debug")) console.debug("[Synapse]", ...args);
  },
  info(...args: unknown[]) {
    if (shouldLog("info")) console.info("[Synapse]", ...args);
  },
  warn(...args: unknown[]) {
    if (shouldLog("warn")) console.warn("[Synapse]", ...args);
  },
  error(...args: unknown[]) {
    if (shouldLog("error")) console.error("[Synapse]", ...args);
  },
};

import pino from "pino";
import { AsyncLocalStorage } from "async_hooks";

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const transport =
  process.env.NODE_ENV !== "production"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:mm:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined;

export const logger = pino({
  level,
  transport,
  base: { service: "synapse" },
});

interface RequestContext {
  logger: pino.Logger;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function createRequestLogger(
  requestId: string,
  companyUuid?: string,
): pino.Logger {
  return logger.child({
    requestId,
    ...(companyUuid ? { companyUuid } : {}),
  });
}

export function runWithRequestLogger<T>(
  requestLogger: pino.Logger,
  fn: () => T,
): T {
  return asyncLocalStorage.run({ logger: requestLogger }, fn);
}

export function getRequestLogger(): pino.Logger {
  return asyncLocalStorage.getStore()?.logger ?? logger;
}

# PGlite + Pino + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add embedded PGlite mode for zero-dependency local deployment (`npm install -g @synapse-research/synapse && synapse`) and replace all `console.log/warn/error` with structured Pino logging.

**Architecture:** New `packages/synapse-cli` package provides the CLI entry point. PGlite runs as an embedded PostgreSQL, exposing a socket for `pg.Pool` to connect. Pino replaces all console logging with structured output. The existing full-stack deployment is untouched.

**Tech Stack:** PGlite, pglite-socket, Pino, pino-pretty, Next.js standalone, Prisma migrations

**Spec:** `docs/superpowers/specs/2026-04-19-pglite-pino-cli-design.md`

---

## File Map

### New files
- `src/lib/logger.ts` — Server-side Pino logger (root logger, request logger, module child loggers)
- `src/lib/logger-client.ts` — Browser-side logger for client components
- `packages/synapse-cli/package.json` — CLI package manifest
- `packages/synapse-cli/bin/synapse.mjs` — CLI entry point
- `packages/synapse-cli/scripts/prepack-pglite.mjs` — Prepack script for npm publish

### Modified files (Pino replacement)
- `src/lib/redis.ts` — Replace 3 console calls with module logger
- `src/lib/event-bus.ts` — Replace 1 console call with module logger
- `src/lib/api-handler.ts` — Replace 1 console call with module logger
- `src/lib/api-key.ts` — Replace 1 console call with module logger
- `src/lib/super-admin.ts` — Replace 2 console calls with module logger
- `src/lib/oidc-auth.ts` — Replace 1 console call with module logger
- `src/lib/prisma.ts` — Add connection resilience ($extends retry middleware)
- `src/middleware.ts` — Replace 6 console calls (Edge Runtime: use lightweight logger, not Pino)
- `src/mcp/tools/presence.ts` — Replace 2 console calls with module logger
- `src/app/api/mcp/route.ts` — Replace 3 console calls with module logger
- `src/services/notification-listener.ts` — Replace 2 console calls
- `src/services/experiment-run-side-effects.service.ts` — Replace 1 console call
- `src/services/research-question.service.ts` — Replace 1 console call
- `src/services/comment.service.ts` — Replace 1 console call
- `src/services/experiment.service.ts` — Replace 7 console calls
- `src/lib/auth-client.ts` — Replace 1 console call with client logger
- `src/components/notification-preferences-form.tsx` — Replace 2 console calls with client logger
- `src/components/pixel-canvas.tsx` — Replace 1 console call with client logger
- `src/app/login/page.tsx` — Replace 1 console call with client logger
- `src/app/login/callback/page.tsx` — Replace 1 console call with client logger
- `src/app/login/silent-refresh/page.tsx` — Replace 1 console call with client logger
- `package.json` — Add pino, pino-pretty dependencies

---

## Task 1: Add Pino dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install pino and pino-pretty**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm add pino && pnpm add -D pino-pretty
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/weiyihao/personal/Synapse && node -e "require('pino')" && echo "pino OK"
```

Expected: `pino OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add pino and pino-pretty dependencies"
```

---

## Task 2: Create server-side logger (`src/lib/logger.ts`)

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: Create the server-side logger**

```typescript
// src/lib/logger.ts
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/weiyihao/personal/Synapse && npx tsc --noEmit src/lib/logger.ts 2>&1 | head -5
```

If tsc doesn't work standalone, just check the import works:

```bash
cd /Users/weiyihao/personal/Synapse && node -e "
const pino = require('pino');
const logger = pino({ base: { service: 'synapse' } });
logger.info('test');
" 2>&1
```

Expected: JSON output with `"msg":"test"`

- [ ] **Step 3: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat: add server-side Pino logger with request-scoped tracing"
```

---

## Task 3: Create client-side logger (`src/lib/logger-client.ts`)

**Files:**
- Create: `src/lib/logger-client.ts`

- [ ] **Step 1: Create the browser-side logger**

```typescript
// src/lib/logger-client.ts

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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/logger-client.ts
git commit -m "feat: add client-side logger with level filtering and [Synapse] prefix"
```

---

## Task 4: Replace console calls in `src/lib/` server files

**Files:**
- Modify: `src/lib/redis.ts`
- Modify: `src/lib/event-bus.ts`
- Modify: `src/lib/api-handler.ts`
- Modify: `src/lib/api-key.ts`
- Modify: `src/lib/super-admin.ts`
- Modify: `src/lib/oidc-auth.ts`

- [ ] **Step 1: Update `src/lib/redis.ts`**

Add at the top (after existing imports):
```typescript
import { logger } from "./logger";
const log = logger.child({ module: "redis" });
```

Replace line 50:
```typescript
// OLD: console.warn(`[Redis:${name}] reconnecting in ${delay}ms (attempt ${times})`);
log.warn({ name, delay, attempt: times }, "reconnecting");
```

Replace line 55:
```typescript
// OLD: console.error(`[Redis:${name}] error:`, err.message || "unknown redis error");
log.error({ name, err: err.message || "unknown redis error" }, "connection error");
```

Replace line 58:
```typescript
// OLD: console.log(`[Redis:${name}] connected`);
log.info({ name }, "connected");
```

- [ ] **Step 2: Update `src/lib/event-bus.ts`**

Add at the top (after existing imports):
```typescript
import { logger } from "./logger";
const log = logger.child({ module: "event_bus" });
```

Replace line 137:
```typescript
// OLD: console.error("[EventBus] Redis connect failed, falling back to memory:", message);
log.error({ err: message }, "Redis connect failed, falling back to memory");
```

- [ ] **Step 3: Update `src/lib/api-handler.ts`**

Add import:
```typescript
import { getRequestLogger } from "./logger";
```

Replace line 41:
```typescript
// OLD: console.error("API Error:", err);
getRequestLogger().error({ err }, "API error");
```

- [ ] **Step 4: Update `src/lib/api-key.ts`**

Add import:
```typescript
import { logger } from "./logger";
const log = logger.child({ module: "api_key" });
```

Replace line 110:
```typescript
// OLD: console.error("API key validation error:", error);
log.error({ err: error }, "API key validation error");
```

- [ ] **Step 5: Update `src/lib/super-admin.ts`**

Add import:
```typescript
import { logger } from "./logger";
const log = logger.child({ module: "auth" });
```

Replace line 37:
```typescript
// OLD: console.error("SUPER_ADMIN_PASSWORD_HASH is not set");
log.error("SUPER_ADMIN_PASSWORD_HASH is not set");
```

Replace line 43:
```typescript
// OLD: console.error("Password verification error:", error);
log.error({ err: error }, "password verification error");
```

- [ ] **Step 6: Update `src/lib/oidc-auth.ts`**

Add import:
```typescript
import { logger } from "./logger";
const log = logger.child({ module: "auth" });
```

Replace line 95:
```typescript
// OLD: console.error("OIDC token verification failed:", error);
log.error({ err: error }, "OIDC token verification failed");
```

- [ ] **Step 7: Verify build**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm build 2>&1 | tail -10
```

Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/lib/redis.ts src/lib/event-bus.ts src/lib/api-handler.ts src/lib/api-key.ts src/lib/super-admin.ts src/lib/oidc-auth.ts
git commit -m "refactor: replace console calls with Pino logger in src/lib/ server files"
```

---

## Task 5: Replace console calls in middleware (Edge Runtime)

**Files:**
- Modify: `src/middleware.ts`

**Important:** `src/middleware.ts` runs in Next.js Edge Runtime, which does NOT support Node.js `async_hooks` or Pino. Use a lightweight inline logger instead.

- [ ] **Step 1: Add edge-compatible logger to middleware**

Add near the top of `src/middleware.ts` (after existing imports):

```typescript
const edgeLog = {
  info(msg: string, ...args: unknown[]) {
    console.log(`[Synapse:middleware] ${msg}`, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    console.error(`[Synapse:middleware] ${msg}`, ...args);
  },
};
```

Replace line 133:
```typescript
// OLD: console.log("[middleware] User session refreshed for", payload?.email || refreshPayload.userUuid);
edgeLog.info("User session refreshed for", payload?.email || refreshPayload.userUuid);
```

Replace line 147:
```typescript
// OLD: console.error("[middleware] User session refresh error:", error);
edgeLog.error("User session refresh error:", error);
```

Replace line 230:
```typescript
// OLD: console.error("[middleware] Failed to discover token endpoint for issuer:", issuer);
edgeLog.error("Failed to discover token endpoint for issuer:", issuer);
```

Replace line 247:
```typescript
// OLD: console.error("[middleware] Token refresh failed:", tokenResponse.status);
edgeLog.error("Token refresh failed:", tokenResponse.status);
```

Replace line 255:
```typescript
// OLD: console.error("[middleware] No access_token in refresh response");
edgeLog.error("No access_token in refresh response");
```

Replace line 282:
```typescript
// OLD: console.error("[middleware] Token refresh error:", error);
edgeLog.error("Token refresh error:", error);
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "refactor: replace console calls with structured edge logger in middleware"
```

---

## Task 6: Replace console calls in services

**Files:**
- Modify: `src/services/notification-listener.ts`
- Modify: `src/services/experiment-run-side-effects.service.ts`
- Modify: `src/services/research-question.service.ts`
- Modify: `src/services/comment.service.ts`
- Modify: `src/services/experiment.service.ts`

- [ ] **Step 1: Update `src/services/notification-listener.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "notification_listener" });
```

Replace line 568:
```typescript
// OLD: console.error("[NotificationListener] Failed to process activity:", error);
log.error({ err: error }, "failed to process activity");
```

Replace line 578:
```typescript
// OLD: console.log("[NotificationListener] Subscribed to activity events");
log.info("subscribed to activity events");
```

- [ ] **Step 2: Update `src/services/experiment-run-side-effects.service.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "experiment_run" });
```

Replace line 73:
```typescript
// OLD: console.error("[ExperimentRun] Failed to process mentions:", err)
log.error({ err }, "failed to process mentions");
```

- [ ] **Step 3: Update `src/services/research-question.service.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "research_question" });
```

Replace line 455:
```typescript
// OLD: console.error("[Idea] Failed to process mentions:", err)
log.error({ err }, "failed to process mentions");
```

- [ ] **Step 4: Update `src/services/comment.service.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "comment" });
```

Replace line 168:
```typescript
// OLD: console.error("[Comment] Failed to process mentions:", err)
log.error({ err }, "failed to process mentions");
```

- [ ] **Step 5: Update `src/services/experiment.service.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "experiment" });
```

Replace line 807:
```typescript
// OLD: console.error("Failed to send task_assigned notification after review approval:", err);
log.error({ err }, "failed to send task_assigned notification after review approval");
```

Replace line 849:
```typescript
// OLD: console.error("Failed to emit revision request for reverted experiment:", err);
log.error({ err }, "failed to emit revision request for reverted experiment");
```

Replace line 856:
```typescript
// OLD: console.error("Autonomous loop trigger check failed:", err)
log.error({ err }, "autonomous loop trigger check failed");
```

Replace line 1232:
```typescript
// OLD: console.error("Failed to append experiment results log:", err);
log.error({ err }, "failed to append experiment results log");
```

Replace line 1290:
```typescript
// OLD: console.error("Failed to trigger experiment report:", err);
log.error({ err }, "failed to trigger experiment report");
```

Replace line 1314:
```typescript
// OLD: console.error("Failed to refresh synthesis after Mode 2 experiment:", err);
log.error({ err }, "failed to refresh synthesis after Mode 2 experiment");
```

Replace line 1319:
```typescript
// OLD: console.error("Autonomous loop trigger check failed:", err)
log.error({ err }, "autonomous loop trigger check failed");
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add src/services/notification-listener.ts src/services/experiment-run-side-effects.service.ts src/services/research-question.service.ts src/services/comment.service.ts src/services/experiment.service.ts
git commit -m "refactor: replace console calls with Pino logger in service files"
```

---

## Task 7: Replace console calls in MCP and remaining server files

**Files:**
- Modify: `src/mcp/tools/presence.ts`
- Modify: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Update `src/mcp/tools/presence.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "mcp" });
```

Replace line 118:
```typescript
// OLD: console.warn("[Presence] Failed to resolve projectUuid:", err);
log.warn({ err }, "failed to resolve projectUuid");
```

Replace line 156:
```typescript
// OLD: console.warn("[Presence] Failed to emit presence event:", err);
log.warn({ err }, "failed to emit presence event");
```

- [ ] **Step 2: Update `src/app/api/mcp/route.ts`**

Add import:
```typescript
import { logger } from "@/lib/logger";
const log = logger.child({ module: "mcp" });
```

Replace line 32:
```typescript
// OLD: console.log(`[MCP] Cleaning up expired session: ${sessionId}`);
log.debug({ sessionId }, "cleaning up expired session");
```

Replace line 33:
```typescript
// OLD: session.transport.close().catch(console.error);
session.transport.close().catch((err) => log.error({ err }, "session close error during cleanup"));
```

Replace line 139:
```typescript
// OLD: console.error("MCP endpoint error:", error);
log.error({ err: error }, "MCP endpoint error");
```

Replace line 167:
```typescript
// OLD: console.error("MCP session close error:", error);
log.error({ err: error }, "MCP session close error");
```

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/presence.ts src/app/api/mcp/route.ts
git commit -m "refactor: replace console calls with Pino logger in MCP files"
```

---

## Task 8: Replace console calls in client-side files

**Files:**
- Modify: `src/lib/auth-client.ts`
- Modify: `src/components/notification-preferences-form.tsx`
- Modify: `src/components/pixel-canvas.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/callback/page.tsx`
- Modify: `src/app/login/silent-refresh/page.tsx`

- [ ] **Step 1: Update `src/lib/auth-client.ts`**

Add import:
```typescript
import { clientLogger } from "./logger-client";
```

Replace line 118:
```typescript
// OLD: console.error("Failed to sync token to cookie");
clientLogger.error("Failed to sync token to cookie");
```

- [ ] **Step 2: Update `src/components/notification-preferences-form.tsx`**

Add import:
```typescript
import { clientLogger } from "@/lib/logger-client";
```

Replace line 153:
```typescript
// OLD: console.error("Failed to fetch notification preferences:", error);
clientLogger.error("Failed to fetch notification preferences:", error);
```

Replace line 176:
```typescript
// OLD: console.error("Failed to save notification preferences:", error);
clientLogger.error("Failed to save notification preferences:", error);
```

- [ ] **Step 3: Update `src/components/pixel-canvas.tsx`**

Add import:
```typescript
import { clientLogger } from "@/lib/logger-client";
```

Replace line 110:
```typescript
// OLD: console.warn("Failed to load sprite:", name, file);
clientLogger.warn("Failed to load sprite:", name, file);
```

- [ ] **Step 4: Update `src/app/login/page.tsx`**

Add import:
```typescript
import { clientLogger } from "@/lib/logger-client";
```

Replace line 134:
```typescript
// OLD: console.error("Login error:", err);
clientLogger.error("Login error:", err);
```

- [ ] **Step 5: Update `src/app/login/callback/page.tsx`**

Add import:
```typescript
import { clientLogger } from "@/lib/logger-client";
```

Replace line 93:
```typescript
// OLD: console.error("OIDC callback error:", err);
clientLogger.error("OIDC callback error:", err);
```

- [ ] **Step 6: Update `src/app/login/silent-refresh/page.tsx`**

Add import:
```typescript
import { clientLogger } from "@/lib/logger-client";
```

Replace line 23:
```typescript
// OLD: console.error("Silent refresh callback error:", err);
clientLogger.error("Silent refresh callback error:", err);
```

- [ ] **Step 7: Verify build**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm build 2>&1 | tail -10
```

- [ ] **Step 8: Verify zero remaining console calls (except test files)**

```bash
cd /Users/weiyihao/personal/Synapse && grep -rn "console\.\(log\|warn\|error\|info\|debug\)" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "node_modules"
```

Expected: No output (all replaced except test files)

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth-client.ts src/components/notification-preferences-form.tsx src/components/pixel-canvas.tsx src/app/login/page.tsx src/app/login/callback/page.tsx src/app/login/silent-refresh/page.tsx
git commit -m "refactor: replace console calls with client logger in frontend files"
```

---

## Task 9: Add Prisma connection resilience

**Files:**
- Modify: `src/lib/prisma.ts`

- [ ] **Step 1: Add retry middleware and pool limits**

Update `src/lib/prisma.ts`. The key changes:

1. Limit pool to 5 connections (PGlite max is 10)
2. Add `$extends` retry middleware for PGlite connection drops

```typescript
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { logger } from "./logger";

const log = logger.child({ module: "prisma" });

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST
    ? `postgresql://${process.env.DB_USERNAME}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "synapse"}`
    : undefined);

const isPglite = process.env.SYNAPSE_PGLITE === "1";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

const pool =
  globalForPrisma.pool ??
  new pg.Pool({
    connectionString,
    max: isPglite ? 5 : undefined,
    idleTimeoutMillis: isPglite ? 10_000 : undefined,
    ...(process.env.DB_HOST ? { ssl: { rejectUnauthorized: false } } : {}),
  });

const adapter = new PrismaPg(pool);

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

export const prisma = isPglite
  ? basePrisma.$extends({
      query: {
        async $allOperations({ args, query }) {
          const MAX_RETRIES = 3;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              return await query(args);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              const isConnectionError =
                message.includes("P1017") ||
                message.includes("Connection terminated") ||
                message.includes("Connection refused");
              if (!isConnectionError || attempt === MAX_RETRIES - 1) throw err;
              log.warn(
                { attempt: attempt + 1, err: message },
                "PGlite connection error, retrying",
              );
            }
          }
          throw new Error("unreachable");
        },
      },
    })
  : basePrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.pool = pool;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/prisma.ts
git commit -m "feat: add PGlite connection resilience with retry middleware"
```

---

## Task 10: Create CLI package structure

**Files:**
- Create: `packages/synapse-cli/package.json`
- Create: `packages/synapse-cli/bin/synapse.mjs`

- [ ] **Step 1: Create package.json**

```bash
mkdir -p /Users/weiyihao/personal/Synapse/packages/synapse-cli/bin
mkdir -p /Users/weiyihao/personal/Synapse/packages/synapse-cli/scripts
```

Create `packages/synapse-cli/package.json`:

```json
{
  "name": "@synapse-research/synapse",
  "version": "0.1.0",
  "description": "Synapse — AI Research Orchestration Platform (zero-dependency local mode)",
  "license": "AGPL-3.0",
  "bin": {
    "synapse": "./bin/synapse.mjs"
  },
  "files": [
    "bin/",
    "dist/"
  ],
  "scripts": {
    "prepack": "node scripts/prepack-pglite.mjs"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.4.4",
    "@electric-sql/pglite-socket": "^0.1.4",
    "dotenv": "^16.4.7"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create CLI entry point `packages/synapse-cli/bin/synapse.mjs`**

```javascript
#!/usr/bin/env node

// Synapse CLI — Zero-dependency local mode
// Starts embedded PGlite + Next.js standalone server

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, fork } from "child_process";
import { homedir } from "os";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");

// --- Parse CLI arguments ---
const args = process.argv.slice(2);
let port = 13000;
let dataDir = join(homedir(), ".synapse", "data");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--data-dir" && args[i + 1]) {
    dataDir = resolve(args[i + 1]);
    i++;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Synapse — AI Research Orchestration Platform

Usage:
  synapse [options]

Options:
  --port <number>      Port to listen on (default: 13000)
  --data-dir <path>    Data directory (default: ~/.synapse/data)
  --help, -h           Show this help message

Environment variables:
  DATABASE_URL         Use external PostgreSQL (skips embedded PGlite)
  REDIS_URL            Use external Redis (default: in-memory fallback)
  DEFAULT_USER         Default login email (default: admin@synapse.local)
  DEFAULT_PASSWORD     Default login password (default: synapse)
`);
    process.exit(0);
  }
}

// --- Banner ---
console.log("");
console.log("  Starting Synapse...");
console.log(`  Data directory: ${dataDir}`);

// --- Ensure data directory exists ---
mkdirSync(dataDir, { recursive: true });

const useExternalDb = !!process.env.DATABASE_URL;

if (!useExternalDb) {
  // --- Start PGlite ---
  console.log("  Starting embedded database...");

  const pgliteDir = join(dataDir, "pglite");
  mkdirSync(pgliteDir, { recursive: true });

  const { PGlite } = await import("@electric-sql/pglite");
  const { createServer } = await import("@electric-sql/pglite-socket");

  const db = new PGlite(pgliteDir);
  const socketServer = createServer(db);

  // Find an available port for PGlite socket
  const pglitePort = port + 1000; // e.g., 14000
  await new Promise((resolve, reject) => {
    socketServer.listen(pglitePort, "127.0.0.1", () => resolve(undefined));
    socketServer.on("error", reject);
  });

  process.env.DATABASE_URL = `postgresql://localhost:${pglitePort}/synapse`;
  process.env.SYNAPSE_PGLITE = "1";
}

// --- Run migrations ---
console.log("  Running migrations...");
const migrationsDir = join(DIST_DIR, "prisma", "migrations");
if (existsSync(migrationsDir)) {
  try {
    execSync(
      `npx prisma migrate deploy --schema ${join(DIST_DIR, "prisma", "schema.prisma")}`,
      {
        cwd: DIST_DIR,
        stdio: "pipe",
        env: { ...process.env },
      },
    );
  } catch (err) {
    console.error("  Migration failed:", err.message);
    process.exit(1);
  }
}

// --- Seed default user if empty ---
const defaultEmail = process.env.DEFAULT_USER || "admin@synapse.local";
const defaultPassword = process.env.DEFAULT_PASSWORD || "synapse";

try {
  const { PrismaClient } = await import(join(DIST_DIR, "node_modules", ".prisma", "client", "index.js"));
  const seedPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

  const companyCount = await seedPrisma.company.count();
  if (companyCount === 0) {
    const bcrypt = await import("bcrypt");
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const company = await seedPrisma.company.create({
      data: { name: "Synapse Local" },
    });

    await seedPrisma.user.create({
      data: {
        companyUuid: company.uuid,
        email: defaultEmail,
        passwordHash,
        name: "Admin",
        role: "pi",
      },
    });

    console.log(`  Default login: ${defaultEmail} / ${defaultPassword}`);
  }

  await seedPrisma.$disconnect();
} catch (err) {
  console.warn("  Seed check skipped:", err.message);
}

// --- Start Next.js standalone server ---
const serverJs = join(DIST_DIR, "server.js");
if (!existsSync(serverJs)) {
  console.error("  Error: standalone server.js not found in dist/");
  console.error("  This package may not have been built correctly.");
  process.exit(1);
}

process.env.PORT = String(port);
process.env.HOSTNAME = "127.0.0.1";
process.env.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  createHash("sha256").update(`synapse-local-${dataDir}`).digest("hex");

const child = fork(serverJs, [], {
  cwd: DIST_DIR,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));

console.log(`  Synapse is running at http://localhost:${port}`);
console.log("");

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
    process.exit(0);
  });
}
```

- [ ] **Step 3: Make the CLI executable**

```bash
chmod +x /Users/weiyihao/personal/Synapse/packages/synapse-cli/bin/synapse.mjs
```

- [ ] **Step 4: Commit**

```bash
git add packages/synapse-cli/package.json packages/synapse-cli/bin/synapse.mjs
git commit -m "feat: add synapse-cli package with PGlite embedded mode"
```

---

## Task 11: Create prepack script

**Files:**
- Create: `packages/synapse-cli/scripts/prepack-pglite.mjs`

- [ ] **Step 1: Create the prepack script**

```javascript
#!/usr/bin/env node

// prepack-pglite.mjs
// Prepares the synapse-cli package for npm publish:
// 1. Builds Next.js standalone output
// 2. Copies standalone + static + public + migrations into dist/
// 3. Dereferences pnpm symlinks so npm pack works correctly

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  unlinkSync,
} from "fs";
import { resolve, join } from "path";
import { fileURLToPath, URL } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(CLI_ROOT, "..", "..");
const DIST = join(CLI_ROOT, "dist");

console.log("[prepack] Building Next.js standalone...");
execSync("pnpm build", { cwd: PROJECT_ROOT, stdio: "inherit" });

const STANDALONE = join(PROJECT_ROOT, ".next", "standalone");
if (!existsSync(STANDALONE)) {
  console.error("[prepack] ERROR: .next/standalone not found. Build failed?");
  process.exit(1);
}

// Clean and recreate dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Copy standalone output
console.log("[prepack] Copying standalone output...");
cpSync(STANDALONE, DIST, { recursive: true });

// Copy static assets
const staticSrc = join(PROJECT_ROOT, ".next", "static");
const staticDest = join(DIST, ".next", "static");
if (existsSync(staticSrc)) {
  console.log("[prepack] Copying static assets...");
  mkdirSync(staticDest, { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
}

// Copy public
const publicSrc = join(PROJECT_ROOT, "public");
const publicDest = join(DIST, "public");
if (existsSync(publicSrc)) {
  console.log("[prepack] Copying public assets...");
  cpSync(publicSrc, publicDest, { recursive: true });
}

// Copy prisma migrations + schema
const prismaSrc = join(PROJECT_ROOT, "prisma");
const prismaDest = join(DIST, "prisma");
if (existsSync(prismaSrc)) {
  console.log("[prepack] Copying Prisma migrations...");
  mkdirSync(prismaDest, { recursive: true });
  cpSync(prismaSrc, prismaDest, { recursive: true });
}

// Dereference all symlinks in dist/node_modules
console.log("[prepack] Dereferencing pnpm symlinks...");
function dereferenceSymlinks(dir) {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = lstatSync(fullPath);

    if (stat.isSymbolicLink()) {
      const target = readlinkSync(fullPath);
      const resolvedTarget = resolve(dir, target);

      if (existsSync(resolvedTarget)) {
        unlinkSync(fullPath);
        cpSync(resolvedTarget, fullPath, {
          recursive: true,
          dereference: true,
        });
      }
    } else if (stat.isDirectory()) {
      dereferenceSymlinks(fullPath);
    }
  }
}

dereferenceSymlinks(join(DIST, "node_modules"));

console.log("[prepack] Done. dist/ is ready for npm publish.");
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x /Users/weiyihao/personal/Synapse/packages/synapse-cli/scripts/prepack-pglite.mjs
```

- [ ] **Step 3: Commit**

```bash
git add packages/synapse-cli/scripts/prepack-pglite.mjs
git commit -m "feat: add prepack script for npm publish symlink dereferencing"
```

---

## Task 12: Update spec with Edge Runtime finding

**Files:**
- Modify: `docs/superpowers/specs/2026-04-19-pglite-pino-cli-design.md`

- [ ] **Step 1: Update spec Part 3**

Add a note to the spec's Part 3 (Structured Logging) section:

```markdown
### Edge Runtime exception

`src/middleware.ts` runs in Next.js Edge Runtime, which does not support Node.js `async_hooks` or Pino.
This file uses a lightweight inline `edgeLog` object that prefixes messages with `[Synapse:middleware]`
instead of the full Pino logger.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-19-pglite-pino-cli-design.md
git commit -m "docs: note Edge Runtime exception for middleware logging"
```

---

## Task 13: Run tests and verify

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm test 2>&1 | tail -20
```

Expected: All existing tests pass. The `src/lib/__tests__/oidc-auth.test.ts` file mocks `console.error` — since `src/lib/oidc-auth.ts` now uses Pino instead, the test assertion for `console.error` will need updating.

- [ ] **Step 2: Fix test assertion in `src/lib/__tests__/oidc-auth.test.ts`**

The test at line 185 asserts `expect(console.error).toHaveBeenCalledWith(...)`. Since we replaced `console.error` with `log.error` in `oidc-auth.ts`, this assertion will no longer fire. Update the test to either:

a) Remove the `console.error` spy and assertion (the behavior is now tested via Pino output), or
b) Mock the logger module instead.

Option (a) is simpler — just remove lines 53 and 185.

- [ ] **Step 3: Run tests again**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm test 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 4: Run build**

```bash
cd /Users/weiyihao/personal/Synapse && pnpm build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 5: Verify no stray console calls remain**

```bash
cd /Users/weiyihao/personal/Synapse && grep -rn "console\.\(log\|warn\|error\|info\|debug\)" src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "node_modules" | grep -v "logger-client.ts" | grep -v "middleware.ts"
```

Expected: No output. (`logger-client.ts` intentionally uses `console.*` as its output target; `middleware.ts` uses `console.*` via `edgeLog` because Edge Runtime can't run Pino.)

- [ ] **Step 6: Commit test fix**

```bash
git add src/lib/__tests__/oidc-auth.test.ts
git commit -m "test: update oidc-auth test for Pino logger migration"
```

---

## Task 14: Sync and verify environments

- [ ] **Step 1: Sync to synapse remote**

```bash
rsync -avz --exclude .env --exclude node_modules --exclude .next /Users/weiyihao/personal/Synapse/ synapse:/home/ubuntu/Synapse/
```

- [ ] **Step 2: Commit and push from synapse remote**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add -A && git status'
```

Review status, then:

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git commit -m "feat: PGlite embedded mode + Pino structured logging + synapse-cli package" && git push -u origin session/2026-04-19-pglite-pino-cli'
```

- [ ] **Step 3: Sync locally**

```bash
cd /Users/weiyihao/personal/Synapse && git fetch && git checkout session/2026-04-19-pglite-pino-cli && git reset --hard origin/session/2026-04-19-pglite-pino-cli
```

- [ ] **Step 4: Sync to synapse-test**

```bash
ssh synapse-test 'cd /home/ubuntu/Synapse && git fetch && git checkout session/2026-04-19-pglite-pino-cli && git pull'
```

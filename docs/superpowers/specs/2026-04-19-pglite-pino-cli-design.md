# Zero-Dependency Local Deployment + Structured Logging

**Date:** 2026-04-19
**Status:** Approved
**Branch:** TBD (new branch from main)

## Summary

Add two features to Synapse:

1. **Embedded PGlite mode** — users install globally via `npm install -g @synapse-research/synapse` and run `synapse` with zero dependencies (no PostgreSQL, no Docker, no Redis)
2. **Structured logging with Pino** — replace all 38 `console.log/warn/error` calls across 20 files with structured Pino logging, including request-level tracing

The existing full-stack deployment (PostgreSQL + Redis + Docker) remains unchanged. PGlite mode is an alternative for single-user local usage.

---

## Part 1: CLI Package (`packages/synapse-cli`)

### Package structure

```
packages/synapse-cli/
  package.json              # @synapse-research/synapse
  bin/
    synapse.mjs             # CLI entry point
  scripts/
    prepack-pglite.mjs      # Dereference pnpm symlinks, bundle standalone output
```

### package.json

```json
{
  "name": "@synapse-research/synapse",
  "version": "0.1.0",
  "bin": { "synapse": "./bin/synapse.mjs" },
  "files": ["bin/", "dist/"],
  "scripts": {
    "prepack": "node scripts/prepack-pglite.mjs"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.4.4",
    "@electric-sql/pglite-socket": "^0.1.4",
    "dotenv": "^16.4.7"
  }
}
```

### CLI arguments and environment variables

```bash
synapse                                    # Start with defaults
synapse --port 3000                        # Custom port (default: 13000)
synapse --data-dir /path/to/data           # Custom data dir (default: ~/.synapse/data)
DEFAULT_USER=me@example.com synapse        # Custom login email
DEFAULT_PASSWORD=secret synapse            # Custom login password
DATABASE_URL=postgresql://... synapse      # Use external PostgreSQL (skip PGlite)
REDIS_URL=redis://... synapse              # Optional Redis (default: in-memory fallback)
```

### Startup sequence

1. Parse CLI arguments (`--port`, `--data-dir`)
2. Check `DATABASE_URL`:
   - **Not set** → start PGlite in `~/.synapse/data/pglite/`, expose via `@electric-sql/pglite-socket`, set `DATABASE_URL` to the local connection string
   - **Set** → use external PostgreSQL as-is
3. Run `prisma migrate deploy` (auto-migration)
4. Seed default user if database is empty (see Part 5)
5. Start Next.js standalone server on the configured port
6. Print startup banner with login info and URL

---

## Part 2: PGlite Integration

### Database layer changes

`src/lib/prisma.ts` does **not** need significant changes. The CLI sets `DATABASE_URL` before the Next.js process starts, so Prisma connects via `pg.Pool` as usual — transparent to the application.

```
DATABASE_URL present?
  ├── Yes (user-provided) → external PostgreSQL, existing logic
  └── Yes (CLI-injected)  → PGlite socket, same pg.Pool path
```

### Connection resilience

Add `$extends` middleware to Prisma client:

- Auto-retry failed queries, up to 3 attempts
- Evict one bad connection per retry (PGlite silently drops idle connections)
- Connection pool max size: 5 (PGlite supports max 10)

### Data persistence

- Default location: `~/.synapse/data/pglite/`
- Override: `synapse --data-dir /other/path` → data at `/other/path/pglite/`
- Reset: delete the pglite directory

### Redis

No changes needed. Existing behavior:

- `REDIS_URL` set → use Redis for cross-instance pub/sub
- `REDIS_URL` not set → in-memory EventEmitter fallback

PGlite mode runs without Redis by default. Single-process, single-user — in-memory fallback is sufficient.

---

## Part 3: Structured Logging with Pino

### New dependencies

- `pino` (dependency)
- `pino-pretty` (devDependency)

### New files

#### `src/lib/logger.ts` (server-side)

```typescript
// Environment-aware Pino logger
// - Development: pino-pretty, colorized, HH:mm:ss timestamps
// - Production: newline-delimited JSON (CloudWatch/ELK ready)
// - Base context: { service: "synapse" }
// - Log level: LOG_LEVEL env var (dev default: "debug", prod default: "info")
```

Key exports:

- `logger` — root logger instance
- `createRequestLogger(requestId, companyUuid?)` — child logger with request context
- `getRequestLogger()` — retrieve current request's logger via AsyncLocalStorage

#### `src/lib/logger-client.ts` (browser-side)

```typescript
// Browser logger for client components
// - Level: NEXT_PUBLIC_LOG_LEVEL (dev default: "debug", prod default: "warn")
// - All messages prefixed with [Synapse]
// - Outputs to console.log/warn/error based on level
```

### Request-level tracing

Use `AsyncLocalStorage` to bind each HTTP request to a unique context:

- Middleware creates a `requestId` (UUID) per request
- `createRequestLogger(requestId, companyUuid)` creates a child logger
- Any code in the call chain calls `getRequestLogger()` to get the scoped logger
- All log entries for one request share the same `requestId`

### Module-scoped child loggers

Each major module gets a child logger with `module` field:

| Module | Logger field |
|--------|-------------|
| Redis | `{ module: "redis" }` |
| EventBus | `{ module: "event_bus" }` |
| Prisma | `{ module: "prisma" }` |
| MCP | `{ module: "mcp" }` |
| Auth | `{ module: "auth" }` |
| API Key | `{ module: "api_key" }` |

### Edge Runtime exception

`src/middleware.ts` runs in Next.js Edge Runtime, which does not support Node.js `async_hooks` or Pino.
This file uses a lightweight inline `edgeLog` object that prefixes messages with `[Synapse:middleware]`
instead of the full Pino logger.

### Full replacement scope

All 38 occurrences of `console.log/warn/error` across 20 files will be replaced:

**Server-side files** (use `logger.ts`):
- `src/services/notification-listener.ts` (2)
- `src/services/experiment-run-side-effects.service.ts` (1)
- `src/services/research-question.service.ts` (1)
- `src/services/comment.service.ts` (1)
- `src/services/experiment.service.ts` (7)
- `src/lib/api-handler.ts` (1)
- `src/lib/event-bus.ts` (1)
- `src/lib/redis.ts` (3)
- `src/lib/api-key.ts` (1)
- `src/lib/super-admin.ts` (2)
- `src/lib/oidc-auth.ts` (1)
- `src/middleware.ts` (6)
- `src/mcp/tools/presence.ts` (2)
- `src/app/api/mcp/route.ts` (2)

**Client-side files** (use `logger-client.ts`):
- `src/lib/auth-client.ts` (1)
- `src/components/notification-preferences-form.tsx` (2)
- `src/components/pixel-canvas.tsx` (1)
- `src/app/login/page.tsx` (1)
- `src/app/login/callback/page.tsx` (1)
- `src/app/login/silent-refresh/page.tsx` (1)

**Test files** (leave as-is or use test logger):
- `src/lib/__tests__/oidc-auth.test.ts` (2)

---

## Part 4: npm Packaging & Publishing

### prepack script (`packages/synapse-cli/scripts/prepack-pglite.mjs`)

Runs before `npm pack` to create a self-contained distributable:

1. Execute `pnpm build` at project root (produces `.next/standalone`)
2. Copy `.next/standalone` → `packages/synapse-cli/dist/`
3. Walk `dist/node_modules/`, replace all pnpm symlinks with real file copies
4. Copy `.next/static/` → `dist/.next/static/`
5. Copy `public/` → `dist/public/`
6. Dereference PGlite packages (`@electric-sql/pglite`, `@electric-sql/pglite-socket`)
7. Copy `prisma/migrations/` → `dist/prisma/migrations/` (needed for auto-migration)

### Publishing

```bash
ssh synapse 'cd /home/ubuntu/Synapse/packages/synapse-cli && npm publish --access public'
```

### Expected package size

100-150MB (Next.js standalone + PGlite runtime + Prisma migrations + static assets).

---

## Part 5: Default User Seeding

### First-run logic (in CLI, after migrations)

1. Query: does any Company exist in the database?
2. **No** → create:
   - Company: `{ name: "Synapse Local" }`
   - User: `{ email: DEFAULT_USER || "admin@synapse.local", password: bcrypt(DEFAULT_PASSWORD || "synapse") }`
3. **Yes** → skip (never overwrite existing data)

### Startup banner

```
$ synapse
Starting Synapse...
Data directory: ~/.synapse/data
Starting embedded database...
Running migrations...
Default login: admin@synapse.local / synapse
Synapse is running at http://localhost:13000
```

---

## What does NOT change

- Full-stack deployment (PostgreSQL + Redis + Docker) — untouched
- All existing routes, APIs, MCP tools — no behavior changes
- Database schema — no new models or migrations for this feature
- `pnpm dev` / `pnpm build` / `pnpm start` — all work as before
- OpenClaw plugin — no changes needed

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| PGlite silently drops idle connections | Prisma `$extends` auto-retry middleware (3 attempts, evict bad connections) |
| pnpm symlinks break npm global install | prepack script dereferences all symlinks to real files |
| Package size too large | Next.js standalone already tree-shakes; PGlite is ~30MB; acceptable for CLI tool |
| PGlite can't handle concurrent load | Document clearly: PGlite is for single-user local usage, use external PG for multi-user |

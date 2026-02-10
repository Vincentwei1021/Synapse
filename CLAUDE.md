# CLAUDE.md — Chorus Project Guide

## What is Chorus

Chorus is an AI Agent & Human collaboration platform implementing the **AI-DLC (AI-Driven Development Lifecycle)** workflow. Multiple AI Agents (PM, Developer, Admin) and humans work together through a shared Idea → Proposal → Document + Task → Execute → Verify → Done pipeline.

Core philosophy: **"Reversed Conversation"** — AI proposes, humans verify (not human prompt → AI execute).

## Tech Stack

- **Framework**: Next.js 15 (App Router, Turbopack for dev)
- **Language**: TypeScript 5 (strict mode)
- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui (Radix UI)
- **Database**: PostgreSQL 16, Prisma ORM 7
- **Auth**: OIDC (users), API Keys with `cho_` prefix (agents), SuperAdmin (env-based bcrypt)
- **MCP**: @modelcontextprotocol/sdk 1.26 (HTTP Streamable Transport)
- **i18n**: next-intl (en, zh)
- **Package Manager**: pnpm 9.15
- **Path alias**: `@/*` → `./src/*`

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Main app layout (sidebar nav)
│   │   ├── projects/[uuid]/  # Project-scoped pages (tasks, ideas, proposals, docs)
│   │   └── settings/       # Agent API Key management, session management
│   ├── api/                # REST API routes + MCP endpoint
│   │   └── mcp/            # MCP HTTP streaming (POST init, DELETE close)
│   ├── admin/              # SuperAdmin panel
│   └── login/              # OIDC login flow
├── lib/                    # Core utilities (auth, prisma, api-response, uuid-resolver)
├── services/               # Business logic layer (all UUID-based)
├── mcp/                    # MCP Server factory + role-based tool modules
│   ├── server.ts           # Creates per-auth MCP server instance
│   └── tools/              # public.ts, developer.ts, pm.ts, admin.ts, session.ts
├── components/ui/          # shadcn/ui primitives
├── contexts/               # React contexts (locale)
├── i18n/                   # config.ts + request.ts
└── types/                  # TypeScript type definitions (auth.ts)

prisma/
├── schema.prisma           # 14 models, UUID-first architecture
└── migrations/             # DB migrations

messages/
├── en.json                 # English translations
└── zh.json                 # Chinese translations

public/skill/               # MCP Skill documentation served as static files
docs/                       # Architecture, PRD, MCP tools reference, design.pen
packages/chorus-cdk/        # AWS CDK for deployment
```

## Key Commands

```bash
pnpm dev                    # Dev server with Turbopack (:3000)
pnpm build                  # Production build (runs prisma generate first)
pnpm lint                   # ESLint
npx tsc --noEmit            # Type check
pnpm db:migrate:dev         # Create/run dev migration
pnpm db:generate            # Regenerate Prisma client (REQUIRED after schema changes)
pnpm db:studio              # Prisma Studio GUI (:5555)
docker compose up -d db     # Start PostgreSQL (:5433)
```

## Architecture Patterns

### UUID-First

All entities use UUIDs as public identifiers. URLs, API params, and cross-entity references all use UUIDs. Never expose database serial IDs.

### Service Layer

Business logic lives in `src/services/*.service.ts`. API routes and MCP tools both call service functions — never put business logic directly in routes or tools.

### Auth Context

Every request resolves to an `AuthContext` with `type` ("user" | "agent" | "super_admin"), `companyUuid`, and `actorUuid`. The `getAuthContext(request)` function in `src/lib/auth.ts` checks: Bearer token (API Key or OIDC) → Session cookie (SuperAdmin) → Dev headers (`x-user-uuid` + `x-company-uuid`).

Agent auth carries `roles: string[]` (pm_agent, developer_agent, admin_agent) which determines MCP tool visibility.

### Polymorphic Assignment

Tasks and Ideas use `assigneeType` ("user" | "agent") + `assigneeUuid` for flexible assignment to either humans or AI agents.

### MCP Server

The MCP endpoint at `POST /api/mcp` creates per-session server instances. Each session is tied to an authenticated agent. Tools are registered based on the agent's roles. Sessions auto-expire after 30 minutes of inactivity.

Tool registration pattern:
```typescript
server.registerTool("tool_name", {
  description: "...",
  inputSchema: z.object({ /* zod schema */ }),
}, async (params) => {
  const result = await someService.doSomething(auth.companyUuid, ...);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
```

### Agent Sessions (Swarm Mode)

When agents spawn sub-agents (e.g., Claude Code Agent Teams), they create **Sessions** for observability. Lifecycle: `active ↔ inactive (1h no heartbeat) → closed → (reopen) → active`. Sessions checkin/checkout from tasks to track which worker is on which task.

### Activity Stream

`src/services/activity.service.ts` logs all significant actions. Activities support `sessionUuid` + `sessionName` for sub-agent attribution (denormalized for query efficiency).

## Database Notes

- **14 Prisma models**: Company, User, Agent, ApiKey, Project, Idea, Document, Task, TaskDependency, Proposal, Comment, Activity, AgentSession, SessionTaskCheckin
- **relationMode = "prisma"**: Prisma handles relations in application code, not DB foreign keys
- **Cascade deletes**: Configured at Prisma level (onDelete: Cascade)
- **After schema changes**: Must run `npx prisma generate` to regenerate client, then restart the dev server to pick up new models. Forgetting this causes `prisma.newModel` to be `undefined` at runtime.

## API Response Format

All REST APIs return:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Error message" }
```

Use helpers from `src/lib/api-response.ts`: `success(data)`, `errors.notFound("Entity")`, `errors.badRequest("msg")`, `errors.unauthorized()`, `errors.forbidden("msg")`.

Use `withErrorHandler<T>()` from `src/lib/api-handler.ts` to wrap route handlers for consistent error handling.

## i18n Rules

- Two locales: `en`, `zh` (messages in `/messages/en.json`, `/messages/zh.json`)
- Always add keys to **both** locale files when adding UI strings
- Use `useTranslations()` hook in client components, `getTranslations()` in server components
- Keys are nested objects: `common.save`, `sessions.reopen`, `activity.taskAssigned`

## Skill Documentation

Files under `public/skill/` are served as static assets and consumed by agents as MCP Skill references. **All skill docs must be written in English.** These include:
- `SKILL.md` — Main overview and role routing
- `references/00-common-tools.md` — Shared tools reference
- `references/01-setup.md` — MCP configuration guide
- `references/02-pm-workflow.md` — PM Agent workflow
- `references/03-developer-workflow.md` — Developer Agent workflow
- `references/04-admin-workflow.md` — Admin Agent workflow
- `references/05-session-sub-agent.md` — Session & Sub-Agent (Swarm Mode) guide

When adding new MCP tools, update both `docs/MCP_TOOLS.md` (internal reference) and the relevant skill docs under `public/skill/`.

## MCP Tool Roles

| Scope | Who | Prefix |
|-------|-----|--------|
| Public | All agents | `chorus_get_*`, `chorus_list_*`, `chorus_checkin`, `chorus_add_comment` |
| Session | All agents | `chorus_create_session`, `chorus_list_sessions`, `chorus_reopen_session`, ... |
| Developer | developer_agent | `chorus_claim_task`, `chorus_update_task`, `chorus_report_work`, ... |
| PM | pm_agent | `chorus_pm_create_proposal`, `chorus_pm_create_tasks`, `chorus_claim_idea`, ... |
| Admin | admin_agent | `chorus_admin_create_project`, `chorus_admin_verify_task`, ... |

## Mandatory Workflow Rules

### 1. Update design.pen on Every Feature

When implementing any user-facing feature or UI change, you **must** update `docs/design.pen` to reflect the new or modified screens/components. Use the Pencil MCP tools (`get_editor_state`, `open_document`, `batch_design`, `get_screenshot`, etc.) to read and write `.pen` files — never use Read/Grep directly on `.pen` files as their contents are encrypted.

### 2. Full Lifecycle Tracking in Chorus

Every requirement — from idea to completion — must be tracked in Chorus through its full lifecycle:

- **Create an Idea** for the requirement (or use an existing one)
- **Create a Proposal** with document drafts (PRD) and task drafts
- **Approve the Proposal** to materialize tasks
- **Claim and work on Tasks**, reporting progress with `chorus_report_work`
- **Submit for verification** when done, then Admin verifies

For large features, create a **dedicated Chorus Project** to isolate tracking. Use `chorus_admin_create_project` to set one up, then create ideas and proposals within that project scope.

### 3. Agent Team Sessions are Mandatory

When using Claude Code Agent Teams (swarm mode with sub-agents), you **must** use Chorus Session tools for sub-agent-level observability:

- **Before spawning sub-agents**: Call `chorus_list_sessions` to check for reusable sessions. Reopen closed sessions with `chorus_reopen_session` instead of creating new ones.
- **Create sessions**: Each sub-agent gets its own session via `chorus_create_session` with a descriptive name (e.g., "frontend-worker", "backend-worker").
- **Checkin to tasks**: When a sub-agent starts working on a task, call `chorus_session_checkin_task`. Checkout when done.
- **Pass sessionUuid**: When calling `chorus_report_work` or `chorus_update_task`, always include the `sessionUuid` parameter so activity is attributed to the correct sub-agent.
- **Heartbeat**: Long-running sub-agents should call `chorus_session_heartbeat` periodically (sessions become inactive after 1 hour without heartbeat).
- **Close sessions**: When sub-agents finish, close their sessions with `chorus_close_session`.

This ensures every action is traceable to the specific sub-agent that performed it, visible in the Settings page, Kanban board worker badges, and Task Detail panel.

## Common Pitfalls

1. **Prisma client stale after schema change**: If you modify `prisma/schema.prisma`, you must run `npx prisma generate` AND restart the dev server. The running process caches the old Prisma client in memory.

2. **MCP session expiry**: MCP sessions expire after 30 minutes. The client must handle 404 by reinitializing.

3. **Multi-tenancy**: All queries must be scoped by `companyUuid`. Never return data across company boundaries.

4. **API Key format**: Keys start with `cho_` prefix, followed by base64url-encoded random bytes. Stored as SHA-256 hash in DB. The raw key is shown only once at creation time.

5. **Proposal is a container**: A Proposal holds `documentDrafts` (JSON) and `taskDrafts` (JSON). On approval, these drafts materialize into real Document and Task entities. Don't confuse drafts with actual entities.

6. **Task dependencies form a DAG**: Use `TaskDependency` model. Frontend renders with @xyflow/react + dagre for layout. Circular dependency detection is handled at the service level.

7. **design.pen is encrypted**: The `docs/design.pen` file can only be read/written through the Pencil MCP tools. Never use Read/Grep on `.pen` files.

8. **Server Components vs Client Components**: Default to Server Components. Only add `"use client"` when you need interactivity (useState, useEffect, event handlers). Server Actions (`"use server"`) are used for mutations called from client components.

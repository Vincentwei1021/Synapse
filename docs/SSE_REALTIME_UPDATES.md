# SSE Real-Time UI Updates

## Overview

When AI Agents modify Synapse data through MCP tools (moving task status, claiming ideas, approving proposals, etc.), the browser UI automatically updates without requiring a manual page refresh. This is achieved through an in-memory Event Bus combined with Server-Sent Events (SSE).

## Architecture

```
Agent/User → MCP Tool / Server Action / API Route
                        ↓
               Service Layer (mutation)
                        ↓ eventBus.emitChange()
              EventBus (in-memory EventEmitter singleton)
                        ↓
              SSE API Route (GET /api/events)
              ↓ filtered by companyUuid + projectUuid
              Browser EventSource
                        ↓ debounced (500ms)
              router.refresh() → Server Component re-fetches data → new props flow into client components
```

## Components

### 1. Event Bus — `src/lib/event-bus.ts`

A process-level singleton built on Node.js `EventEmitter`. Every service-layer mutation emits a `RealtimeEvent` after the database operation completes.

```typescript
interface RealtimeEvent {
  companyUuid: string;     // Multi-tenant isolation
  projectUuid: string;     // Project-level filtering
  entityType: "task" | "idea" | "proposal" | "document";
  entityUuid: string;      // The specific entity that changed
  action: "created" | "updated" | "deleted";
}
```

The event bus is a simple in-memory mechanism. For multi-instance deployments, it can be replaced with Redis pub/sub — the SSE endpoint and client code remain unchanged.

### 2. SSE Endpoint — `src/app/api/events/route.ts`

A Next.js Route Handler that streams server-sent events to the browser.

- **URL**: `GET /api/events?projectUuid=<uuid>`
- **Auth**: Uses `getAuthContext(request)` — browser cookies are automatically sent by `EventSource`
- **Filtering**: Events are filtered by `companyUuid` (from auth context) and optionally by `projectUuid` (from query param)
- **Heartbeat**: Sends a `: heartbeat\n\n` comment every 30 seconds to keep the connection alive
- **Cleanup**: When the client disconnects (`request.signal` abort), the event listener and heartbeat timer are removed
- **Headers**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- **Caching**: `export const dynamic = "force-dynamic"` prevents Next.js static caching

### 3. Client Hook — `src/hooks/use-realtime.ts`

A React hook that manages the `EventSource` connection and triggers UI refreshes.

```typescript
useRealtime(projectUuid: string)
```

**Behavior:**
- Creates an `EventSource` connection to `/api/events?projectUuid=<uuid>` on mount
- On receiving any message, debounces for 500ms then calls `router.refresh()`
- `router.refresh()` triggers Next.js Server Components to re-fetch data, which flows as new props into client components
- On tab visibility change: closes the connection when hidden, reconnects and refreshes when visible
- Cleans up on unmount (closes EventSource, clears timers, removes listeners)

**Why debounce?** A single operation like `approveProposal` can trigger multiple events (proposal update + batch task creation). The 500ms window collapses these into a single `router.refresh()` call.

### 4. Service Layer Event Emission

Each mutation function in the service layer calls `eventBus.emitChange()` after the database operation but before returning.

#### Task Service (`src/services/task.service.ts`)

| Function | Action | Event Data Source |
|----------|--------|-------------------|
| `createTask()` | `created` | `params.companyUuid`, `params.projectUuid` |
| `updateTask()` | `updated` | Prisma result includes `project` relation |
| `claimTask()` | `updated` | Prisma result includes `project` relation |
| `releaseTask()` | `updated` | Prisma result includes `project` relation |
| `deleteTask()` | `deleted` | Prisma `delete()` returns the deleted record |

#### Idea Service (`src/services/idea.service.ts`)

| Function | Action | Event Data Source |
|----------|--------|-------------------|
| `createIdea()` | `created` | `params.companyUuid`, `params.projectUuid` |
| `updateIdea()` | `updated` | Prisma result includes `project` relation |
| `claimIdea()` | `updated` | Prisma result includes `project` relation |
| `releaseIdea()` | `updated` | Prisma result includes `project` relation |
| `deleteIdea()` | `deleted` | Prisma `delete()` returns the deleted record |

#### Proposal Service (`src/services/proposal.service.ts`)

| Function | Action | Event Data Source |
|----------|--------|-------------------|
| `createProposal()` | `created` | `params.companyUuid`, `params.projectUuid` |
| `submitProposal()` | `updated` | Prisma result fields |
| `approveProposal()` | `updated` | Emitted after `$transaction` completes |
| `rejectProposal()` | `updated` | Prisma result fields |
| `closeProposal()` | `updated` | Prisma result fields |

#### Session Service (`src/services/session.service.ts`)

Session events are important for the worker badge indicators on the Kanban board.

| Function | Action | Entity Type | Notes |
|----------|--------|-------------|-------|
| `sessionCheckinToTask()` | `updated` | `task` | Uses task's `projectUuid` from validation query |
| `sessionCheckoutFromTask()` | `updated` | `task` | Queries task to get `projectUuid` |
| `closeSession()` | `updated` | `task` | Emits one event per active checkin being closed |

### 5. Client Component Integration

The `useRealtime()` hook is called in these client components:

| Component | File |
|-----------|------|
| `KanbanBoard` | `src/app/(dashboard)/projects/[uuid]/tasks/kanban-board.tsx` |
| `IdeasList` | `src/app/(dashboard)/projects/[uuid]/ideas/ideas-list.tsx` |
| `ProposalKanban` | `src/app/(dashboard)/projects/[uuid]/proposals/proposal-kanban.tsx` |

These components use Server Component data via props. When `router.refresh()` is called, Next.js re-runs the Server Component, which re-fetches data from the database, and the new props automatically flow into the client components.

## Multi-Tenancy

Events are scoped by `companyUuid`. The SSE endpoint filters events using the authenticated user's `companyUuid`, ensuring no cross-tenant data leakage. A user in Company A will never receive events from Company B.

## Agent Compatibility

Agents connect via API Key + Authorization header through the MCP endpoint. They do **not** use SSE. SSE is exclusively for browser users authenticated via cookies. Agent mutations trigger events that are pushed to browser users watching the same project.

## Scaling Considerations

The current implementation uses an in-memory `EventEmitter`, which works for single-instance deployments. For multi-instance deployments:

1. Replace the `EventEmitter` with **Redis pub/sub**
2. Each instance subscribes to a Redis channel
3. When a mutation occurs, publish to Redis instead of emitting locally
4. Each instance's SSE endpoint receives the Redis message and pushes to connected browsers

The SSE endpoint API and client hook code remain unchanged — only the event bus implementation needs to swap.

## File Summary

| File | Type | Purpose |
|------|------|---------|
| `src/lib/event-bus.ts` | New | EventEmitter singleton with `RealtimeEvent` type |
| `src/app/api/events/route.ts` | New | SSE endpoint with auth, filtering, heartbeat |
| `src/hooks/use-realtime.ts` | New | Client EventSource hook with debounce + visibility |
| `src/services/task.service.ts` | Modified | 5 mutations emit events |
| `src/services/idea.service.ts` | Modified | 5 mutations emit events |
| `src/services/proposal.service.ts` | Modified | 5 mutations emit events |
| `src/services/session.service.ts` | Modified | 3 mutations emit events |
| `kanban-board.tsx` | Modified | Added `useRealtime(projectUuid)` |
| `ideas-list.tsx` | Modified | Added `useRealtime(projectUuid)` |
| `proposal-kanban.tsx` | Modified | Added `useRealtime(projectUuid)` |

> [中文版本](./ARCHITECTURE.zh.md)

# Synapse Architecture

Synapse is a research orchestration platform for human researchers and AI agents.

---

## System Overview

```
 ┌────────────┐    ┌──────────────┐    ┌──────────────┐
 │  Browser   │    │  AI Agent    │    │  OpenClaw    │
 │  (Human)   │    │  (MCP)       │    │  Plugin      │
 └─────┬──────┘    └──────┬───────┘    └──────┬───────┘
       │ HTTPS            │ MCP/HTTP          │ SSE + MCP
       │                  │                   │
 ┌─────▼──────────────────▼───────────────────▼──────────┐
 │                  Next.js 15 App Router                 │
 │  ┌─────────────────────────────────────────────────┐   │
 │  │  Middleware: Auth resolve, token refresh         │   │
 │  └─────────────────────────────────────────────────┘   │
 │  ┌──────────────────┐  ┌───────────────────────────┐   │
 │  │ Server Components│  │ API Routes + MCP endpoint │   │
 │  │ + Server Actions │  │ POST /api/mcp             │   │
 │  └──────────────────┘  └───────────────────────────┘   │
 │  ┌─────────────────────────────────────────────────┐   │
 │  │  Service Layer  (src/services/*.service.ts)     │   │
 │  └─────────────────────────────────────────────────┘   │
 │  ┌─────────────────────────────────────────────────┐   │
 │  │  Prisma 7  (src/generated/prisma/)              │   │
 │  └──────────┬──────────────────────────────────────┘   │
 └─────────────┼──────────────────────────────────────────┘
               │
     ┌─────────▼──────────┐    ┌────────────────┐
     │  PostgreSQL 16     │    │  Redis 7       │
     │  (primary store)   │    │  (optional     │
     └────────────────────┘    │   pub/sub)     │
                               └────────────────┘
```

**Tech stack**: Next.js 15, React 19, TypeScript 5, Prisma 7, Tailwind CSS 4, shadcn/Radix UI, `@modelcontextprotocol/sdk` (HTTP Streamable transport), `next-intl` (en/zh), Vitest, pnpm.

---

## Data Model

31 Prisma models. Key active models:

| Model | Purpose |
|---|---|
| `Company` | Multi-tenant root |
| `User` | Human user (OIDC/default login) |
| `Agent` | AI agent with composable `roles`: `pre_research`, `research`, `experiment`, `report`, `admin` |
| `ApiKey` | `syn_` prefixed, SHA-256 hash stored, per-agent |
| `ResearchProject` | Project brief, datasets, evaluation methods, compute pool binding, autonomous loop config |
| `ResearchQuestion` | Problem framing, canvas-style hierarchy |
| `Experiment` | Primary execution unit. Five-column board: draft/pending_review/pending_start/in_progress/completed. Has `liveStatus` (sent/ack/checking_resources/queuing/running) and `liveMessage` for real-time tracking |
| `ExperimentProgressLog` | Agent progress message timeline |
| `RelatedWork` | Academic papers linked to a project (Semantic Scholar metadata) |
| `Document` | Project docs, experiment result docs, synthesis docs. Soft-linked to experiments |
| `ComputePool` / `ComputeNode` / `ComputeGpu` | Compute infrastructure |
| `ExperimentGpuReservation` | GPU reservation for experiments |
| `AgentSession` | Agent work session tracking |
| `Notification` | In-app notifications |
| `Comment` | Polymorphic comments on experiments, questions, documents |
| `Activity` | Project-level activity log |
| `ProjectGroup` | Project grouping |

Legacy models still present: `ExperimentDesign`, `ExperimentRun`, `RunDependency`, `AcceptanceCriterion`, etc.

**Database design**: UUID-based foreign keys (`relationMode = "prisma"`, no DB-level FK constraints). All public references use UUIDs, not serial IDs.

---

## Auth Model

Four authentication methods, all resolved by `getAuthContext()` in `src/lib/auth.ts`:

```
AuthContext = UserAuthContext | AgentAuthContext | SuperAdminAuthContext
```

| Method | Context type | How |
|---|---|---|
| API Key | `agent` | `Authorization: Bearer syn_...` -> SHA-256 lookup |
| OIDC + PKCE | `user` | Per-company config in DB, JWKS verification |
| Default login | `user` | `DEFAULT_USER` + `DEFAULT_PASSWORD` env vars, self-signed JWT |
| Super Admin | `super_admin` | `SUPER_ADMIN_EMAIL` + bcrypt hash, 24h JWT |

Sessions use JWT access tokens (1h) with refresh tokens (7d for default auth, provider-dependent for OIDC). Edge Middleware handles proactive token refresh.

Agent permissions are composable (stored in `Agent.roles`):

| Permission | Grants |
|---|---|
| `pre_research` | Literature search, project context reading |
| `research` | Research question CRUD, hypothesis formulation |
| `experiment` | Experiment start/complete/submit, compute tools |
| `report` | Document CRUD, synthesis tools |
| `admin` | Create/delete projects, manage groups, review research questions |

---

## MCP Integration

**Endpoint**: `POST /api/mcp` (HTTP Streamable transport with SSE support)

**Auth**: `Authorization: Bearer syn_...` header. Tool set determined by agent's `roles`.

**Tool registration**: Tools are registered per-session in `src/mcp/server.ts`. The server factory creates a new `McpServer` per auth context and registers tools from:

- `src/mcp/tools/public.ts` (all agents)
- `src/mcp/tools/session.ts` (all agents)
- `src/mcp/tools/compute.ts` (all agents)
- `src/mcp/tools/literature.ts` (all agents)
- `src/mcp/tools/research-lead.ts` (research + pi roles)
- `src/mcp/tools/researcher.ts` (experiment + pi roles)
- `src/mcp/tools/pi.ts` (pi role only)

Declarative registry helpers: `src/mcp/tools/tool-registry.ts` and `src/mcp/tools/compat-alias-tools.ts`.

**Session management**: Sliding-window expiration (30 min inactivity timeout, auto-renewed on each request, in-memory storage).

**Project filtering**: Optional `X-Synapse-Project` or `X-Synapse-Project-Group` headers to scope tool results.

---

## Real-time System

```
 Service Layer                  EventBus
      │                            │
      ├── createActivity() ──────>│
      │                            ├── Redis pub/sub (if available)
      │                            │   OR in-memory fallback
      │                            │
      │                            ▼
      │                     SSE endpoint
      │                  /api/events/notifications
      │                            │
      │                            ▼
      │                     Browser (polling)
      │                     OpenClaw plugin (SSE listener)
```

- Activities emitted through `EventBus` (Redis or in-memory)
- Notifications streamed via SSE at `/api/events/notifications`
- Experiments have `liveStatus`/`liveMessage` updated by agents via `synapse_report_experiment_progress`
- GPU telemetry started explicitly via `SYNAPSE_GPU_TELEMETRY_AUTOSTART=true`

---

## Compute Orchestration

```
 ComputePool
   └── ComputeNode (SSH/SSM access)
         └── ComputeGpu (slot index, model, telemetry)
               └── ExperimentGpuReservation
```

- Projects can bind to a compute pool via `ResearchProject.computePoolUuid`
- Agent compute access flow:
  1. `synapse_list_compute_nodes` (filtered by project if pool bound)
  2. `synapse_get_node_access_bundle` (returns SSH credentials as base64 PEM)
  3. `synapse_start_experiment` (reserves GPUs, moves to in_progress)
- GPU statuses reported by agents via `synapse_report_gpu_status` and `synapse_sync_node_inventory`
- Reservations released on experiment completion

---

## Autonomous Loop

Projects can enable a self-sustaining research cycle:

```
 Execute experiment
       │
       ▼
 All queues empty? ──No──> Wait
       │
      Yes
       │
       ▼
 Trigger assigned agent
       │
       ▼
 Agent reviews project context (synapse_get_project_full_context)
       │
       ▼
 Agent proposes experiments (synapse_propose_experiment, status=draft)
       │
       ▼
 Human reviews on board ──Approve──> Execute
```

Enabled via `ResearchProject.autonomousLoopEnabled` + `autonomousLoopAgentUuid`. The trigger fires when an experiment completes and all queues (draft, pending_review, pending_start) are empty.

---

## Multi-tenancy

Every query is scoped by `companyUuid`. This is enforced at the service layer. Super Admin is the only context that can operate across tenant boundaries.

Owner scoping within a company: agents, API keys, and sessions are additionally scoped by `ownerUuid` so one user cannot inspect another user's agents.

---

## Key File Locations

| Area | Path |
|---|---|
| MCP server factory | `src/mcp/server.ts` |
| MCP tools | `src/mcp/tools/*.ts` |
| Auth resolution | `src/lib/auth.ts` |
| API key validation | `src/lib/api-key.ts` |
| Session tokens | `src/lib/user-session.ts` |
| Service layer | `src/services/*.service.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Project metrics | `src/services/project-metrics.service.ts` |
| OpenClaw plugin | `packages/openclaw-plugin/src/` |
| CDK infrastructure | `packages/synapse-cdk/` |

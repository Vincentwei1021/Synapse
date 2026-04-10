# Agent Type & Transport Design

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Distinguish agent types (OpenClaw vs Claude Code), route task dispatch by transport capability, enhance Claude Code plugin SessionStart

## Problem

Synapse dispatches tasks (paper search, deep research, autonomous loop) from the web UI to agents via SSE notifications. The OpenClaw plugin has an SSE listener + event router that receives these in real-time. The Claude Code plugin has no equivalent — it only has synchronous lifecycle hooks. When a user dispatches a paper search to a Claude Code agent from the web UI, the notification is created but never delivered.

## Solution Overview

1. Add `type` field to the `Agent` model to distinguish agent platforms
2. Map `type` to an internal `transport` capability (`"realtime"` | `"poll"`) — not stored, not exposed
3. Web UI filters agent dropdowns by transport: only `realtime` agents appear in auto-search, deep research, and autonomous loop selectors
4. Claude Code plugin enhances SessionStart to check for pending experiment assignments and present them to the user for confirmation

## Part 1: Data Model

### Prisma Schema

`Agent` model gains a new field:

```prisma
type String @default("openclaw")
```

Valid values: `"openclaw"` | `"claude_code"`

Default is `"openclaw"` for backward compatibility — all existing agents are treated as OpenClaw.

### Backend Transport Mapping

A pure utility function maps agent type to transport capability. The transport value is never stored in the database or exposed to users.

```
src/lib/agent-transport.ts

  AGENT_TRANSPORT_MAP = {
    openclaw:    "realtime",
    claude_code: "poll",
  }

  getAgentTransport(agentType) → "realtime" | "poll"
  isRealtimeAgent(agentType)   → boolean
```

Unknown types fall back to `"poll"` (safe default — won't receive tasks it can't handle).

Future agent types (e.g., `"cursor"`, `"windsurf"`) only need a new entry in the map.

## Part 2: API Changes

### Agent CRUD

- `GET /api/agents` — returns `type` field on each agent; supports both `?type=openclaw` (exact match) and `?transport=realtime` (maps to matching types, then filters) query parameters
- `POST /api/agents` — accepts `type` field (defaults to `"openclaw"`)
- `PATCH /api/agents/[uuid]` — accepts `type` field

### Task Dispatch Validation

These endpoints validate that the target agent has `realtime` transport before creating notifications:

- `POST /api/research-projects/[uuid]/related-works/auto-search` — reject if agent is `poll` transport
- `POST /api/research-projects/[uuid]/related-works/deep-research` — reject if agent is `poll` transport

Response on validation failure: `400 { error: "Agent does not support real-time task dispatch" }`

### MCP Checkin

`synapse_checkin` response includes:

- `agent.type` — the agent's type string
- `assignments.experiments` — array of assigned experiments (new, alongside existing `experimentRuns` and `researchQuestions`)

Each experiment assignment includes: `uuid`, `title`, `status`, `projectName`, `projectUuid`.

## Part 3: Web UI Changes

### Agents Management Page (`/agents`)

- Create/edit form: new `Type` dropdown — `OpenClaw` | `Claude Code`
- Agent list: type badge next to each agent name (styled like existing role badges)

### Related Works Page — Agent Dropdowns

- Auto-search agent selector: fetches `GET /api/agents?transport=realtime`, only shows realtime agents
- Deep Research agent selector: same filter
- Empty state: if no realtime agents available, show "No agents available for real-time dispatch"

### Experiments Page — Autonomous Loop

- Autonomous loop agent selector: only shows `realtime` agents (same filter)

### Unchanged

- Experiment `assignedAgentUuid` dropdown: shows ALL agents (any type can be assigned experiments — Claude Code agents discover them at SessionStart)
- Agents list page: shows all agents regardless of type

## Part 4: Claude Code Plugin Changes

### SessionStart Hook Enhancement

Current behavior: calls `synapse_checkin`, extracts owner info, outputs checkin result.

New behavior: after checkin, if `assignments.experiments` or `assignments.experimentRuns` is non-empty, format a structured pending-assignments block in `additionalContext`:

```
## Pending Assignments

You have N pending task(s) from Synapse. Ask the user before starting any of them.

1. [Experiment] "title" (uuid: xxx) — status: pending_start, project: "project name"
2. [ExperimentRun] "title" (uuid: yyy) — status: in_progress, project: "project name"
```

Claude sees this context and informs the user. User confirms before execution begins.

### No Other Hook Changes

- `UserPromptSubmit` — unchanged, stays <100ms, no MCP calls
- `TeammateIdle` — unchanged, heartbeat only
- No notification polling mechanism added

### Interaction Flow

```
User opens Claude Code session
  → SessionStart hook fires
  → synapse_checkin returns assignments
  → If assignments exist:
      → additionalContext includes pending-assignments block
      → Claude tells user: "You have N pending Synapse tasks: ..."
      → User confirms which to execute
      → Claude calls synapse_start_experiment / synapse_search_papers etc.
  → If no assignments:
      → Normal session start (unchanged)
```

## Migration

- Existing agents get `type = "openclaw"` by default (Prisma `@default("openclaw")`)
- No data migration needed
- No breaking changes to existing API consumers (type field is optional on create, defaults to openclaw)

## Out of Scope

- Notification polling or SSE listener for Claude Code plugin
- Real-time task dispatch to Claude Code agents from web UI
- Changes to OpenClaw plugin (its SSE flow is unchanged)
- Changes to notification service or event bus

# Design: Onboarding Wizard

> Date: 2026-04-12
> Status: Approved

## Problem

New Synapse users land on an empty projects page with no guidance on how to set up agents or compute — the two prerequisites for running experiments. Each page (Agents, Compute, Projects) has its own empty state, but there's no unified flow that walks users through initial setup and verifies connectivity.

## Goals

1. Guide new users through Agent + Compute setup in a single linear flow
2. Verify Agent connectivity via real-time session detection
3. Show persistent progress in the sidebar until setup is complete
4. Allow skipping at any point without blocking access

## Non-Goals

- SSH connectivity test for compute nodes (deferred)
- Onboarding for project creation (existing empty state is sufficient)
- Multi-user/team onboarding (company-level, out of scope)

## Design

### Route & Layout

**New page**: `/onboarding` — standalone full-screen layout, no sidebar. Centered card (max-width 600px) with step indicator at top.

**Auto-redirect**: Dashboard layout checks on mount. If user has zero Agents AND zero Compute Pools AND zero Research Projects → redirect to `/onboarding`. This check is client-side in the dashboard layout, after initial data loads.

**Skip**: Each step has a "Skip" link. Top of page has "Skip setup" to exit entirely. Both navigate to `/research-projects`.

### Wizard Steps

#### Step 1: Create Agent

Form fields:
- **Name** (required, text input)
- **Type** (`openclaw` | `claude_code`, card-style toggle, default `claude_code`)
- **Roles** (5 checkboxes: `pre_research`, `research`, `experiment`, `report`, `admin`; default first three selected)

Submit calls `POST /api/agents`. On success, stores agent UUID in wizard state and advances to Step 2.

If agents already exist when wizard opens, Step 1 shows as completed (green check) and wizard starts at the next incomplete step.

#### Step 2: API Key & Connect

Two phases on the same page:

**Phase 1 — Configuration Info**

Automatically generates an API key via `POST /api/api-keys` for the agent from Step 1 (or first existing agent without a key).

Displays:
- API Key (full, one-time view, copy button, warning about non-retrievability)
- MCP Endpoint URL: `{window.location.origin}/api/mcp` (copy button)
- Configuration snippet based on agent type:
  - `claude_code`: `claude mcp add` command / `settings.json` example
  - `openclaw`: OpenClaw plugin install command

Bottom CTA: "I've configured the agent — Test Connection"

**Phase 2 — Wait for Connection**

UI: Agent name + spinner + "Waiting for agent to connect..."

Detection mechanism:
- **Primary (SSE)**: `createSession` in `session.service.ts` emits `eventBus.emitChange({ entityType: "agent_session", action: "created" })`. Frontend listens via company-wide SSE (`/api/events` without projectUuid) for `agent_session` created events matching the target agentUuid.
- **Fallback (polling)**: Every 5s, `GET /api/agents/{uuid}/sessions?status=active`. If any session exists, mark connected.

States:
- Waiting → spinner animation
- Connected → green check + "Agent connected!" + auto-advance to Step 3 after 2s
- Timeout (120s) → warning message + "Check your configuration" + Retry / Skip buttons

If agent sessions already exist when wizard opens, Step 2 shows as completed.

#### Step 3: Compute Setup

Two phases:

**Phase 1 — Create Pool**

Form: Pool name (required) + description (optional). Submit calls `POST /api/compute-pools`.

**Phase 2 — Add Machine**

Form:
- Hostname/IP (required)
- SSH User (required, default `ubuntu`)
- SSH Port (default `22`)
- Auth method toggle: Password / SSH Key
  - Password: password input
  - SSH Key: textarea for pasting private key content
- GPU count (optional, hint: auto-detected after first telemetry)

Submit calls `POST /api/compute-nodes` with the pool UUID from Phase 1.

If compute pools already exist when wizard opens, Step 3 shows as completed.

**Completion**: After Step 3 succeeds (or all steps are complete/skipped):
- All step indicators turn green
- Brief summary: "Setup complete! Created 1 Agent, 1 Compute Pool, 1 Machine"
- Auto-redirect to `/research-projects` after 3s

### Sidebar Progress Indicator

**Component**: `OnboardingProgress` in the dashboard sidebar, above the Settings link.

**Visibility condition**: user has no agents OR no compute pools. Disappears when both exist (at least 1 agent AND at least 1 pool).

**Display**: Small card/banner showing:
- Checklist with 2 items: "Agent configured" (check/x), "Compute configured" (check/x)
- Click navigates to `/onboarding` (wizard auto-detects which step to start from)

**Data source**: Fetched once on dashboard layout mount via a lightweight `GET /api/onboarding/status` endpoint that returns `{ hasAgent: boolean, hasAgentSession: boolean, hasComputePool: boolean, hasProject: boolean }`.

### Backend Changes

1. **`session.service.ts`**: Add `eventBus.emitChange` in `createSession()`:
   ```ts
   eventBus.emitChange({
     companyUuid: params.companyUuid,
     projectUuid: "",
     entityType: "agent_session",
     entityUuid: session.uuid,
     action: "created",
   });
   ```

2. **`GET /api/onboarding/status`**: New lightweight endpoint. Queries:
   - `prisma.agent.count({ where: { companyUuid } }) > 0`
   - `prisma.agentSession.count({ where: { companyUuid } }) > 0`
   - `prisma.computePool.count({ where: { companyUuid } }) > 0`
   - `prisma.researchProject.count({ where: { companyUuid } }) > 0`

3. **SSE `/api/events`**: Already supports company-wide events (no projectUuid). Need to verify `agent_session` entity type is forwarded to subscribers — may need a small addition to the event filtering logic.

### i18n

All user-facing text via `useTranslations("onboarding")`. Keys added to both `messages/en.json` and `messages/zh.json` under an `"onboarding"` namespace.

### State Management

Wizard state is local (React state), not persisted to DB. The wizard infers completion from server data:
- Has agents? → Step 1 done
- Has agent sessions? → Step 2 done
- Has compute pools? → Step 3 done

This means refreshing the page or re-entering the wizard works correctly — it always starts at the first incomplete step.

## File Plan

New files:
- `src/app/onboarding/layout.tsx` — minimal full-screen layout (no sidebar)
- `src/app/onboarding/page.tsx` — wizard page component
- `src/app/api/onboarding/status/route.ts` — status endpoint
- `src/components/onboarding-progress.tsx` — sidebar progress indicator

Modified files:
- `src/services/session.service.ts` — add emitChange in createSession
- `src/app/(dashboard)/layout.tsx` — add OnboardingProgress to sidebar + auto-redirect logic
- `messages/en.json` — add onboarding namespace
- `messages/zh.json` — add onboarding namespace

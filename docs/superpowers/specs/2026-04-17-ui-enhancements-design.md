# UI Enhancements — 2026-04-17

Four focused UI improvements:

1. Theme-aware notification card background
2. Pending-review revert with feedback and optional reassignment
3. Agent color picker (12 colors) on create and edit
4. Sidebar agent activity indicator (frame + agent chips)

## Feature 1 — Theme-aware notification card background

### Goal

Notification popup card background should be `#FFFFFF` on light theme and near-black on dark, matching other cards in the UI.

### Change

`src/components/notification-popup.tsx` — add `bg-card text-card-foreground` to the root `<div>` (currently `w-[calc(100vw-2rem)] max-w-[360px]`). The `--card` CSS variable already resolves to `#FFFFFF` on `:root` and `hsl(240 10% 3.9%)` on `.dark`, so this is a one-class change. No changes to `PopoverContent`'s default `bg-popover`.

### Files

- `src/components/notification-popup.tsx` (one line)

No backend, i18n, or schema changes.

## Feature 2 — Pending-review revert with feedback

### Goal

When a human returns a `pending_review` experiment to `draft`, let them leave a written note and optionally reassign to another agent (or none). The note is delivered to the agent as a comment + notification; realtime agents are auto-woken to revise.

### UX

- Clicking "Return to Draft" on a pending-review experiment card opens a dialog:
  - **Textarea** — "Feedback for agent (optional)"
  - **Agent dropdown** — defaults to current `assignedAgentUuid`. Options: all company agents with `experiment` permission, plus "None". Filterable. Reuses the existing assignment dropdown pattern.
  - **Buttons** — Cancel / Send back to draft
- Submit returns the card to the `draft` column and closes the dialog.

### Backend

Extend `POST /api/experiments/[uuid]/review` payload schema:

```ts
{
  approved: false,
  reviewNote?: string,
  assignedAgentUuid?: string | null
}
```

`reviewExperiment()` service (in `src/services/experiment.service.ts` or equivalent) flow when `approved: false`:

1. Update `Experiment.status = "draft"`, clear `liveStatus`, `liveMessage`.
2. If `assignedAgentUuid` is present in the payload (key exists), set it on the experiment (may be `null`).
3. Resolve the final assigned agent (new value, or existing if not touched).
4. If a final agent exists **and** `reviewNote` is non-empty:
   - Create a `Comment` with `targetType: "experiment"`, `targetUuid: experimentUuid`, `content: reviewNote`, `actorType: "user"`, `actorUuid`.
5. If a final agent exists:
   - Create a `Notification` with a new action `experiment_revision_requested` (target = experiment, message includes reviewNote preview).
   - If the agent's `type` is realtime (see `src/lib/agent-transport.ts`), dispatch a wake to OpenClaw `/hooks/agent` using the existing dispatch helper (same path used by auto-search / autonomous loop). The prompt tells the agent to revise the experiment in draft and to read the latest comment before editing.
6. If the final agent is `null`: just flip to draft. No comment, notification, or wake.

Access control: same as the current review endpoint (human, scoped to project).

### i18n

Add to `messages/en.json` and `messages/zh.json`:

- `experiments.reviewRevert.title` — "Send back to draft"
- `experiments.reviewRevert.noteLabel` — "Feedback for agent (optional)"
- `experiments.reviewRevert.notePlaceholder` — "What should the agent revise?"
- `experiments.reviewRevert.agentLabel` — "Assign to"
- `experiments.reviewRevert.agentNone` — "No agent"
- `experiments.reviewRevert.submit` — "Send back to draft"
- `notifications.actions.experimentRevisionRequested` — "requested revisions on"

### Files

- `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx` — replace the inline revert button with a dialog trigger; add dialog component
- `src/app/(dashboard)/research-projects/[uuid]/experiments/revert-dialog.tsx` — new component
- `src/services/experiment.service.ts` — extend `reviewExperiment`
- `src/app/api/experiments/[uuid]/review/route.ts` — extend zod schema
- `src/lib/notification-actions.ts` or equivalent — register `experiment_revision_requested`
- `messages/en.json`, `messages/zh.json`

No schema changes — `Comment`, `Notification`, and `Experiment.assignedAgentUuid` all exist.

## Feature 3 — Agent color picker

### Goal

Users pick an agent's color when creating, and can change it later via edit. 12 colors drawn from the existing palette; current UUID-hash behavior remains as the fallback for agents created before this feature.

### Schema

```prisma
model Agent {
  // ...
  color String?  // palette key, e.g. "terracotta". Null = UUID-hash fallback.
}
```

Migration: `pnpm db:migrate:dev -n add_agent_color`. Run `pnpm db:generate` after.

### Palette

`src/lib/agent-colors.ts` already has 12 entries. Add an exported `AGENT_COLOR_KEYS: readonly string[]` built from that array. Each palette entry already has `primary` and `light` hex values — keep them as source of truth.

`getAgentColor()` becomes `(agentUuid: string, explicitColor?: string | null)`:

- If `explicitColor` matches a known key, return that palette entry.
- Else fall back to the current UUID hash.

Default for new agents: `"terracotta"` (matches theme `--primary` `#C67A52`).

### UI

New component `src/components/agent-color-picker.tsx`:

- 12 circular swatches in a 6×2 or 4×3 grid.
- Each swatch filled with the palette's `primary` color.
- Selected swatch has a `ring-2 ring-primary ring-offset-2` outline.
- Accessible: each swatch is a `<button>` with `aria-label` = color name.

Used in:

- Create Agent dialog (under `/agents`) — field appears between "Type" and "Permissions".
- Edit Agent form — same position.

### API

- `POST /api/agents` — accept optional `color`; validate `color` is in `AGENT_COLOR_KEYS`; default to `"terracotta"` when absent.
- `PATCH /api/agents/[uuid]` — accept optional `color` with the same validation.

### Callers of getAgentColor

Audit callers and pass `agent.color` where the full Agent object is in scope:

- `src/components/ui/presence-indicator.tsx`
- Any notification / badge surface that uses `getAgentColor(uuid)`
- Sidebar section frame chips (Feature 4)

Where only the UUID is in scope, current behavior (hash) continues — acceptable because the call sites that matter most (agent cards, presence) pass the full agent.

### i18n

- `agents.form.colorLabel` — "Color"
- Optional color-name keys under `agents.colors.terracotta` etc. — used for `aria-label`.

### Files

- `prisma/schema.prisma`
- `src/lib/agent-colors.ts`
- `src/components/agent-color-picker.tsx` (new)
- `src/app/(dashboard)/agents/agents-page-client.tsx`
- `src/app/api/agents/route.ts`, `src/app/api/agents/[uuid]/route.ts`
- `src/components/ui/presence-indicator.tsx` (pass `color` prop)
- `messages/en.json`, `messages/zh.json`

## Feature 4 — Sidebar agent activity indicator

### Goal

In the sidebar, when an agent is working in a project's Related Works or Experiments section, wrap that nav item with a terracotta frame and show the agent name(s) in the top-right of the frame.

### Activity signals (task-based, no new tracking)

Service: `src/services/agent-activity.service.ts`

Per-project computation:

- **Experiments**: any `Experiment` in the project with `liveStatus in ('sent','ack','checking_resources','queuing','running')` → collect unique `assignedAgentUuid`s → return `Agent[]`.
- **Related Works**: any active related-works work for the project. v1 signal: `ResearchProject.autoSearchEnabled === true && autoSearchAgentUuid != null` and either (a) a `RelatedWork` created in the last 2 minutes by that agent, or (b) a `Document` of type `literature_review` with generation status in-progress (if status exists; if not, use (a) only). Refine if the generation-status field does not exist at implementation time; the service is the only place that needs to change.
- Other sections (Research Questions, Insights, Documents) return `[]` in v1. The service exposes them so the UI is ready to light them up later.

Return shape:

```ts
type AgentActivitySummary = {
  relatedWorks: AgentSummary[]
  experiments: AgentSummary[]
  researchQuestions: AgentSummary[]
  insights: AgentSummary[]
  documents: AgentSummary[]
}

type AgentSummary = {
  uuid: string
  name: string
  color: string | null  // palette key; null = hash fallback
}
```

### API

`GET /api/research-projects/[uuid]/agent-activity` → `AgentActivitySummary`. Scoped by `companyUuid` (user auth). Cheap read; hits Experiment + RelatedWork + Agent only.

### Realtime

Publish `agent-activity-changed` on the project channel whenever:

- `Experiment.liveStatus` transitions to/from an active value
- An auto-search task starts or stops
- A deep-research document starts or stops generation

Client subscribes via the existing SSE stream (same as notifications). On event, refetch `/agent-activity` for the active project. Polling fallback every 15 s when SSE is unavailable.

### UI

New component `src/components/sidebar-section-frame.tsx`:

Props: `{ agents: AgentSummary[]; children: ReactNode }`

- If `agents.length === 0`: render `{children}` inert (no frame).
- Else: wrap children in a relative container with `border border-primary rounded-md px-1 py-0.5`.
- Top-right (absolute `-top-2 right-2`): stacked chips:
  - Up to 2 chips showing agent names, background = agent's light color, text = agent's primary color, `text-[10px] px-1.5 py-0.5 rounded`.
  - If more agents, render a final `+N` chip.
  - Tooltip on the chip row lists every agent name.
- When multiple agents: chips sit side by side, newest first.

### Sidebar wiring

`src/app/(dashboard)/layout.tsx`:

- Load `agentActivity` for the active project via a new client hook `useAgentActivity(projectUuid)` that fetches the API and subscribes to SSE events.
- Wrap the "Related Works" and "Experiments" nav items in `<SidebarSectionFrame agents={...} />`.
- Other sections pass `agents={[]}` for now.

### Files

- `src/services/agent-activity.service.ts` (new)
- `src/app/api/research-projects/[uuid]/agent-activity/route.ts` (new)
- `src/hooks/use-agent-activity.ts` (new)
- `src/components/sidebar-section-frame.tsx` (new)
- `src/app/(dashboard)/layout.tsx`
- Event publishers in: experiment service (wherever `liveStatus` changes), auto-search dispatch, deep-research dispatch

## Shared concerns

- **Environment sync**: follow the existing workflow — commit and push from `synapse` remote, pull on `synapse-test`, reinstall/restart.
- **Tests**: add Vitest coverage for the new service functions (`reviewExperiment` revert paths, `agentActivity` aggregation, color validation).
- **OpenClaw plugin**: no changes required. The wake for Feature 2 reuses `/hooks/agent`, which the plugin already implements.
- **i18n**: every new user-facing string added to both `en.json` and `zh.json`.
- **Telemetry**: none of these features poll compute or start request-path background work, staying within the project conventions.

## Out of scope

- Redesigning the notification list layout or styling beyond the background.
- Presence-heartbeat signals for Feature 4 (task-based only in v1).
- Reproducibility / compute-budget surfaces.
- Changing the default agent-color fallback algorithm for legacy agents (still UUID hash).

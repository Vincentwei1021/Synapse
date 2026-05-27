# Paper Feeds Design

**Date**: 2026-05-27
**Goal**: Add a per-project Paper Feeds page that lets users assign an OpenClaw agent to monitor HuggingFace Daily Papers every day, judge each paper against the project's full context, and surface the relevant ones with a TL;DR and a relevance note.

## Motivation

Auto-Search is good at filling topical gaps, but it is reactive — a user has to ask. Researchers also want a passive daily intake: "what came out yesterday that I should know about for *this* project?" HuggingFace Daily Papers already curates the day's papers across categories and exposes abstracts directly via API, so the agent can judge relevance from abstracts alone without opening DeepXiv or arXiv. The output is a daily, project-specific reading list with the agent's reasoning attached.

## Architecture summary

The feature reuses the existing dispatch spine (Synapse notification → SSE → OpenClaw plugin → embedded agent run, `trigger: "cron"`). The new pieces are:

1. A **host crontab → API endpoint** to fire the daily tick.
2. Two new tables (`PaperFeedRun`, `PaperFeedItem`) and additive fields on `ResearchProject`.
3. Four new MCP tools the agent calls during a run.
4. A new project sub-page with date-grouped relevant-paper cards.

All other infrastructure (notifications, event bus, agent dispatch, i18n, role-based agent permissions) is reused as-is.

## Schema

### `ResearchProject` — additive fields

```prisma
paperFeedEnabled         Boolean   @default(false)
paperFeedAgentUuid       String?   // must be openclaw type + paper_feeds role
paperFeedActiveAgentUuid String?   // set during a run, cleared on completion
paperFeedStartedAt       DateTime?
paperFeedLastRunAt       DateTime? // for cron tick to skip already-run-today projects
```

Mirrors the existing `autoSearch*` field set so the dispatch UX (active indicator, started-at, last-run) follows the same idiom.

### `PaperFeedRun` — one row per dispatch

```prisma
model PaperFeedRun {
  uuid                 String   @id @default(uuid())
  companyUuid          String
  researchProjectUuid  String
  agentUuid            String
  feedDate             DateTime @db.Date  // the HF "papers published on this day" date the agent worked from
  status               String   // pending | running | completed | failed
  paperCount           Int      @default(0)
  errorMessage         String?
  triggeredBy          String   // cron | manual
  startedAt            DateTime @default(now())
  completedAt          DateTime?

  items                PaperFeedItem[]

  @@unique([researchProjectUuid, feedDate])  // makes the cron idempotent
  @@index([companyUuid, researchProjectUuid])
  @@index([status])
}
```

`@@unique([researchProjectUuid, feedDate])` is load-bearing: the cron tick relies on it to be race-safe — a second tick for the same `(project, feedDate)` either reuses the existing row or no-ops, never creates a duplicate.

### `PaperFeedItem` — one row per relevant paper

```prisma
model PaperFeedItem {
  uuid                 String   @id @default(uuid())
  companyUuid          String
  researchProjectUuid  String
  feedRunUuid          String
  feedDate             DateTime @db.Date  // denormalized from the run for cheap date-grouping queries
  paperId              String   // HF Daily Papers paper.id
  arxivId              String?
  title                String
  authors              String
  abstract             String
  paperUrl             String
  summary              String   // agent's TL;DR (2–4 sentences)
  relevanceNote        String   // why it matters to this project (1–3 sentences)
  relatedWorkUuid      String?  // set when user promotes to RelatedWork
  createdAt            DateTime @default(now())

  feedRun              PaperFeedRun @relation(fields: [feedRunUuid], references: [uuid], onDelete: Cascade)

  @@unique([researchProjectUuid, paperId])  // a project never shows the same paper twice across days
  @@index([researchProjectUuid, feedDate])
}
```

### `RelatedWork` — additive

- `RelatedWork.source` adds `"paper_feeds"` as an allowed value.
- New optional column `addedNote: String?` to carry the agent's `relevanceNote` into Related Works when a feed item is promoted, so the curation reasoning survives.

## Services

### `src/services/paper-feed.service.ts` (new)

- `enablePaperFeed({ companyUuid, researchProjectUuid, agentUuid })` — validates the agent is `openclaw` type and has the `paper_feeds` role. Sets `paperFeedEnabled=true`, `paperFeedAgentUuid`.
- `disablePaperFeed({ companyUuid, researchProjectUuid })` — clears the enable flag. Leaves history intact.
- `triggerPaperFeedRun({ companyUuid, researchProjectUuid, triggeredBy, feedDate })` — looks up an existing `PaperFeedRun` for `(projectUuid, feedDate)`. If one exists in `completed`, returns it without re-firing. If `failed`, resets it to `pending` and re-notifies (Retry path). Otherwise creates a new `pending` row. Sets `paperFeedActiveAgentUuid` + `paperFeedStartedAt` on the project. Calls `notificationService.create({ action: "paper_feed_triggered", ... })`. Returns the run UUID.
- `recordPaperFeedItems({ companyUuid, researchProjectUuid, feedRunUuid, items })` — bulk upserts `PaperFeedItem` rows, skipping duplicates by `(projectUuid, paperId)`. Updates the run's status to `running` if it was `pending`.
- `completePaperFeedRun({ feedRunUuid, status, errorMessage? })` — sets terminal status, `completedAt`, and `paperCount` (counted from saved items). Clears `paperFeedActiveAgentUuid` + `paperFeedStartedAt`. Updates `paperFeedLastRunAt`.
- `listPaperFeedItems({ companyUuid, researchProjectUuid, fromDate?, toDate? })` — returns items grouped by `feedDate desc`. The data shape the UI consumes.
- `promoteFeedItemToRelatedWork({ companyUuid, paperFeedItemUuid })` — creates a `RelatedWork` with `source="paper_feeds"`, copies title/authors/abstract/arxivId, fills `addedNote` from the item's `relevanceNote`, sets `paperFeedItem.relatedWorkUuid`. Idempotent: if the item already has `relatedWorkUuid`, returns the existing RelatedWork.
- `reapStalePaperFeedRuns()` — finds runs in `running` status older than 30 minutes, marks them `failed` with `errorMessage="timeout"`, clears the active flags. Called by the cron tick endpoint.

### `src/services/huggingface-papers.service.ts` (new)

Thin wrapper around HuggingFace Daily Papers, same `fetchWithRetry` pattern as `paper-search.service.ts`:

- `fetchDailyPapers(date: string): Promise<HFDailyPaper[]>` — `GET https://huggingface.co/api/daily_papers?date=YYYY-MM-DD`. Returns `[{ id, title, authors, summary, publishedAt, paperUrl, githubRepo? }]`. Network failures return `[]`. The agent decides what to do with an empty day.

## Cron tick endpoint

`POST /api/cron/paper-feeds-tick`

- **Auth**: shared-secret header `X-Synapse-Cron-Token` matched against env `SYNAPSE_CRON_TOKEN`. 401 otherwise.
- **Behavior**:
  1. Call `reapStalePaperFeedRuns()` to clean up timed-out runs.
  2. Compute `feedDate = today − 1 day` in UTC.
  3. Find every project where `paperFeedEnabled=true`. For each:
     - Skip if a run already exists for `(projectUuid, feedDate)` (the unique index makes this race-safe).
     - Call `triggerPaperFeedRun(..., triggeredBy: "cron", feedDate)`.
- **Response**: `{ triggered: number, skipped: number, reaped: number }`.

Operator setup (one cron line on the `synapse` host):

```
0 9 * * *  curl -s -H "X-Synapse-Cron-Token: $SYNAPSE_CRON_TOKEN" https://<host>/api/cron/paper-feeds-tick
```

Documented in `docs/DEPLOYMENT.md`.

## MCP tools

Added to `src/mcp/tools/literature.ts` (Paper Feeds is a literature-shaped flow).

| Tool | Inputs | Purpose |
|---|---|---|
| `synapse_get_huggingface_daily_papers` | `date: string (YYYY-MM-DD)` | Pure passthrough to the HF Daily Papers API so the agent doesn't need outbound HTTP permissions. |
| `synapse_record_paper_feed_items` | `feedRunUuid`, `items: PaperFeedItemInput[]` | Bulk-persists the agent's relevant-paper selections. Items: `{ paperId, title, authors, abstract, summary, relevanceNote, arxivId?, paperUrl? }`. Server dedupes by `(projectUuid, paperId)`. |
| `synapse_complete_paper_feed_run` | `feedRunUuid`, `status: "completed" \| "failed"`, `errorMessage?` | Terminates the run, clears active flags, sends the completion notification. |
| `synapse_get_paper_feed_run` | `feedRunUuid` | Lets a restarted/resumed agent re-read the run's project + feedDate context. |

OpenClaw passthrough definitions for the same four tools added to `packages/openclaw-plugin/src/tools/common-tool-definitions.ts`.

## Agent permission

New role: `paper_feeds`. To be eligible for assignment to a project's Paper Feeds, an agent must have:
- `type = "openclaw"` (realtime transport)
- `paper_feeds` role (the four tools above)
- `pre_research` role (already grants `synapse_get_project_full_context`, `synapse_get_research_project`)

The Enable button's agent picker filters by these criteria.

## Agent prompt

Built in `handlePaperFeedTriggered` inside `packages/openclaw-plugin/src/event-router.ts`:

```
[Synapse] Paper Feed run for project "<projectName>" (projectUuid: <uuid>, feedRunUuid: <uuid>, feedDate: <YYYY-MM-DD>).

You may ONLY use these Synapse tools for this task:
- synapse_get_project_full_context
- synapse_get_huggingface_daily_papers
- synapse_record_paper_feed_items
- synapse_complete_paper_feed_run

Steps:
1. Call synapse_get_project_full_context with researchProjectUuid "<uuid>". Read the brief, datasets, evaluation methods, all experiments (including their result documents), and existing related works. Build a concrete picture of:
   - The project's domain and goal.
   - Techniques the project IS using or HAS used (from experiments + result docs).
   - Techniques the project COULD use (open ablations, deferred ideas in the brief, related-work topics).

2. Call synapse_get_huggingface_daily_papers with date "<feedDate>". You receive a list of papers, each with title, authors, abstract, arxivId, paperUrl.

3. For EACH paper in the list, judge relevance against the project context using the abstract alone (no extra fetches). A paper is relevant if it touches a technique the project uses, has used, or could plausibly use — including methods, datasets, evaluation strategies, or directly comparable results. Borderline ties go to NOT relevant; this feed should be high-precision.

4. Collect every paper you judged relevant into one batch. For each, write:
   - summary: 2–4 sentences in plain language describing what the paper does and its main contribution.
   - relevanceNote: 1–3 sentences naming the SPECIFIC technique / dataset / evaluation overlap with the project. Cite the project artifact (experiment title, dataset name, etc.) the paper connects to.

5. Call synapse_record_paper_feed_items ONCE with feedRunUuid "<uuid>" and the full batch (duplicates by paperId are deduped server-side; if every paper turns out to be a duplicate that is fine — it just means the daily list overlapped a previous day).

6. REQUIRED: Call synapse_complete_paper_feed_run with feedRunUuid "<uuid>" and status "completed". On unrecoverable error (HF API empty repeatedly, project context fetch fails), call it with status "failed" and a short errorMessage instead.
```

`triggerAgent` is called with `{ notificationUuid, action: "paper_feed_triggered", entityUuid: feedRunUuid, projectUuid, timeoutSeconds: 600 }`.

## Notifications

- On `synapse_complete_paper_feed_run` with `status="completed"`: notification to agent owner — `action: "paper_feed_completed"`, message `Paper Feed for <feedDate> ready: N relevant papers.`. `eventBus.emitChange` so the open page refetches.
- On `status="failed"`: same target/owner — `action: "paper_feed_failed"`, message includes `errorMessage`.

Both surface in the existing bottom-right toast stream and the bell, click target = `/research-projects/<uuid>/paper-feeds`.

## UI

### Nav

Add **Paper Feeds** between `Related Works` and `Insights` in the project sidebar. New folder `src/app/(dashboard)/research-projects/[uuid]/paper-feeds/` with:
- `page.tsx` — server component, prefetches initial data.
- `paper-feeds-client.tsx` — `"use client"` for state/event handlers and the live-update hook.

### Page anatomy

**Header bar (sticky):**
- Status pill: `Disabled` / `Active – next run ~daily 09:00 UTC` / `Running… (since HH:MM)`.
- Agent display: avatar + name of `paperFeedAgentUuid`.
- "Enable" / "Disable" button → small dialog with the agent picker (filtered to OpenClaw + `paper_feeds` + `pre_research`).
- "Run now" button → `POST /api/.../runs`. Disabled while a run is `running`.
- Last run line: `Last run: <feedDate> · <paperCount> relevant · <status>`.

**Body:** date-grouped feed list, newest first.
- Each date group is a section header `2026-05-26 · 7 relevant papers`.
- Each paper card:
  - Title (link → `paperUrl`), authors, arxivId chip.
  - `summary` block — agent's TL;DR.
  - `relevanceNote` block — visually accented (left border in the assigned agent's color, matching research question cards).
  - Right-aligned actions: `Add to Related Works` (disabled + ✓ if `relatedWorkUuid` set), `Open arXiv ↗`.
- Empty-day state: collapsed row `2026-05-25 · No relevant papers today`.

**Empty page state (no runs yet):** centered card with copy + "Enable Paper Feeds" CTA.

**Failed-run banner:** if the latest run is `failed`, dismissible banner: `Run for 2026-05-26 failed: <errorMessage>` with a Retry button (re-fires `triggerPaperFeedRun` for that `feedDate`; idempotent because of the unique index).

### Live updates

Reuse the existing event bus / SSE: `recordPaperFeedItems` and `completePaperFeedRun` emit `eventBus.emitChange({ entityType: "research_project", action: "paper_feed_updated" })`. The page subscribes via `useEntityChanges` and refetches `GET /paper-feeds`.

### i18n

All strings keyed in `messages/en.json` + `messages/zh.json` under a new `paperFeeds` namespace. No hardcoded English in client components.

## API routes

All under `src/app/api/research-projects/[uuid]/paper-feeds/`:

| Method · Path | Purpose | Auth |
|---|---|---|
| `GET   /api/research-projects/[uuid]/paper-feeds` | Returns `{ config: { enabled, agentUuid, lastRunAt, activeRun }, itemsByDate, runs }` for the page. | User session, project-scoped. |
| `POST  /api/research-projects/[uuid]/paper-feeds/enable` | Body `{ agentUuid }`. Validates agent eligibility, calls `enablePaperFeed`. | User. |
| `POST  /api/research-projects/[uuid]/paper-feeds/disable` | Calls `disablePaperFeed`. | User. |
| `POST  /api/research-projects/[uuid]/paper-feeds/runs` | Body `{ feedDate? }` (defaults to `yesterday UTC`). Calls `triggerPaperFeedRun(triggeredBy: "manual")`. | User. |
| `POST  /api/research-projects/[uuid]/paper-feeds/items/[itemUuid]/promote` | Calls `promoteFeedItemToRelatedWork`. Returns the new `RelatedWork`. | User. |
| `POST  /api/cron/paper-feeds-tick` | Daily cron entry point (separate from above). | `X-Synapse-Cron-Token`. |

## Testing

- `paper-feed.service.test.ts`: idempotency on `(projectUuid, feedDate)`, retry-after-failure resets to `pending`, dedup of items by `paperId`, promote-to-RelatedWork sets `relatedWorkUuid`, reaper marks stale `running` runs `failed`.
- `huggingface-papers.service.test.ts`: URL shape, retry on 5xx, empty-array on failure (mirrors existing arXiv tests).
- `cron paper-feeds-tick` route test: rejects on bad token, skips already-run projects, fires per-enabled-project notifications.
- MCP tool tests for the four new tools.
- Component tests for the empty / loading / failed-banner / promote-button states of the page.

## Backward compatibility

- Migration is purely additive: new tables, new optional columns on existing tables, new enum value. No backfill needed.
- Existing Auto-Search / autonomous loop are untouched.
- `RelatedWork` consumers must accept `source="paper_feeds"` — current code paths use the value as a free string label (badge color), so adding the value is a UI-only change.

## Out of scope

- **Frequency knobs**: only daily, defaulting to T-1 UTC. If a future user wants weekly digests, that's a follow-up.
- **Category whitelists**: HF Daily Papers doesn't expose categories cleanly; relevance judgment is the agent's job, not a filter.
- **Multi-source feeds**: only HF Daily Papers in v1. arXiv listings, biorxiv etc. are deferred.
- **Email/Slack delivery**: notifications stay in-app for v1.
- **Editing or deleting feed items manually**: items are agent-authored. Wrong calls become low-noise via the `(projectUuid, paperId)` dedup; explicit moderation tools are deferred.

## Risks & open questions

- **HF API rate limits / outages**: the agent treats an empty/failed daily list as a no-op (records zero items, completes successfully). If the API is down for days, the user sees `0 relevant` repeatedly and can investigate. No silent retries beyond `fetchWithRetry`.
- **Agent token cost**: `synapse_get_project_full_context` plus 50–200 abstracts per day fits comfortably in context, but very large projects (deep result documents) may approach limits. Acceptable for v1; if it bites, add a context-size cap to `get_project_full_context` later.
- **Timezone of `feedDate`**: locked to UTC for both the cron schedule and the HF API parameter, to keep idempotency unambiguous. The UI will format the date in the user's local timezone for display only.

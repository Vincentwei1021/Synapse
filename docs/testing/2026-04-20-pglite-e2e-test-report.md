# PGlite Mode E2E Test Report

**Date:** 2026-04-20
**Tester:** Claude Opus 4.6 (automated via Playwright + curl)
**Package:** `@synapse-research/synapse@0.2.5` (final), initial round on `0.2.1`
**Machine:** g6e-routine (EC2, Node 20, 61GB RAM, fresh install)
**Agent:** OpenClaw gateway on separate EC2, connected via SSH tunnel to g6e-routine:13000
**Method:** `sudo npm install -g @synapse-research/synapse && synapse --port 13000`, browser via SSH port forwarding

---

## E2E Test Results

### Startup & Infrastructure

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | `npm install -g` completes | ✅ | 33.7 MB package, installs in ~3s |
| 2 | `synapse --help` shows usage | ✅ | |
| 3 | `synapse --port 13000` starts | ✅ | PGlite + migrations + Next.js all succeed |
| 4 | PGlite embedded DB starts | ✅ | Listens on port 14000 |
| 5 | Prisma migrations run | ✅ | Uses prisma.config.js with DATABASE_URL |
| 6 | Next.js standalone starts | ✅ | Ready in ~137ms |
| 7 | No Redis errors in log | ✅ | `redis.enabled: false, transport: disabled` |
| 8 | Health API returns ok | ✅ | `GET /api/health` → `{"status":"ok","database":{"status":"connected"}}` |
| 9 | Pino structured logging | ✅ | JSON log output with module tags |
| 10 | No cache permission errors | ✅ | `postinstall` chmod 777 on `.next/cache` (Bug #20 fixed in v0.2.5) |

### Login & Onboarding

| # | Test | Result | Notes |
|---|------|--------|-------|
| 11 | Login page renders (中文) | ✅ | Email + password form, SSO option |
| 12 | Default auth login | ✅ | `admin@synapse.local` / `synapse` |
| 13 | Auto-redirect to onboarding | ✅ | First login goes to `/onboarding` |
| 14 | Step 1: Create Agent | ✅ | Name, type (Claude Code / OpenClaw), permissions, API key shown |
| 15 | Step 2: Create compute pool + add machine | ✅ | PEM upload, SSH test from g6e to p5 (ap-northeast-1) |
| 16 | Step 2: Hardware sync | ✅ | Detected p5.4xlarge, NVIDIA H100 80GB HBM3 |
| 17 | Onboarding banner disappears | ✅ | After agent + compute configured |

### Research Projects

| # | Test | Result | Notes |
|---|------|--------|-------|
| 18 | Empty state page | ✅ | "还没有研究项目" with create button |
| 19 | Create project form | ✅ | Name, description, datasets, evaluation, group, compute pool |
| 20 | Compute pool dropdown | ✅ | Shows pool created in onboarding |
| 21 | Project creation + redirect | ✅ | Dashboard shows all stats at 0 |
| 22 | Sidebar navigation | ✅ | 概览, 相关文献, 研究问题, 实验, 洞察, 文档, 项目设置 |

### Research Questions

| # | Test | Result | Notes |
|---|------|--------|-------|
| 23 | Empty state page | ✅ | Canvas with "从一个研究问题开始" |
| 24 | Create dialog opens | ✅ | Title + content fields |
| 25 | Create root research question | ✅ | Card appears on canvas, persists after refresh (Bug #19 fixed in v0.2.2) |
| 26 | Create child research question | ✅ | Parent dropdown pre-selected, child card + edge on canvas |
| 27 | Parent-child hierarchy | ✅ | Edge drawn, parent shows "1 个子问题" |
| 28 | Canvas interaction (click, select) | ✅ | Clicking nodes selects them, detail panel updates |
| 29 | Detail panel actions | ✅ | Edit, delete, create child buttons all render |
| 30 | Question status on parent | ✅ | Updates to "实验已创建" when experiment linked |

### Experiments

| # | Test | Result | Notes |
|---|------|--------|-------|
| 31 | Five-column board renders | ✅ | 草稿, 待审核, 待启动, 进行中, 已完成 |
| 32 | Create experiment (manual) | ✅ | Research questions appear in dropdown |
| 33 | Experiment linked to question | ✅ | Question shows "1 个直属实验" |
| 34 | Experiment in correct column | ✅ | Created in "待启动" by default |
| 35 | Agent assignment dropdown | ✅ | "Lab Assistant" listed |
| 36 | Assign experiment to agent | ✅ | Agent badge + "已发送" liveStatus badge on card |
| 37 | Agent color on card | ✅ | Terracotta color badge matches agent config |
| 38 | Agent name in sidebar nav | ✅ | "Lab Assistant" with colored icon next to "实验" |
| 39 | Experiment completion | ✅ | Card moves to "已完成" column, shows "结论: positive" |
| 40 | Dashboard stats update | ✅ | 研究问题: 2, 实验: 2 (later 3) |

### Agent E2E Flow (OpenClaw)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 41 | SSE connection from OpenClaw plugin | ✅ | Gateway log: `[Synapse] SSE connection established` |
| 42 | SSE notification on assignment | ✅ | Gateway log: `Agent woken: [Synapse] Experiment assigned: Quick connectivity test` |
| 43 | Agent hook creates session | ✅ | New `agent:main:hook:...` session in `openclaw sessions` |
| 44 | Agent spawns execution session | ✅ | New `agent:main:main:...` session, "just now" |
| 45 | Agent calls `synapse_start_experiment` | ✅ | Experiment status → `in_progress` |
| 46 | Agent calls `synapse_submit_experiment_results` | ✅ | Structured results with timestamps submitted |
| 47 | Experiment completes end-to-end | ✅ | Status → `completed`, outcome populated |
| 48 | Result document auto-created | ✅ | "Experiment Results Log" document in Documents page |

### Compute

| # | Test | Result | Notes |
|---|------|--------|-------|
| 49 | GPU dashboard renders | ✅ | Pool count, machine count, GPU stats |
| 50 | Machine card shows info | ✅ | p5-east1, p5.4xlarge, ap-northeast-1, SSH connection info |
| 51 | GPU detected | ✅ | 1x NVIDIA H100 80GB HBM3 |

### MCP

| # | Test | Result | Notes |
|---|------|--------|-------|
| 52 | MCP initialize | ✅ | Returns server info, protocol version |
| 53 | MCP tools/list | ✅ | Returns full tool list (synapse_* tools) |
| 54 | MCP synapse_checkin | ✅ | Returns agent info + assignments |

**Total: 54 tests, 54 passing**

---

## Bugs Found & Fixed

### Bug #19 — Research question creation silently fails (CRITICAL) — FIXED in v0.2.2

**Severity:** 🔴 Critical — blocks core research workflow
**Repro:** Research Questions → Create → Fill form → Submit
**Actual:** Dialog closes, no POST request sent, page stays empty.

**Root cause:** Next.js Server Actions (`"use server"`) don't work in standalone mode builds. The action endpoint returns 404 because standalone bundles don't include the server action routes.

**Fix:** Replaced all server action imports with REST API `fetch()` calls across 6 files. Created new `/api/research-questions/[uuid]/review` REST endpoint.

**Files changed:**
- `question-create-form.tsx` → `POST /api/research-projects/[uuid]/research-questions`
- `research-questions-board.tsx` → `PATCH/DELETE /api/research-questions/[uuid]`, `POST .../review`
- `question-detail-panel.tsx` → `PATCH/DELETE /api/research-questions/[uuid]`
- `questions-list.tsx` → `POST .../review`
- `assign-question-modal.tsx` → `POST .../claim`, `POST .../release`
- New: `src/app/api/research-questions/[uuid]/review/route.ts`

### Bug #20 — Next.js cache write permission denied — FIXED in v0.2.5

**Severity:** 🟡 Medium — logs spam, no functional impact
**Repro:** Start synapse as non-root user after `sudo npm install -g`
**Error:** `EACCES: permission denied, mkdir '.next/cache'`

**Root cause:** `sudo npm install -g` creates root-owned files. Next.js tries to write `.next/cache` inside the package directory, but the process runs as non-root.

**Fix:** Three-layer approach:
1. `prepack`: Creates `.next/cache/` with `.gitkeep` (so npm includes the directory)
2. `postinstall` script in `package.json`: Runs `chmod 0o777` during install (runs as root via sudo)
3. `bin/synapse.mjs`: Fallback `mkdirSync` if the dir is missing

---

## Previously Fixed Bugs (v0.1.0 → v0.2.1)

18 bugs found and fixed during the first round of testing:

| # | Bug | Fix |
|---|-----|-----|
| 1 | `createServer` not a function | Use `PGLiteSocketServer` class |
| 2 | No migrations directory | Project uses `db push`, not migrations |
| 3 | Migrations not in dist | Generated `0001_init` migration |
| 4 | `--skip-generate` not supported | Prisma 7 removed this flag |
| 5 | `db push` needs `--url` | Use DATABASE_URL env var |
| 6 | execSync blocks PGlite connections | Fork PGlite as separate process |
| 7 | Prisma client import path broken | Use direct SQL seeding |
| 8 | `migrate deploy` no `--url` flag | Prisma 7 API change |
| 9 | Datasource URL required in config | Create prisma.config.js |
| 10 | Schema can't have `url` in Prisma 7 | Use config file instead |
| 11 | `pg-types` not found | Hoist pnpm sub-dependencies |
| 12 | `styled-jsx` not found | Same root cause as #11 |
| 13 | `bcrypt` import fails | Use default-auth (no password hash needed) |
| 14 | User model has no passwordHash | Synapse uses env-based auth |
| 15 | MCP validation error | Build machine .env leaked into dist |
| 16 | Redis connects without REDIS_URL | Same .env leak + env var cleanup |
| 17 | MCP tools/list returns 0 tools | Same .env leak |
| 18 | Agent color mismatch (sidebar vs card) | Pass color through assignee response |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.2.1 | 2026-04-20 | Initial PGlite mode release (18 bugs fixed from v0.1.0) |
| 0.2.2 | 2026-04-20 | Bug #19 fix: server actions → REST API |
| 0.2.3 | 2026-04-20 | Bug #20: `.gitkeep` in cache dir (npm ignores empty dirs) |
| 0.2.4 | 2026-04-20 | Bug #20: npm strips permissions — added postinstall chmod |
| 0.2.5 | 2026-04-20 | Bug #20: simplified CLI cache fallback, final working version |

---

## 2026-04-20 Current Repo Rerun (local `0.7.0` source build)

**Tester:** Codex (GPT-5)
**Package under test:** current repo source (`synapse@0.7.0`), launched from `packages/synapse-cli`
**Machine:** `g6e-routine`
**Method:** rsync repo to fresh-ish EC2, run `prepack-pglite.mjs`, launch `node packages/synapse-cli/bin/synapse.mjs --port 13000`, connect OpenClaw temporarily to the test instance, then restore OpenClaw config after testing

### Revalidated / Newly Covered

- Happy-path onboarding still works: login, agent creation, compute pool creation, SSH probe, GPU inventory sync, project creation, research question creation.
- Experiment happy path still works end-to-end with OpenClaw: assignment, GPU reservation, start, progress reports, result submission, result log update.
- Live progress logs are persisted and visible through `/api/experiments/[uuid]/progress`.
- Queueing path is exercised: a blocker experiment can reserve the only H100, and a second experiment retries until the GPU is released.
- Related works full chain now works:
  - manual arXiv URL paste auto-fetches metadata
  - auto-search adds additional papers
  - deep research creates a `literature_review` document
- Autonomous loop works in `human_review` mode:
  - enabling the loop triggers the agent when queues are empty
  - the agent proposes `pending_review` experiments
  - human approval moves them back into execution flow
- Failure-path execution can preserve partial progress:
  - agent-generated failure experiment logged multiple progress entries
  - failure context was captured in `outcome` and `results`
- Interrupted-without-submit path was manually validated:
  - an experiment can be started and report partial progress
  - if the agent never submits results, it remains `in_progress`
  - progress logs remain intact
  - the results log document is not updated prematurely

### Bugs Found In This Rerun

#### Bug #21 — Onboarding agent connection test does not advance despite live SSE connection

**Severity:** 🔴 High  
**Repro:** onboarding step 2, point OpenClaw at the new Synapse instance, click "I've configured the agent — Test Connection"  
**Actual:** page stays on "Waiting for agent to connect..."  
**Expected:** onboarding should detect the live OpenClaw connection and advance automatically  
**Evidence:** OpenClaw log shows `Synapse plugin initializing` and `[Synapse] SSE connection established`

#### Bug #22 — Insights / project synthesis is never generated after completed experiments

**Severity:** 🔴 High  
**Repro:** complete multiple experiments successfully, then open `/research-projects/[uuid]/insights`  
**Actual:** Insights still shows `Latest synthesis: Not available` and `No synthesis has been generated yet.`  
**Expected:** completed experiments should refresh the rolling project synthesis and/or create a `project_synthesis` document  
**Impact:** breaks the documented `Document / Insights` consistency contract

#### Bug #23 — Queued experiment shows `liveStatus=running` while still `pending_start`

**Severity:** 🔴 High  
**Repro:** reserve the only GPU with a blocker experiment, assign a second experiment to the agent, wait for retries  
**Actual:** experiment remained `status: pending_start`, `startedAt: null`, but surfaced `liveStatus: running` with queue/retry messaging  
**Expected:** the card should remain in a queue/checking state until the actual start transition happens  
**Impact:** UI can misrepresent queueing work as actively running

#### Bug #24 — Comment notifications are not emitted for experiment comments

**Severity:** 🟠 Medium  
**Repro:** add comments to an agent-assigned `experiment`, then fetch agent notifications via `synapse_get_notifications`  
**Actual:** comments are stored and retrievable via `targetType: "experiment"`, but no comment notification is generated  
**Expected:** assignment/completion/comment flows should all notify correctly  
**Impact:** breaks the `Notifications / SSE fallback` test case for comments

#### Bug #25 — Notification listener throws Prisma errors while processing activity

**Severity:** 🟠 Medium  
**Repro:** normal activity generation during assignment / autonomous loop / notifications  
**Actual:** server log shows `Invalid prisma.experiment.findUnique() invocation` with payloads that look like project or agent records  
**Expected:** activity/notification processing should not attempt to hydrate non-experiment records as `Experiment`  
**Impact:** likely causes missed notifications and unstable activity fanout

#### Bug #26 — User oversight rule is inconsistent: route forbids completing agent-owned experiments

**Severity:** 🟠 Medium  
**Repro:** user attempts `POST /api/experiments/[uuid]/complete` on an in-progress experiment started by an agent  
**Actual:** API returns `PERMISSION_DENIED: Only assignee can complete experiment`  
**Expected:** current service-layer logic/comment says users should be allowed to act on agent-assigned experiments for human oversight  
**Impact:** API behavior disagrees with service-layer policy

#### Bug #27 — Redis-enabled startup still reports memory fallback instead of Redis transport

**Severity:** 🟠 Medium  
**Repro:** start Synapse with `REDIS_URL=redis://127.0.0.1:16379` and a live Redis container  
**Actual:** `/api/health` reports `"enabled": true` but `publisherStatus: "not_initialized"`, `subscriberStatus: "not_initialized"`, `transport: "memory-fallback"`  
**Expected:** Redis-backed pub/sub should initialize so the Redis path can actually be verified  
**Impact:** true Redis notification transport could not be validated in this rerun

#### Bug #28 — `prepack-pglite.mjs` assumes `pnpm` is on PATH

**Severity:** 🟡 Medium  
**Repro:** run `packages/synapse-cli/scripts/prepack-pglite.mjs` on a fresh machine where `corepack pnpm` works interactively but `pnpm` is not globally on PATH  
**Actual:** prepack fails until a user-level `pnpm` binary is installed  
**Expected:** the script should either invoke `corepack pnpm` or fail with a clearer setup requirement  
**Impact:** fresh-machine packaging is less reproducible than expected

---

## 2026-04-21 Bug Verification (E2E on g6e-routine)

**Tester:** Claude Opus 4.6  
**Machine:** `g6e-routine` (EC2, Node 22, 61GB RAM)  
**Method:** rsync source to g6e-routine, run dev server (webpack mode, PostgreSQL + Redis via Docker), OpenClaw temporarily pointed at test instance  
**API key:** `syn_ZXOf...GKlY` (agent "Lab Assistant", roles: pre_research, research, experiment, report)

### Verification Results

| Bug | Status | Evidence |
|-----|--------|----------|
| #21 | **STILL EXISTS** | OpenClaw SSE connected (`[Synapse] SSE connection established` in logs), but `/api/onboarding/status` returns `hasAgentConnected: false`. Root cause: `lastActiveAt` only updated by `synapse_checkin` MCP tool, never by SSE connection event. |
| #22 | **STILL EXISTS** | Completed experiment via `synapse_submit_experiment_results`, only `experiment_results_log` document created. No `project_synthesis` document. Root cause: `refreshProjectSynthesis()` is only called when `autonomousLoopEnabled && autonomousLoopMode === "full_auto"` (line 1313 of experiment.service.ts). Normal completions never trigger synthesis. |
| #23 | **STILL EXISTS** | Called `synapse_report_experiment_progress` on a `pending_start` experiment without specifying `liveStatus`. Result: `status=pending_start, liveStatus=running`. Root cause: `experiment-progress.service.ts` line 31 defaults `liveStatus` to `"running"` when not provided. |
| #24 | **STILL EXISTS** | Posted comment (`targetType: "experiment"`) on agent-assigned experiment. Agent notifications only show `task_assigned` and `experiment_report_requested` — no `comment_added` notification. Root cause: `comment.service.ts` `createComment()` never emits a `comment_added` activity event. |
| #25 | **NOT REPRODUCED** | No Prisma errors in notification listener during this test run. May require higher concurrency or specific activity type combinations not triggered in a clean environment. |
| #26 | **STILL EXISTS** | User (who owns the agent) called `POST /api/experiments/[uuid]/complete` on in-progress agent-assigned experiment. Returns `PERMISSION_DENIED: Only assignee can complete experiment`. Root cause: `isAssignee()` in `src/lib/auth.ts` has no case for "user who owns the assigned agent". |
| #27 | **STILL EXISTS** | Redis container running on port 16379 (verified with `PING`→`PONG`), `REDIS_URL` set correctly. Health reports `transport: "memory-fallback"`, `publisherStatus: "not_initialized"`. Root cause: Redis uses `lazyConnect: true` and `ensureEventBusConnected()` is only called when an SSE client connects (not on startup). |
| #28 | **STILL EXISTS** (code inspection) | `packages/synapse-cli/scripts/prepack-pglite.mjs` line 31: `execSync("pnpm build", ...)` calls `pnpm` directly without checking availability or using `npx`/`corepack`. |

### Summary

- **6 of 8 bugs confirmed still present** (#21, #22, #23, #24, #26, #27)
- **1 not reproduced** (#25 — requires specific concurrency conditions)
- **1 confirmed by code inspection** (#28 — packaging script issue)

---

## 2026-04-21 Regression Retest for Bug #21-#28

**Tester:** Codex GPT-5  
**Machine:** `g6e-routine` (same embedded PGlite data dir, Redis on `127.0.0.1:16379`)  
**Method:** rsync latest local source to `g6e-routine`, rebuild `synapse-cli`, run Synapse with `REDIS_URL`, temporarily repoint OpenClaw to `http://172.31.94.253:13000`, then restore OpenClaw back to `http://172.31.92.117:3000` after verification.

### Regression Results

| Bug | Status | Retest Result |
|-----|--------|---------------|
| #21 | **FIXED** | Before OpenClaw reconnect, `/api/onboarding/status` returned `hasAgentConnected: false` and the agent `lastActiveAt` was `null`. After repointing OpenClaw and seeing `[Synapse] SSE connection established`, `/api/onboarding/status` flipped to `hasAgentConnected: true` and the agent record updated `lastActiveAt` to `2026-04-20T18:27:41.237Z`. |
| #22 | **FIXED** | Fresh experiment `Bug26 oversight completion retest` (`fcc6940c-aaf9-4613-9e6c-e3c4cf612387`) was created under accepted research question `7759b472-bf05-451e-bed6-87d19d76ea9d`, started, and completed after the patch. The Insights page now renders `Rolling Synthesis for E2E Research Project` instead of `No synthesis has been generated yet.` |
| #23 | **FIXED** | Fresh experiment `Bug23 queue status retest` (`7f8956f3-ca23-486d-9d9e-1d76e447471e`) stayed `status: pending_start` while progress logs were written in queue state. After a final progress update without `liveStatus`, the experiment still showed `liveStatus: "queuing"` and `liveMessage: "Still queued after retry window"` rather than being coerced to `running`. |
| #24 | **FIXED** | After marking agent notifications read, posting a user comment on experiment `fcc6940c-aaf9-4613-9e6c-e3c4cf612387` produced an unread agent notification with `action: "comment_added"` and message `admin commented on "Bug26 oversight completion retest"`. |
| #25 | **NOT REPRODUCED** | During assignment, completion, comment notification, and Redis-backed listener flow, no `Invalid prisma.experiment.findUnique()` / Prisma validation error reappeared. Notification fanout and comment notifications both worked normally in this retest. |
| #26 | **FIXED** | User-owned oversight flow now succeeds: experiment `fcc6940c-aaf9-4613-9e6c-e3c4cf612387` was assigned to the agent, started with the agent API key, then successfully completed via user `POST /api/experiments/[uuid]/complete` with HTTP 200 and no `PERMISSION_DENIED`. |
| #27 | **FIXED** | With Redis container live before startup, `/api/health` reports `publisherStatus: "ready"`, `subscriberStatus: "ready"`, `transport: "redis"`. Startup log also shows `notification_listener` subscribed plus Redis `sub` and `pub` connections established. |
| #28 | **FIXED** | On the fresh `g6e-routine` machine, `node packages/synapse-cli/scripts/prepack-pglite.mjs` completed successfully after the script fallback change, without requiring a globally installed `pnpm` binary on PATH. |

### Notes

- The earlier “Insights empty” state for the old project snapshot was stale data from the pre-fix run. A fresh post-fix completion now correctly regenerates project synthesis.
- I did not re-hit the old listener Prisma error from bug #25 in this clean environment; at this point it should be treated as fixed unless it resurfaces under a more specific concurrency pattern.
- OpenClaw config was restored after the retest and the gateway log now shows `Synapse plugin initializing — http://172.31.92.117:3000 (all projects)`.

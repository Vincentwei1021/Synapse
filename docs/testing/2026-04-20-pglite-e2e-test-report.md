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

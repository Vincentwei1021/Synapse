# PGlite Mode E2E Test Report

**Date:** 2026-04-20
**Tester:** Claude Opus 4.6 (automated via Playwright)
**Package:** `@synapse-research/synapse@0.2.1`
**Machine:** g6e-routine (EC2, Node 20, 61GB RAM, fresh install — never had Synapse before)
**Method:** `npm install -g @synapse-research/synapse && synapse --port 13000`, browser via SSH port forwarding

---

## Test Results

### Startup & Infrastructure

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | `npm install -g` completes | ✅ | 33.7 MB package, installs in ~2s |
| 2 | `synapse --help` shows usage | ✅ | |
| 3 | `synapse --port 13000` starts | ✅ | PGlite + migrations + Next.js all succeed |
| 4 | PGlite embedded DB starts | ✅ | Listens on port 14000 |
| 5 | Prisma migrations run | ✅ | Uses prisma.config.js with DATABASE_URL |
| 6 | Next.js standalone starts | ✅ | Ready in ~135ms |
| 7 | No Redis errors in log | ✅ | `redis.enabled: false, transport: disabled` |
| 8 | Health API returns ok | ✅ | `GET /api/health` → `{"status":"ok","database":{"status":"connected"}}` |
| 9 | Pino structured logging | ✅ | JSON log output with module tags |

### Login

| # | Test | Result | Notes |
|---|------|--------|-------|
| 10 | Login page renders (中文) | ✅ | Email + password form, SSO option |
| 11 | Default auth login | ✅ | `admin@synapse.local` / `synapse` |
| 12 | Auto-redirect to onboarding | ✅ | First login goes to `/onboarding` |

### Onboarding

| # | Test | Result | Notes |
|---|------|--------|-------|
| 13 | Step 1: Create Agent form | ✅ | Name, type (Claude Code / OpenClaw), permissions |
| 14 | Step 1: Agent creation | ✅ | Agent created, API key generated |
| 15 | Step 1: API Key display | ✅ | Key shown once with copy button, OpenClaw config instructions |
| 16 | Step 2: Create compute pool | ✅ | Name + description form |
| 17 | Step 2: Add machine (PEM upload) | ✅ | Host, user, port, PEM file upload |
| 18 | Step 2: SSH test + hardware sync | ✅ | **Connected from g6e to p5 (ap-northeast-1)**, detected p5.4xlarge, NVIDIA H100 80GB HBM3 |
| 19 | Step 2: Complete setup | ✅ | "完成设置" button works |
| 20 | Onboarding banner disappears | ✅ | After agent + compute configured, "设置进度" banner gone |

### Research Projects

| # | Test | Result | Notes |
|---|------|--------|-------|
| 21 | Empty state page | ✅ | "还没有研究项目" with create button |
| 22 | Create project form | ✅ | Name, description, datasets, evaluation, group, compute pool |
| 23 | Compute pool dropdown | ✅ | Shows "Research GPUs" pool created in onboarding |
| 24 | Project creation | ✅ | Redirects to dashboard |
| 25 | Dashboard renders | ✅ | Stats cards (related works, questions, experiments, documents all 0) |
| 26 | Sidebar navigation | ✅ | 概览, 相关文献, 研究问题, 实验, 洞察, 文档, 项目设置 |

### Research Questions

| # | Test | Result | Notes |
|---|------|--------|-------|
| 27 | Empty state page | ✅ | Canvas with "从一个研究问题开始" |
| 28 | Create dialog opens | ✅ | Title + content fields |
| 29 | **Create question submit** | 🔴 **FAIL** | **Bug #19**: Form submit does not trigger server action. No POST request sent. Data not saved. Page stays empty after dialog closes. Persists after page refresh. |

### Experiments

| # | Test | Result | Notes |
|---|------|--------|-------|
| 30 | Five-column board renders | ✅ | 草稿, 待审核, 待启动, 进行中, 已完成 (all 0) |
| 31 | "创建实验" button | ✅ | Opens dialog with "手动创建" / "Agent 起草" options |
| 32 | Create experiment (manual) | ⚠️ Not tested | Blocked by Bug #19 — without research questions, can't fully test experiment creation with linked question |

### Compute

| # | Test | Result | Notes |
|---|------|--------|-------|
| 33 | GPU dashboard renders | ✅ | Pool count, machine count, GPU stats |
| 34 | Machine card shows info | ✅ | p5-east1, p5.4xlarge, ap-northeast-1, SSH connection info |
| 35 | GPU detected | ✅ | 1x NVIDIA H100 80GB HBM3 |

### Agent / MCP

| # | Test | Result | Notes |
|---|------|--------|-------|
| 36 | MCP initialize | ✅ | Returns server info, protocol version |
| 37 | MCP tools/list | ✅ | Returns full tool list (synapse_* tools) |
| 38 | MCP synapse_checkin | ✅ | Returns agent info + assignments |
| 39 | Agent assignment + notification | ⚠️ Not tested | Blocked by Bug #19 — no experiments to assign |

---

## Bugs Found

### Bug #19 — Research question creation silently fails (CRITICAL)

**Severity:** 🔴 Critical — blocks core research workflow
**Repro:** Onboarding → Create project → Research Questions → Create → Fill form → Submit
**Expected:** Research question created, card appears on canvas
**Actual:** Dialog closes, no POST request sent, page stays empty. Persists after refresh.

**Analysis:**
- Research question creation uses Next.js Server Actions (`"use server"` in `actions.ts`)
- Network monitoring shows zero POST requests after submit — the action is never invoked
- Server-side logs show no errors related to this
- The page renders correctly (GET 200), but POST to the same URL returns 404
- Experiment creation works because it uses a dedicated `/experiments/new` page + REST API, not server actions
- Likely a Next.js standalone mode incompatibility with server actions, or a build/bundle issue with action routing

**Files involved:**
- `src/app/(dashboard)/research-projects/[uuid]/research-questions/actions.ts` — contains `createResearchQuestionAction`
- `src/app/(dashboard)/research-projects/[uuid]/research-questions/research-questions-board.tsx` — form dialog

**Workaround:** None via UI. Can create via MCP tools (`synapse_create_research_question`) or direct database access.

### Bug #20 — Next.js cache write permission denied

**Severity:** 🟡 Medium — logs spam, no functional impact
**Repro:** Start synapse as non-root user after `sudo npm install -g`
**Error:** `EACCES: permission denied, mkdir '/usr/lib/node_modules/@synapse-research/synapse/dist/.next/cache'`

**Analysis:**
- Global npm install creates files owned by root
- Next.js standalone tries to create `.next/cache` inside the package directory
- The synapse process runs as ubuntu, can't write to root-owned dirs

**Fix options:**
1. CLI creates a writable cache dir (e.g., `~/.synapse/data/cache`) and sets `NEXT_CACHE_DIR` env var
2. prepack creates the `.next/cache` directory with world-writable permissions
3. Document that users should use `npx` instead of global install

---

## Tests Not Completed (Blocked by Bug #19)

These tests could not be run because research question creation is broken, which prevents creating the full research workflow needed to test:

| Test | Reason blocked |
|------|---------------|
| Create experiment linked to research question | No research questions exist |
| Experiment assignment to agent | No experiments to assign |
| Agent receives task notification via SSE | No assignments to trigger |
| Agent color consistency (sidebar vs experiment card) | No experiments with assigned agents |
| Autonomous loop trigger | Requires completed experiments |
| Document creation from experiment results | Requires completed experiments |
| Research question canvas interaction (click, expand, drag) | No research questions to interact with |
| Research question hierarchy (sub-questions) | No research questions to build on |

---

## Previously Fixed Bugs (v0.1.0 → v0.2.1)

For reference, these 18 bugs were found and fixed during the first round of testing:

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

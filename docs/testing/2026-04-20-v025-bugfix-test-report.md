# v0.2.5 Bug Fix Verification Report

**Date:** 2026-04-20
**Tester:** Claude Opus 4.6 (automated via Playwright)
**Package:** `@synapse-research/synapse@0.2.5`
**Machine:** g6e-routine (EC2, Node 20, 61GB RAM)
**Method:** `sudo npm install -g @synapse-research/synapse@0.2.5 && synapse --port 13000`, browser via SSH port forwarding
**Previous data:** PGlite database from v0.2.1 testing preserved (project, agent, compute pool intact)

---

## Bug Fix Verification

### Bug #19 — Research question creation silently fails (CRITICAL)

**Previous behavior:** Form submit did not trigger any POST request. Dialog closed, page stayed empty.

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Create root research question | ✅ | Title + content saved, card appears on canvas immediately |
| 2 | Research question persists after refresh | ✅ | Page reload shows the question |
| 3 | Create child research question | ✅ | Parent dropdown pre-selected, child card + edge appear on canvas |
| 4 | Parent-child hierarchy on canvas | ✅ | Edge drawn between parent and child nodes |
| 5 | Child count updates on parent card | ✅ | Parent shows "1 个子问题" |
| 6 | Create experiment linked to question | ✅ | Research questions appear in experiment create dropdown |
| 7 | Experiment count updates on question | ✅ | Parent question shows "1 个直属实验", status changes to "实验已创建" |
| 8 | Dashboard stats reflect new data | ✅ | 研究问题: 2, 实验: 1 |

**Root cause:** Next.js server actions (`"use server"`) don't work in standalone mode builds. The form's `createResearchQuestionAction` was never invoked because the action endpoint returned 404.

**Fix:** Replaced all server action imports with REST API `fetch()` calls. Created new `/api/research-questions/[uuid]/review` endpoint. Converted 6 files:
- `question-create-form.tsx` → `POST /api/research-projects/[uuid]/research-questions`
- `research-questions-board.tsx` → `PATCH/DELETE /api/research-questions/[uuid]`, `POST .../review`
- `question-detail-panel.tsx` → `PATCH/DELETE /api/research-questions/[uuid]`
- `questions-list.tsx` → `POST .../review`
- `assign-question-modal.tsx` → `POST .../claim`, `POST .../release`

### Bug #20 — Next.js cache write permission denied

**Previous behavior:** `EACCES: permission denied, mkdir '.next/cache'` errors in logs on every image optimization request.

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Cache dir exists after install | ✅ | `/dist/.next/cache/` present with `.gitkeep` |
| 2 | Cache dir has 777 permissions | ✅ | `drwxrwxrwx` — postinstall script ran during `sudo npm install` |
| 3 | No cache errors in startup log | ✅ | `grep -c cache synapse.log` = 0 |
| 4 | Startup clean (no permission errors) | ✅ | Ready in ~137ms, no EACCES |

**Root cause:** `sudo npm install -g` creates root-owned files. Next.js standalone tries to write `.next/cache` inside the package directory, but the process runs as `ubuntu`.

**Fix:** Three-layer approach:
1. `prepack`: Creates `.next/cache/` with `.gitkeep` so npm includes the directory
2. `postinstall`: Runs `chmod 0o777` on the cache dir during install (runs as root via sudo)
3. `bin/synapse.mjs`: Fallback `mkdirSync` if the dir is somehow missing

---

## Previously Blocked Tests — Now Completed

These tests were blocked by Bug #19 in the v0.2.1 report and are now passing:

| # | Test | Result | Notes |
|---|------|--------|-------|
| 29 | Create research question submit | ✅ | **Bug #19 FIXED** — POST via REST API works in standalone |
| 32 | Create experiment (manual) with linked question | ✅ | Dropdown shows both questions, experiment created in "待启动" column |
| — | Research question canvas interaction (click, select) | ✅ | Clicking nodes selects them, detail panel updates |
| — | Research question hierarchy (parent-child) | ✅ | Child question created with parent, edge drawn, counts update |
| — | Research question detail panel (edit, delete buttons) | ✅ | Panel renders with all action buttons |

---

## Version History

| Version | Changes |
|---------|---------|
| 0.2.1 | Initial PGlite mode release (18 bugs fixed from v0.1.0) |
| 0.2.2 | Bug #19 fix (server actions → REST API) + first attempt at Bug #20 |
| 0.2.3 | Bug #20: Added `.gitkeep` to cache dir (npm ignores empty dirs) |
| 0.2.4 | Bug #20: npm strips permissions — added postinstall chmod |
| 0.2.5 | Bug #20: Simplified CLI cache fallback, final working version |

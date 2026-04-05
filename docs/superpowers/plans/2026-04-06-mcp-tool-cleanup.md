# MCP Tool Cleanup & 5-Permission Reorg Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete 42 legacy MCP tools, rename 19 tools to remove role prefixes, reorganize server.ts around the 5 new permissions (pre_research, research, experiment, report, admin), and update all 3 plugin layers + docs + frontend.

**Architecture:** Three-phase approach: (1) delete legacy tools and files, (2) rename remaining tools and rewire permission gates in server.ts, (3) update docs, frontend, and plugin references. Each phase produces a working commit. Tool renames must be synchronized across Synapse MCP server, OpenClaw plugin tool definitions, Claude Code plugin skill references, and event-router prompts.

**Tech Stack:** TypeScript, Next.js, Vitest, pnpm

---

### File Structure

| File | Action | Phase |
|---|---|---|
| `src/mcp/tools/researcher.ts` | **Delete** | 1 |
| `src/mcp/tools/public.ts` | **Modify** — remove 6 compat aliases + 2 hypothesis tools | 1 |
| `src/mcp/tools/research-lead.ts` | **Modify** — delete legacy ExperimentDesign/Run tools + hypothesis tools, rename remaining | 2 |
| `src/mcp/tools/pi.ts` | **Modify** — delete legacy tools, rename remaining | 2 |
| `src/mcp/server.ts` | **Modify** — 5-permission gate | 2 |
| `packages/openclaw-plugin/src/tools/common-tool-definitions.ts` | **Modify** — sync renames/deletes | 2 |
| `packages/openclaw-plugin/src/event-router.ts` | **Modify** — remove hypothesis handlers | 2 |
| `packages/openclaw-plugin/package.json` | **Modify** — bump version | 2 |
| `public/synapse-plugin/skills/synapse/references/*.md` | **Modify** — update tool names | 3 |
| `public/synapse-plugin/skills/synapse/SKILL.md` | **Modify** — update if needed | 3 |
| `src/app/(dashboard)/agents/agents-page-client.tsx` | **Modify** — add `admin` permission | 3 |
| `messages/en.json` + `messages/zh.json` | **Modify** — add admin i18n | 3 |
| `README.md` | **Modify** — update tool count + permissions | 3 |
| `docs/index.html` | **Modify** — "60+" → "70+" | 3 |
| `docs/ARCHITECTURE.md` + `.zh.md` | **Modify** — update permissions | 3 |
| `docs/MCP_TOOLS.md` | **Modify** — update | 3 |
| `docs/AUTH.md` | **Modify** — update | 3 |
| `docs/synapse-plugin.md` | **Modify** — update | 3 |
| `docs/blogs/` | **Delete** — entire directory | 3 |

---

## Phase 1: Delete Legacy

### Task 1: Delete researcher.ts and legacy tools from public.ts

This task removes the `researcher.ts` file entirely (all 10 tools are legacy ExperimentRun flow), removes 6 compat alias tools and 2 hypothesis formulation tools from `public.ts`, and removes the `researcher.ts` import from `server.ts`.

**Files:**
- Delete: `src/mcp/tools/researcher.ts`
- Modify: `src/mcp/tools/public.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Delete researcher.ts**

```bash
rm src/mcp/tools/researcher.ts
```

- [ ] **Step 2: Remove researcher import and registration from server.ts**

In `src/mcp/server.ts`, remove:
```typescript
import { registerResearcherTools } from "./tools/researcher";
```

And remove these lines from `createMcpServer`:
```typescript
  const hasResearcherRole = hasRole("researcher", "researcher_agent", "experiment");
  // ...
  if (hasResearcherRole || hasPiRole) {
    registerResearcherTools(server, auth);
  }
```

(Leave the rest of server.ts intact — Task 3 will rewrite the permission gates.)

- [ ] **Step 3: Remove 6 compat alias tools from public.ts**

Remove these `createCompatAliasTool` blocks (approximately lines 30–125 in public.ts):
- `synapse_get_project`
- `synapse_list_projects`
- `synapse_get_idea`
- `synapse_get_task`
- `synapse_get_proposal`
- `synapse_get_unblocked_tasks`

Also remove the `createCompatAliasTool` import and the `compat-alias-tools` import if it becomes unused.

- [ ] **Step 4: Remove 2 hypothesis formulation tools from public.ts**

Remove these `server.registerTool` blocks:
- `synapse_answer_hypothesis_formulation`
- `synapse_get_hypothesis_formulation`

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: All tests pass (hypothesis formulation tests may fail if they import these tools — fix by removing those test references too).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete researcher.ts, compat aliases, hypothesis formulation tools"
```

---

### Task 2: Delete legacy tools from research-lead.ts and pi.ts

Remove all ExperimentDesign/Run tools and hypothesis formulation tools from `research-lead.ts`. Remove all ExperimentDesign/Run tools from `pi.ts`.

**Files:**
- Modify: `src/mcp/tools/research-lead.ts`
- Modify: `src/mcp/tools/pi.ts`

- [ ] **Step 1: Delete legacy tools from research-lead.ts**

Remove these `server.registerTool` blocks:

ExperimentDesign/Run flow:
- `synapse_research_lead_create_experiment_design`
- `synapse_research_lead_validate_experiment_design`
- `synapse_research_lead_submit_experiment_design`
- `synapse_research_lead_create_experiment_runs`
- `synapse_research_lead_assign_experiment_run`
- `synapse_research_lead_add_experiment_run_draft`
- `synapse_research_lead_update_experiment_run_draft`
- `synapse_research_lead_remove_experiment_run_draft`
- `synapse_add_experiment_run_dependency`
- `synapse_remove_experiment_run_dependency`

Hypothesis formulation:
- `synapse_research_lead_start_hypothesis_formulation`
- `synapse_research_lead_validate_hypothesis_formulation`
- `synapse_research_lead_skip_hypothesis_formulation`

Also remove any now-unused imports (experiment design service, hypothesis formulation service, etc.).

- [ ] **Step 2: Delete legacy tools from pi.ts**

Remove these `server.registerTool` blocks:
- `synapse_pi_approve_experiment_design`
- `synapse_pi_reject_experiment_design`
- `synapse_pi_close_experiment_design`
- `synapse_pi_verify_experiment_run`
- `synapse_pi_reopen_experiment_run`
- `synapse_pi_close_experiment_run`
- `synapse_pi_delete_experiment_run`
- `synapse_mark_acceptance_criteria`

Also remove any now-unused imports.

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete legacy ExperimentDesign/Run and hypothesis tools from research-lead and pi"
```

---

## Phase 2: Rename + Reorg Permissions

### Task 3: Rename tools in research-lead.ts and pi.ts

Rename all remaining tools to remove role prefixes. This is a mechanical find-replace within each file.

**Files:**
- Modify: `src/mcp/tools/research-lead.ts`
- Modify: `src/mcp/tools/pi.ts`

- [ ] **Step 1: Rename tools in research-lead.ts**

Find-replace the tool name strings (first argument to `server.registerTool`):

| Old | New |
|---|---|
| `synapse_research_lead_create_document` | `synapse_create_document` |
| `synapse_research_lead_update_document` | `synapse_update_document` |
| `synapse_research_lead_add_document_draft` | `synapse_add_document_draft` |
| `synapse_research_lead_update_document_draft` | `synapse_update_document_draft` |
| `synapse_research_lead_remove_document_draft` | `synapse_remove_document_draft` |
| `synapse_research_lead_create_research_question` | `synapse_create_research_question` |
| `synapse_research_lead_generate_project_ideas` | `synapse_generate_project_ideas` |

- [ ] **Step 2: Rename tools in pi.ts**

| Old | New |
|---|---|
| `synapse_pi_create_research_project` | `synapse_create_research_project` |
| `synapse_pi_review_research_question` | `synapse_review_research_question` |
| `synapse_pi_close_research_question` | `synapse_close_research_question` |
| `synapse_pi_delete_research_question` | `synapse_delete_research_question` |
| `synapse_pi_delete_document` | `synapse_delete_document` |
| `synapse_pi_create_project_group` | `synapse_create_project_group` |
| `synapse_pi_update_project_group` | `synapse_update_project_group` |
| `synapse_pi_delete_project_group` | `synapse_delete_project_group` |
| `synapse_pi_move_research_project_to_group` | `synapse_move_research_project_to_group` |

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: rename MCP tools — remove research_lead_ and pi_ prefixes"
```

---

### Task 4: Rewrite server.ts with 5-permission gates

Replace the old 3-role system with 5 permissions. Rename the registration functions to match the new organization.

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/tools/research-lead.ts` — rename export function
- Modify: `src/mcp/tools/pi.ts` — rename export function

- [ ] **Step 1: Rename registration functions**

In `src/mcp/tools/research-lead.ts`, rename:
```typescript
export function registerResearchLeadTools(...)
```
to:
```typescript
export function registerResearchTools(...)
```

In `src/mcp/tools/pi.ts`, rename:
```typescript
export function registerPiTools(...)
```
to:
```typescript
export function registerAdminTools(...)
```

- [ ] **Step 2: Rewrite server.ts**

Replace the entire body of `createMcpServer` with:

```typescript
export function createMcpServer(auth: AgentAuthContext): McpServer {
  const server = new McpServer({
    name: "synapse",
    version: "1.0.0",
  });

  const roles = auth.roles || [];
  const hasRole = (...names: string[]) => roles.some(r => names.includes(r));

  // --- All agents (no permission required) ---
  registerPublicTools(server, auth);
  registerSessionTools(server, auth);

  // --- pre_research: literature search, paper collection ---
  if (hasRole("pre_research")) {
    registerLiteratureTools(server, auth);
  }

  // --- research: research question CRUD ---
  if (hasRole("research", "research_lead", "research_lead_agent")) {
    registerResearchTools(server, auth);
  }

  // --- experiment: execution, compute, metrics ---
  if (hasRole("experiment", "researcher", "researcher_agent")) {
    registerComputeTools(server, auth);
  }

  // --- report: document CRUD, synthesis ---
  // (report tools are in research-lead.ts — the document portion)
  // Already included via registerResearchTools if research role present.
  // For report-only agents, also register research tools (document subset).
  if (hasRole("report") && !hasRole("research", "research_lead", "research_lead_agent")) {
    registerResearchTools(server, auth);
  }

  // --- admin: project management, groups, delete operations ---
  if (hasRole("admin", "pi", "pi_agent")) {
    registerAdminTools(server, auth);
  }

  return server;
}
```

Update imports to match renamed functions.

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: 5-permission gate system in server.ts"
```

---

### Task 5: Sync OpenClaw plugin tool definitions and event router

Update `common-tool-definitions.ts` to match renamed/deleted tools. Update event-router to remove hypothesis formulation handlers.

**Files:**
- Modify: `packages/openclaw-plugin/src/tools/common-tool-definitions.ts`
- Modify: `packages/openclaw-plugin/src/event-router.ts`
- Modify: `packages/openclaw-plugin/package.json`

- [ ] **Step 1: Update common-tool-definitions.ts**

1. Delete all tool definitions for deleted tools (compat aliases, ExperimentDesign/Run, hypothesis formulation, researcher tools).
2. Rename tool definitions to match new names (remove `research_lead_` and `pi_` prefixes in both `name` and `targetToolName` fields).

- [ ] **Step 2: Update event-router.ts**

Remove these handlers and their switch cases:
- `handleHypothesisFormulationRequested`
- `handleHypothesisFormulationAnswered`

Remove the corresponding cases:
- `elaboration_requested` / `hypothesis_formulation_requested`
- `elaboration_answered` / `hypothesis_formulation_answered`

- [ ] **Step 3: Bump plugin version**

In `packages/openclaw-plugin/package.json`, bump version to `0.7.0` (breaking change — tool renames).

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: sync OpenClaw plugin with tool renames and deletions (v0.7.0)"
```

---

## Phase 3: Frontend, Docs, Claude Code Plugin

### Task 6: Add admin permission to frontend

**Files:**
- Modify: `src/app/(dashboard)/agents/agents-page-client.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Update ROLES array and mappings in agents-page-client.tsx**

Change line 79:
```typescript
const ROLES = ["pre_research", "research", "experiment", "report"] as const;
```
to:
```typescript
const ROLES = ["pre_research", "research", "experiment", "report", "admin"] as const;
```

Add to the ROLE_ICONS map (around line 83) an icon for admin:
```typescript
admin: Settings2,
```
(import `Settings2` from lucide-react)

Add to the ROLE_I18N_KEYS map (around line 101):
```typescript
admin: "agents.permissions.admin",
```

Remove old role mappings (lines 106-111):
```typescript
researcher_agent: "agents.permissions.experiment",
researcher: "agents.permissions.experiment",
research_lead_agent: "agents.permissions.research",
research_lead: "agents.permissions.research",
pi_agent: "agents.permissions.report",
pi: "agents.permissions.report",
```

- [ ] **Step 2: Add i18n keys**

In `messages/en.json`, in the `agents.permissions` section, add:
```json
"admin": "Admin"
```
And update the `adminDesc` key:
```json
"adminDesc": "Create/delete projects, manage groups, review research questions"
```

In `messages/zh.json`, same section:
```json
"admin": "管理员"
```
```json
"adminDesc": "创建/删除项目、管理分组、审核研究问题"
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: add admin permission to agent management UI"
```

---

### Task 7: Update docs and delete blogs

**Files:**
- Modify: `README.md`
- Modify: `docs/index.html`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ARCHITECTURE.zh.md`
- Modify: `docs/MCP_TOOLS.md`
- Modify: `docs/AUTH.md`
- Modify: `docs/synapse-plugin.md`
- Delete: `docs/blogs/` (entire directory)

- [ ] **Step 1: Update README.md**

Line 121: Change "60+ MCP tools" → "70+ MCP tools"
Line 205: Change "Composable agent permissions: `pre_research`, `research`, `experiment`, `report`" → add `, `admin``
Line 211: Change "60+ MCP tools" → "70+ MCP tools"

- [ ] **Step 2: Update docs/index.html**

Line 942: Change `60+` → `70+`

- [ ] **Step 3: Update docs/ARCHITECTURE.md**

Line 54: Add `admin` to roles list
Line 97: Add `admin` permission row to table

- [ ] **Step 4: Update docs/ARCHITECTURE.zh.md**

Same changes as ARCHITECTURE.md but in Chinese.

- [ ] **Step 5: Update docs/MCP_TOOLS.md**

Update the permissions list to include `admin`. Remove references to hypothesis formulation. Update tool count.

- [ ] **Step 6: Update docs/AUTH.md**

Update the permissions table to include `admin`.

- [ ] **Step 7: Update docs/synapse-plugin.md**

Remove `hypothesis_formulation_requested` and `hypothesis_formulation_answered` from the notification actions table. Add `admin` to permissions list.

- [ ] **Step 8: Delete docs/blogs/**

```bash
rm -rf docs/blogs/
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "docs: update tool count, add admin permission, delete legacy blogs"
```

---

### Task 8: Update Claude Code plugin skill references

**Files:**
- Modify: `public/synapse-plugin/skills/synapse/references/00-common-tools.md`
- Modify: `public/synapse-plugin/skills/synapse/references/02-research-workflow.md`
- Modify: `public/synapse-plugin/skills/synapse/references/03-experiment-workflow.md`
- Modify: `public/synapse-plugin/skills/synapse/references/04-autonomous-loop.md`
- Modify: `public/synapse-plugin/skills/synapse/SKILL.md`

- [ ] **Step 1: Update 00-common-tools.md**

Replace all old tool names with new names:
- `synapse_research_lead_*` → `synapse_*` (remove prefix)
- `synapse_pi_*` → `synapse_*` (remove prefix)
- Remove references to deleted tools (hypothesis formulation, ExperimentDesign/Run, compat aliases)

- [ ] **Step 2: Update 02-research-workflow.md**

Replace old tool names. Remove hypothesis formulation workflow section.

- [ ] **Step 3: Update 03-experiment-workflow.md**

Remove ExperimentDesign/Run workflow references. Keep Experiment (new flow) references.

- [ ] **Step 4: Update 04-autonomous-loop.md**

Replace old tool names if referenced.

- [ ] **Step 5: Update SKILL.md**

Update permissions list, tool names, remove legacy references.

- [ ] **Step 6: Commit**

```bash
git commit -am "docs: update Claude Code plugin skill references with new tool names"
```

---

### Task 9: Sync to remote, publish plugin, deploy

**Files:** (no code changes)

- [ ] **Step 1: Sync all files to synapse remote**

```bash
rsync -avz --delete --exclude node_modules --exclude .next --exclude .git . synapse:/home/ubuntu/Synapse/
```

- [ ] **Step 2: Run tests on remote**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm test'
```

- [ ] **Step 3: Publish OpenClaw plugin v0.7.0**

```bash
ssh synapse 'cd /home/ubuntu/Synapse/packages/openclaw-plugin && npm publish --access public'
```

- [ ] **Step 4: Update plugin on openclaw and restart**

```bash
ssh openclaw 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && rm -rf /home/ubuntu/.openclaw/extensions/synapse-openclaw-plugin && openclaw plugins install @vincentwei1021/synapse-openclaw-plugin && openclaw gateway restart'
```

- [ ] **Step 5: Commit and push from synapse**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add -A && git commit -m "refactor: MCP tool cleanup — delete 42 legacy tools, rename 19, add admin permission" && git push'
```

- [ ] **Step 6: Pull locally**

```bash
git pull
```

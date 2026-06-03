# Codex Paper Search Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect OpenAI Codex to Synapse for the Paper Search phase, reusing the existing `public/synapse-plugin/` assets and gating capability via the agent's `pre_research` role, structured so full Claude-Code parity is later reached by adding roles rather than rewriting.

**Architecture:** One server-side line registers `codex` as a poll-transport agent type (no migration — `Agent.type` is a plain String, and `VALID_AGENT_TYPES` is derived from the transport map). Tool exposure needs no change: `src/mcp/server.ts` already registers only literature tools for a `pre_research` key. The Codex plugin shares `public/synapse-plugin/` (skills, bin, `.mcp.json`) and adds a `.codex-plugin/plugin.json` manifest plus a `hooks/hooks-codex.json` containing only Codex-supported events. The frontend exposes `codex` as a selectable agent type.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Vitest, pnpm, next-intl. Codex plugin format (`.codex-plugin/plugin.json`, `hooks/hooks.json`, MCP over HTTP).

**Source-of-truth design doc:** [`docs/superpowers/specs/2026-06-03-codex-paper-search-design.md`](../specs/2026-06-03-codex-paper-search-design.md)

---

## File Structure

This plan **creates** these files:

- `public/synapse-plugin/.codex-plugin/plugin.json` — Codex manifest (declares `skills` + `hooks` paths + interface)
- `public/synapse-plugin/hooks/hooks-codex.json` — Codex-supported event subset (SessionStart only for this phase)

This plan **modifies** these files:

- `src/lib/agent-transport.ts` — add `codex: "poll"` to the transport map
- `src/lib/__tests__/agent-transport.test.ts` — assert codex mapping; fix the `getTypesByTransport("poll")` assertion that adding codex breaks
- `src/components/agent-type-icon.tsx` — add a `codex` icon branch
- `src/app/(dashboard)/agents/agents-page-client.tsx` — add `codex` to `AGENT_TYPES` and `TYPE_BADGE_CLASSES`
- `src/app/onboarding/step1-agent.tsx` — add the `codex` type option; widen the option grid to 3 columns
- `messages/en.json` — add `agents.type.codex`, `agents.typeDesc.codex`, onboarding `typeCodex`/`typeCodexDesc`
- `messages/zh.json` — same keys, Chinese
- `.claude-plugin/marketplace.json` — verify/添加 Codex policy fields on the shared entry (distribution unknown resolved here)

**No file is created under `docs/` beyond this plan.** The bin scripts (`synapse-api.sh`, `on-session-start.sh`) and `.mcp.json` are reused unchanged; a verification task confirms they work for Codex rather than editing them speculatively.

---

### Task 1: Register `codex` as a poll-transport agent type

**Files:**
- Modify: `src/lib/agent-transport.ts`
- Test: `src/lib/__tests__/agent-transport.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `src/lib/__tests__/agent-transport.test.ts`, replace the `VALID_AGENT_TYPES` block (lines 5-10), add a codex case to `getAgentTransport`, and **fix the `getTypesByTransport` block** (the existing `"poll"` assertion of `["claude_code"]` will break once codex is added). Replace those three regions so the file reads:

```typescript
  describe("VALID_AGENT_TYPES", () => {
    it("contains openclaw, claude_code, and codex", () => {
      expect(VALID_AGENT_TYPES).toContain("openclaw");
      expect(VALID_AGENT_TYPES).toContain("claude_code");
      expect(VALID_AGENT_TYPES).toContain("codex");
    });
  });
```

In the `getAgentTransport` describe block, add:

```typescript
    it("returns poll for codex", () => {
      expect(getAgentTransport("codex")).toBe("poll");
    });
```

In the `isRealtimeAgent` describe block, add:

```typescript
    it("returns false for codex", () => {
      expect(isRealtimeAgent("codex")).toBe(false);
    });
```

Replace the entire `getTypesByTransport` describe block with:

```typescript
  describe("getTypesByTransport", () => {
    it("returns only openclaw for realtime (codex must be excluded)", () => {
      expect(getTypesByTransport("realtime")).toEqual(["openclaw"]);
    });

    it("returns claude_code and codex for poll", () => {
      expect(getTypesByTransport("poll")).toEqual(["claude_code", "codex"]);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- src/lib/__tests__/agent-transport.test.ts`
Expected: FAIL — `VALID_AGENT_TYPES` does not contain `codex`; `getAgentTransport("codex")` returns `poll` via fallback but `getTypesByTransport("poll")` returns `["claude_code"]` (missing codex).

- [ ] **Step 3: Add codex to the transport map**

In `src/lib/agent-transport.ts`, change the map (lines 4-7) to:

```typescript
const AGENT_TRANSPORT_MAP: Record<string, "realtime" | "poll"> = {
  openclaw: "realtime",
  claude_code: "poll",
  codex: "poll",
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- src/lib/__tests__/agent-transport.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Verify type validation now accepts codex (no code change, read-only check)**

Confirm `src/app/api/agents/route.ts` validates against `VALID_AGENT_TYPES` (it imports it at line 10 and checks at line 94). Since `VALID_AGENT_TYPES = Object.keys(AGENT_TRANSPORT_MAP)`, codex is now accepted automatically. No edit needed — this step is a read to confirm the chain.

Run: `pnpm test`
Expected: PASS (full suite; coverage thresholds for `src/lib/**` still met since the new branch is exercised by the tests above).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent-transport.ts src/lib/__tests__/agent-transport.test.ts
git commit -m "feat(agent): register codex as a poll-transport agent type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add the codex icon branch

**Files:**
- Modify: `src/components/agent-type-icon.tsx`

This component is purely presentational with no test (matches the existing pattern — there is no `agent-type-icon.test.tsx`). The change is a small, visually-verifiable branch.

- [ ] **Step 1: Add a codex branch**

Replace the full contents of `src/components/agent-type-icon.tsx` with:

```tsx
import { Bot, Terminal, Sparkles } from "lucide-react";

export function AgentTypeIcon({ type, className = "h-2.5 w-2.5" }: { type: string; className?: string }) {
  if (type === "claude_code") return <Terminal className={`shrink-0 ${className}`} />;
  if (type === "codex") return <Sparkles className={`shrink-0 ${className}`} />;
  return <Bot className={`shrink-0 ${className}`} />;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: PASS (no unused-import or type errors; `Sparkles` exists in lucide-react).

- [ ] **Step 3: Commit**

```bash
git add src/components/agent-type-icon.tsx
git commit -m "feat(ui): add codex agent type icon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Add codex i18n strings (en + zh)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

Both files must change together so no key is missing in either locale.

- [ ] **Step 1: Add the agents.type / typeDesc codex keys in en.json**

In `messages/en.json`, the `agents.type` block (around line 985) currently ends:

```json
    "type": {
      "openclaw": "OpenClaw",
      "claude_code": "Claude Code"
    },
    "typeDesc": {
      "openclaw": "Receives tasks in real-time via SSE notifications",
      "claude_code": "Discovers tasks at session start"
    },
```

Change it to:

```json
    "type": {
      "openclaw": "OpenClaw",
      "claude_code": "Claude Code",
      "codex": "Codex"
    },
    "typeDesc": {
      "openclaw": "Receives tasks in real-time via SSE notifications",
      "claude_code": "Discovers tasks at session start",
      "codex": "Discovers tasks at session start via MCP over HTTP"
    },
```

- [ ] **Step 2: Add the onboarding typeCodex keys in en.json**

In `messages/en.json`, the onboarding block (around line 1811) currently has:

```json
      "typeClaudeCode": "Claude Code",
      "typeClaudeCodeDesc": "Discovers tasks at session start via checkin",
      "typeOpenClaw": "OpenClaw",
      "typeOpenClawDesc": "Receives tasks in real-time via SSE",
```

Add immediately after the `typeOpenClawDesc` line:

```json
      "typeCodex": "Codex",
      "typeCodexDesc": "Connects via MCP over HTTP; discovers tasks at session start",
```

- [ ] **Step 3: Add the same keys in zh.json**

In `messages/zh.json`, the `agents.type` / `typeDesc` block (around line 985) becomes:

```json
    "type": {
      "openclaw": "OpenClaw",
      "claude_code": "Claude Code",
      "codex": "Codex"
    },
    "typeDesc": {
      "openclaw": "通过 SSE 通知实时接收任务",
      "claude_code": "在会话启动时发现任务",
      "codex": "通过 HTTP MCP 连接，在会话启动时发现任务"
    },
```

And the onboarding block (around line 1811), after `typeOpenClawDesc`:

```json
      "typeCodex": "Codex",
      "typeCodexDesc": "通过 HTTP MCP 连接；在会话开始时获取任务",
```

- [ ] **Step 4: Verify both JSON files parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/zh.json','utf8')); console.log('both valid')"`
Expected: prints `both valid`.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n: add codex agent type strings (en, zh)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Expose codex in the agents management page

**Files:**
- Modify: `src/app/(dashboard)/agents/agents-page-client.tsx`

Depends on Task 3 (the rendered labels read `agents.type.codex` / `agents.typeDesc.codex`).

- [ ] **Step 1: Add codex to AGENT_TYPES and TYPE_BADGE_CLASSES**

In `src/app/(dashboard)/agents/agents-page-client.tsx`, change line 114:

```tsx
const AGENT_TYPES = ["openclaw", "claude_code", "codex"] as const;
```

And the `TYPE_BADGE_CLASSES` map (lines 116-119) to add a codex entry:

```tsx
const TYPE_BADGE_CLASSES: Record<string, string> = {
  openclaw: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  claude_code: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  codex: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};
```

The create/edit `<select>` dropdowns at lines 612 and 734 already iterate `AGENT_TYPES.map(...)`, and the badge at line 522-523 already reads `TYPE_BADGE_CLASSES[agent.type]` + `t(\`agents.type.${agent.type}\`)`, so codex appears automatically once added to these two maps.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual visual check**

Run: `pnpm dev`, open `http://localhost:3000`, go to Agents → Create. Confirm the type dropdown lists OpenClaw, Claude Code, Codex; selecting Codex shows the `typeDesc.codex` description; a created codex agent shows the amber badge labeled "Codex".

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/agents/agents-page-client.tsx"
git commit -m "feat(agents-ui): list codex as a selectable agent type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Add the codex option to the onboarding wizard

**Files:**
- Modify: `src/app/onboarding/step1-agent.tsx`

Depends on Task 3 (uses `typeCodex` / `typeCodexDesc`).

- [ ] **Step 1: Add the codex option and widen the grid**

In `src/app/onboarding/step1-agent.tsx`, the type grid (lines 88-93) currently uses `grid-cols-2` and two options. Change the grid wrapper to `grid-cols-3` and add the codex option. The block becomes:

```tsx
          <div className="mt-1.5 grid grid-cols-3 gap-3">
            {[
              { value: "claude_code", label: t("typeClaudeCode"), desc: t("typeClaudeCodeDesc"), icon: Terminal },
              { value: "openclaw", label: t("typeOpenClaw"), desc: t("typeOpenClawDesc"), icon: Radio },
              { value: "codex", label: t("typeCodex"), desc: t("typeCodexDesc"), icon: Sparkles },
            ].map((opt) => (
```

- [ ] **Step 2: Import the Sparkles icon**

At the top of `src/app/onboarding/step1-agent.tsx`, the existing lucide import includes `Terminal` and `Radio`. Add `Sparkles` to that same import statement (match the existing named-import list; do not add a second import line).

- [ ] **Step 3: Verify it compiles**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Manual visual check**

In `pnpm dev`, visit `/onboarding`. Confirm step 1 shows three type cards in one row, the Codex card selects correctly, and its description reads the `typeCodexDesc` string.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/step1-agent.tsx
git commit -m "feat(onboarding): offer codex as an agent type in step 1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Create the Codex plugin manifest

**Files:**
- Create: `public/synapse-plugin/.codex-plugin/plugin.json`

- [ ] **Step 1: Create the manifest**

Create `public/synapse-plugin/.codex-plugin/plugin.json` with exactly:

```json
{
  "name": "synapse",
  "version": "0.9.1",
  "description": "Synapse research orchestration plugin for Codex. Literature search and collection via MCP; expands to the full research workflow as agent roles are granted.",
  "author": { "name": "Vincentwei1021" },
  "homepage": "https://github.com/Vincentwei1021/Synapse",
  "repository": "https://github.com/Vincentwei1021/Synapse",
  "license": "AGPL-3.0",
  "keywords": ["synapse", "research", "mcp", "literature-search"],
  "skills": "./skills/",
  "hooks": "./hooks/hooks-codex.json",
  "interface": {
    "displayName": "Synapse",
    "shortDescription": "Connect Codex to Synapse for paper search and research orchestration",
    "category": "Productivity",
    "capabilities": ["Interactive", "Read", "Write"],
    "defaultPrompt": [
      "Search papers for one of my Synapse research projects.",
      "What literature have I already collected for this project?"
    ]
  }
}
```

The `version` matches the existing Claude manifest (`public/synapse-plugin/.claude-plugin/plugin.json` is `0.9.1`) so both harness manifests stay in lockstep.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/synapse-plugin/.codex-plugin/plugin.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 3: Commit**

```bash
git add public/synapse-plugin/.codex-plugin/plugin.json
git commit -m "feat(plugin): add codex manifest to synapse-plugin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Create the Codex hooks subset

**Files:**
- Create: `public/synapse-plugin/hooks/hooks-codex.json`

The existing `public/synapse-plugin/hooks/hooks.json` registers events Codex does not support (`TeammateIdle`, `TaskCompleted`) and Claude-specific PreToolUse matchers (`EnterPlanMode`/`ExitPlanMode`/`Task`). Codex gets only `SessionStart` for this phase.

- [ ] **Step 1: Create the hooks file**

Create `public/synapse-plugin/hooks/hooks-codex.json` with exactly:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/bin/on-session-start.sh"
          }
        ]
      }
    ]
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` is intentional: Codex sets both `PLUGIN_ROOT` and the compatibility variable `CLAUDE_PLUGIN_ROOT`, and the shared `bin/` scripts already reference `CLAUDE_PLUGIN_ROOT`, so no script edit is needed.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/synapse-plugin/hooks/hooks-codex.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 3: Commit**

```bash
git add public/synapse-plugin/hooks/hooks-codex.json
git commit -m "feat(plugin): add codex-supported hooks subset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Verify the shared bin script works under Codex's stdin/output schema

**Files:**
- Read/verify: `public/synapse-plugin/bin/on-session-start.sh`, `public/synapse-plugin/bin/synapse-api.sh`
- Modify (only if Step 2 fails): `public/synapse-plugin/bin/on-session-start.sh`

The spec flags one risk: `on-session-start.sh` must parse Codex's stdin (snake_case `source`/`hook_event_name`) and emit `hookSpecificOutput.additionalContext`. This task verifies before assuming.

- [ ] **Step 1: Syntax-check both scripts**

Run: `bash -n public/synapse-plugin/bin/on-session-start.sh && bash -n public/synapse-plugin/bin/synapse-api.sh && echo "syntax ok"`
Expected: prints `syntax ok`.

- [ ] **Step 2: Simulate a Codex SessionStart event (no Synapse server needed for the unconfigured path)**

Run (unset env to exercise the graceful "not configured" branch, confirming stdin handling + output shape):

```bash
cd public/synapse-plugin && env -u SYNAPSE_URL -u SYNAPSE_API_KEY CLAUDE_PLUGIN_ROOT="$(pwd)" \
  bash -c 'echo "{\"source\":\"startup\",\"hook_event_name\":\"SessionStart\",\"cwd\":\"/tmp\",\"session_id\":\"x\"}" | ./bin/on-session-start.sh' | tee /tmp/codex-hook-out.json
```

Then validate the output is JSON with the context key Codex expects:

```bash
jq -e '.hookSpecificOutput.additionalContext // .systemMessage' /tmp/codex-hook-out.json && echo "output shape ok"
```

Expected: valid JSON; prints `output shape ok`. If the script errors on the snake_case stdin or omits `hookSpecificOutput`, fix `on-session-start.sh` minimally to read `source`/`hook_event_name` and emit the Codex output shape, then re-run this step until it passes. **If it already passes, make no edit.**

- [ ] **Step 3: Connectivity + role-isolation check against a running server (requires SYNAPSE_URL + a pre_research key)**

Start the app (`pnpm dev`), create a `codex` agent with role `pre_research` in the UI, copy its `syn_` key, then:

```bash
curl -s -X POST "$SYNAPSE_URL/api/mcp" \
  -H "Authorization: Bearer $SYNAPSE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name' | sort
```

Expected: the list contains the literature/public tools (`synapse_search_papers`, `synapse_read_paper_brief`, `synapse_read_paper_head`, `synapse_read_paper_section`, `synapse_read_paper_full`, `synapse_add_related_work`, `synapse_get_related_works`, `synapse_checkin`, `synapse_get_research_project`, `synapse_get_project_full_context`) and does **not** contain `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_reserve_gpus`, or any admin tool.

- [ ] **Step 4: Commit (only if Step 2 required an edit)**

```bash
git add public/synapse-plugin/bin/on-session-start.sh
git commit -m "fix(plugin): align session-start hook with codex stdin/output schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If no edit was needed, skip this commit and note in the task summary that the shared script worked unchanged.

---

### Task 9: Resolve the marketplace distribution unknown

**Files:**
- Modify (if required): `.claude-plugin/marketplace.json`

The spec leaves one open question: whether Codex requires `policy.installation`, `policy.authentication`, and `category` on the shared marketplace entry. Resolve it here.

- [ ] **Step 1: Determine whether Codex requires policy fields**

Consult the Codex plugin marketplace docs (https://developers.openai.com/codex/plugins/build — "Installation & Enabling"). Determine whether `codex plugin marketplace add` rejects an entry lacking `policy.installation` / `policy.authentication` / `category`.

- [ ] **Step 2a: If required — add them additively to the existing entry**

The current `.claude-plugin/marketplace.json` `synapse` entry has `name`, `source`, `description`, `version`, `category`, `tags`. If Codex needs a `policy` object, add it to that same entry (it is inert for Claude Code):

```json
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" }
```

Insert it as a sibling of `version` inside the existing `synapse` plugin object. Do not create a second entry and do not create `.agents/plugins/marketplace.json` — one entry serves both harnesses.

- [ ] **Step 2b: If not required — make no change**

Record in the task summary that Codex accepts the existing entry as-is.

- [ ] **Step 3: Verify it parses (only if edited)**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 4: Manual install verification**

On a machine with Codex: `codex plugin marketplace add Vincentwei1021/Synapse`, then install/enable the `synapse` plugin and confirm it loads the manifest and skills without error.

- [ ] **Step 5: Commit (only if Step 2a applied)**

```bash
git add .claude-plugin/marketplace.json
git commit -m "chore(plugin): add codex marketplace policy fields to shared entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Full verification + docs touch-up

**Files:**
- Read/verify only: full test suite, lint
- Modify (optional, if release-facing): `README.md` / `README.zh.md` "What's New"

- [ ] **Step 1: Run the full suite and lint**

Run: `pnpm test && pnpm lint`
Expected: PASS. Coverage thresholds hold (the only `src/services|lib` change is `agent-transport.ts`, covered by Task 1).

- [ ] **Step 2: Confirm no realtime-only surface offers codex**

Grep for dropdowns filtered by realtime transport and confirm codex (poll) is excluded automatically:

Run: `grep -rn "transport=realtime\|getTypesByTransport(\"realtime\")\|isRealtimeAgent" src --include="*.ts" --include="*.tsx"`
Expected: each hit relies on the transport map (which maps codex → poll), so no codex leakage into auto-search / deep-research / autonomous-loop dispatch. This is a read-only confirmation; no edit unless a hardcoded type list is found.

- [ ] **Step 3: (Optional) Add a "What's New" bullet**

If this ships as a release, add a one-line user-facing bullet to `README.md` and `README.zh.md` noting Codex paper-search support. Skip if the user is batching releases.

- [ ] **Step 4: Final commit (only if README touched)**

```bash
git add README.md README.zh.md
git commit -m "docs: note codex paper-search support in What's New

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation: release surface check

Per `AGENTS.md` Post-Merge Package Release Check, after merge inspect which surfaces changed:
- `public/synapse-plugin/` changed → the Claude Code plugin / Codex plugin assets changed; follow the plugin release flow (bump plugin metadata if the marketplace version is user-visible, publish per current flow).
- `src/`, `messages/` runtime changed → if shipped by `@synapse-research/synapse`, the main npm package + Docker `:latest` must advance together.
- No Prisma schema change (confirmed — `Agent.type` is a String), so no migration release concern.

This is a release-time checklist, not an implementation task.

---

## Self-Review

**Spec coverage:**
- Core insight (role-gated, not stripped plugin) → Tasks 1 (transport) + 8 Step 3 (role isolation verified). ✓
- One-line server change, no migration → Task 1. ✓
- Shared `public/synapse-plugin/` assets → Tasks 6, 7, 8 (reuse bin/skills/.mcp.json). ✓
- `.codex-plugin/plugin.json` with skills + hooks + interface → Task 6. ✓
- `hooks/hooks-codex.json` event subset → Task 7. ✓
- `CLAUDE_PLUGIN_ROOT` compatibility / `hookSpecificOutput.additionalContext` → Tasks 7, 8. ✓
- Frontend exposes codex (agents page, onboarding, icon, i18n en+zh) → Tasks 2, 3, 4, 5. ✓
- Distribution (one shared marketplace entry; policy-field unknown) → Task 9. ✓
- Testing matrix (unit, connectivity, script, behavior) → Tasks 1, 8, plus behavior E2E noted in Task 8 Step 3 / Task 9 Step 4. ✓
- Exclusion from realtime dispatch → Task 1 (poll mapping) + Task 10 Step 2. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" left; every code step shows exact content. Task 8 Step 2 and Task 9 Step 2 are explicitly conditional (verify-then-edit) with concrete pass criteria, not vague placeholders. ✓

**Type/name consistency:** `codex` string used identically across transport map, `AGENT_TYPES`, `TYPE_BADGE_CLASSES`, icon branch, i18n keys (`agents.type.codex`, `agents.typeDesc.codex`, `typeCodex`, `typeCodexDesc`), and both manifests (`name: "synapse"`, `version: "0.9.1"`). Icon `Sparkles` imported in both Task 2 and Task 5. ✓

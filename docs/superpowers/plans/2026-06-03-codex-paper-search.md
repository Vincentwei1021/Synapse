# Codex Paper Search Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect OpenAI Codex to Synapse for the Paper Search phase, reusing the existing `public/synapse-plugin/` assets and gating capability via the agent's `pre_research` role, structured so full Claude-Code parity is later reached by adding roles rather than rewriting.

**Architecture:** One server-side line registers `codex` as a poll-transport agent type (no migration — `Agent.type` is a plain String, and `VALID_AGENT_TYPES` is derived from the transport map). Tool exposure needs no change: `src/mcp/server.ts` already registers only literature tools for a `pre_research` key. The Codex plugin shares `public/synapse-plugin/` (skills, bin) and adds a `.codex-plugin/plugin.json` manifest plus a `hooks/hooks-codex.json` of Codex-supported events. The frontend exposes `codex` as a selectable agent type. **MCP is NOT bundled for Codex** — Codex cannot env-expand the shared `.mcp.json`, so the user configures it once via `codex mcp add` (documented in README). Codex distribution uses its own `.agents/plugins/marketplace.json` (object-form `source`), separate from Claude's `.claude-plugin/marketplace.json`. `research/SKILL.md` needs its `description` YAML-quoted (Codex's strict parser rejects bare colons that Claude tolerates).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5, Vitest, pnpm, next-intl. Codex plugin format (`.codex-plugin/plugin.json`, `hooks/hooks.json`, MCP over HTTP).

**Source-of-truth design doc:** [`docs/superpowers/specs/2026-06-03-codex-paper-search-design.md`](../specs/2026-06-03-codex-paper-search-design.md)

---

## File Structure

This plan **creates** these files:

- `public/synapse-plugin/.codex-plugin/plugin.json` — Codex manifest (declares `skills` + `hooks` paths + interface; **no `mcpServers`**)
- `public/synapse-plugin/hooks/hooks-codex.json` — Codex-supported event subset (SessionStart only for this phase)
- `.agents/plugins/marketplace.json` — Codex-native marketplace (object `source` `{source:"local", path:"./public/synapse-plugin"}` + `category` + `policy`)

This plan **modifies** these files:

- `src/lib/agent-transport.ts` — add `codex: "poll"` to the transport map
- `src/lib/__tests__/agent-transport.test.ts` — assert codex mapping; fix the `getTypesByTransport("poll")` assertion that adding codex breaks
- `src/components/agent-type-icon.tsx` — add a `codex` icon branch
- `src/app/(dashboard)/agents/agents-page-client.tsx` — add `codex` to `AGENT_TYPES` and `TYPE_BADGE_CLASSES`
- `src/app/onboarding/step1-agent.tsx` — add the `codex` type option; widen the option grid to 3 columns
- `messages/en.json` — add `agents.type.codex`, `agents.typeDesc.codex`, onboarding `typeCodex`/`typeCodexDesc`
- `messages/zh.json` — same keys, Chinese
- `public/synapse-plugin/skills/research/SKILL.md` — quote the `description` value (Codex YAML strictness)
- `README.md` / `README.zh.md` — add a Codex section: plugin install + `codex mcp add` MCP config

**`.mcp.json` is NOT modified and NOT used by Codex.** It stays for Claude Code (which loads it by convention). The Codex manifest does not declare `mcpServers`, and the user's `codex mcp add` config takes precedence over the same-named bundled entry. The bin scripts (`synapse-api.sh`, `on-session-start.sh`) are reused unchanged; Task 8 verifies they work under Codex's stdin/output schema.

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

### Task 9: Create the Codex-native marketplace

**Files:**
- Create: `.agents/plugins/marketplace.json`

Corrected from the original plan: Codex and Claude use **different** marketplace files because the `source` schema differs (Claude: string; Codex: object). Do **not** mutate `.claude-plugin/marketplace.json`. Codex resolves `source.path` relative to the marketplace root (the repo root, where `.agents/` lives).

- [ ] **Step 1: Create the Codex marketplace**

Create `.agents/plugins/marketplace.json` with exactly:

```json
{
  "name": "synapse-plugins",
  "plugins": [
    {
      "name": "synapse",
      "source": { "source": "local", "path": "./public/synapse-plugin" },
      "category": "Productivity",
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" }
    }
  ]
}
```

Codex docs say to always include `category` and `policy.installation`/`policy.authentication`.

- [ ] **Step 2: Verify it parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('.agents/plugins/marketplace.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 3: Manual install verification (needs Codex)**

```bash
codex plugin marketplace add <repo-root>
codex plugin add synapse@synapse-plugins
codex plugin list -m synapse-plugins   # STATUS should be "installed, enabled"
```
Expected: plugin installs and enables; `synapse` skills load. (Verified on Codex 0.136.0 during the design pass.)

- [ ] **Step 4: Commit**

```bash
git add .agents/plugins/marketplace.json
git commit -m "feat(plugin): add codex-native marketplace for synapse plugin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Fix research SKILL.md YAML for Codex

**Files:**
- Modify: `public/synapse-plugin/skills/research/SKILL.md`

Codex's strict YAML parser rejects the bare colon-space in the `description` (`research: project context`), skipping the skill with "mapping values are not allowed". Claude Code tolerates it. Quoting fixes both.

- [ ] **Step 1: Quote the description value**

In `public/synapse-plugin/skills/research/SKILL.md`, change line 3 from:

```yaml
description: Work on Synapse pre-experiment research: project context, research questions, literature search, related works, and deep research reports.
```

to (wrap the whole value in double quotes):

```yaml
description: "Work on Synapse pre-experiment research: project context, research questions, literature search, related works, and deep research reports."
```

- [ ] **Step 2: Audit the other SKILL.md files for the same issue**

Run:
```bash
for f in public/synapse-plugin/skills/*/SKILL.md; do
  awk '/^---$/{c++; next} c==1{print} c==2{exit}' "$f" | grep -nE '^[a-zA-Z_]+: [^"'"'"'].*: ' && echo "  ^ in $f"
done
```
Expected: no output (only `research` had the problem; quoting it clears the audit). If any other file matches, quote its value too.

- [ ] **Step 3: Commit**

```bash
git add public/synapse-plugin/skills/research/SKILL.md
git commit -m "fix(plugin): quote research SKILL.md description for codex YAML strictness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: README — Codex install + MCP config

**Files:**
- Modify: `README.md`, `README.zh.md`

The MCP connection for Codex is NOT bundled (Codex can't env-expand `.mcp.json`), so the README must document the one-time `codex mcp add`. Add a "Codex" subsection next to the existing "Connect AI Agents" / Claude Code plugin section.

- [ ] **Step 1: Add the Codex section to README.md**

Under "Connect AI Agents", after the Claude Code plugin option, add an Option for Codex with this content (adapt heading style to match the existing options):

```markdown
#### Option N: Codex

\`\`\`bash
codex plugin marketplace add Vincentwei1021/Synapse
codex plugin add synapse@synapse-plugins
\`\`\`

Configure the Synapse MCP server (Codex stores this in `~/.codex/config.toml`):

\`\`\`bash
export SYNAPSE_URL="http://localhost:3000"
export SYNAPSE_API_KEY="syn_your_api_key"
codex mcp add synapse --url "$SYNAPSE_URL/api/mcp" --bearer-token-env-var SYNAPSE_API_KEY
\`\`\`

> Run `codex mcp add` before launching Codex. (Codex does not expand `${VAR}` in a plugin's bundled `.mcp.json`, so the MCP server is configured at the user level rather than bundled.)
```

- [ ] **Step 2: Add the matching Chinese section to README.zh.md**

Mirror the same block in `README.zh.md` with Chinese prose (commands identical). No hardcoded English prose in the zh file.

- [ ] **Step 3: Commit**

```bash
git add README.md README.zh.md
git commit -m "docs(readme): document codex plugin install and mcp add config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Full verification

**Files:**
- Read/verify only: full test suite, lint

- [ ] **Step 1: Run the full suite and lint**

Run: `pnpm test && pnpm lint`
Expected: PASS (modulo the pre-existing `uuid-resolver.test.ts` failures unrelated to this work — confirm they are byte-identical to base with `git diff <base> HEAD -- src/lib/__tests__/uuid-resolver.test.ts`). Coverage thresholds hold (only `src/lib` change is `agent-transport.ts`, covered by Task 1).

- [ ] **Step 2: Confirm no realtime-only surface offers codex**

Run: `grep -rn "transport=realtime\|getTypesByTransport(\"realtime\")\|isRealtimeAgent" src --include="*.ts" --include="*.tsx"`
Expected: each hit routes through the transport map (codex → poll), so codex is auto-excluded from auto-search / deep-research / autonomous-loop dispatch. Read-only confirmation; no edit unless a hardcoded type list is found.

- [ ] **Step 3: (Optional) "What's New" bullet**

If shipping as a release, add a one-line user-facing bullet to `README.md` and `README.zh.md`. Skip if batching releases.

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
- Shared `public/synapse-plugin/` assets (skills, bin) → Tasks 6, 7, 8. ✓
- `.codex-plugin/plugin.json` with skills + hooks + interface, **no mcpServers** → Task 6. ✓
- `hooks/hooks-codex.json` event subset → Task 7. ✓
- `CLAUDE_PLUGIN_ROOT` compatibility / `hookSpecificOutput.additionalContext` → Tasks 7, 8. ✓
- Frontend exposes codex (agents page, onboarding, icon, i18n en+zh) → Tasks 2, 3, 4, 5. ✓
- Distribution via **Codex-native `.agents/plugins/marketplace.json`** (object source + policy), separate from Claude's → Task 9. ✓
- SKILL.md YAML strictness (quote research description) → Task 10. ✓
- MCP via user `codex mcp add`, documented in README (not bundled — Codex can't env-expand `.mcp.json`) → Task 11. ✓
- Testing matrix (unit, connectivity, script, YAML, MCP wiring, behavior) → Tasks 1, 8, 9, 10, 12. ✓
- Exclusion from realtime dispatch → Task 1 (poll mapping) + Task 12 Step 2. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" left; every code step shows exact content. Task 8 Step 2 is explicitly conditional (verify-then-edit) with concrete pass criteria, not a vague placeholder. ✓

**Type/name consistency:** `codex` string used identically across transport map, `AGENT_TYPES`, `TYPE_BADGE_CLASSES`, icon branch, i18n keys (`agents.type.codex`, `agents.typeDesc.codex`, `typeCodex`, `typeCodexDesc`), both manifests (`name: "synapse"`, `version: "0.9.1"`), and both marketplaces (`name: "synapse-plugins"`, plugin `name: "synapse"`). Icon `Sparkles` imported in both Task 2 and Task 5. ✓

**Note on execution status:** Tasks 1–8 were implemented and reviewed during the design/verification pass (commits on this branch). Tasks 9–11 reflect corrections discovered during live Codex testing (separate marketplace, YAML quoting, README MCP docs) and the `.agents/plugins/marketplace.json` + `research/SKILL.md` quote already exist in the worktree; the plan documents them for the record and for clean re-commit.

# Codex Integration — Paper Search Phase (Shared-Asset, Role-Gated)

**Date**: 2026-06-03
**Goal**: Connect OpenAI Codex to Synapse. The current release supports only research phase 1 (Paper Search / literature discovery). The long-term goal is full feature parity with the Claude Code plugin. The design is structured so that going from "paper search only" to "full parity" requires adding roles to the Codex agent — not rewriting the plugin.

---

## Core insight: capability is gated by server-side roles, not by the plugin

`src/mcp/server.ts` registers MCP tools dynamically based on the agent's `roles` (resolved from its `syn_` API key), independent of which client/plugin connects:

```ts
registerPublicTools(server, auth);     // all agents
registerSessionTools(server, auth);    // all agents
if (hasRole("pre_research")) registerLiteratureTools(server, auth);
if (hasRole("research", "report", ...)) registerResearchTools(server, auth);
if (hasRole("experiment", ...))         registerComputeTools(server, auth);
if (hasRole("admin", ...))              registerAdminTools(server, auth);
```

Therefore **"paper search only" is enforced by giving the Codex agent `roles: ["pre_research"]`** — which yields exactly the ~10 literature/read tools — **not by shipping a stripped-down plugin**. Reaching full parity later means granting that agent additional roles, with the plugin essentially unchanged.

This reframes the original `codex-paper-search-only-design.md` (which proposed an independent minimal plugin): the minimal surface is a property of the agent's roles, while plugin **assets** (skills, bin scripts) are shared with Claude Code.

---

## Architecture

```
┌──────────────────────────────────┐
│ Codex CLI                        │
│  Plugin assets (shared w/ Claude)│
│   ├── .codex-plugin/plugin.json  │  (no mcpServers declared)
│   ├── hooks/hooks-codex.json     │  (platform-compatible subset)
│   ├── bin/ (shared)              │
│   └── skills/ (shared)           │
│  MCP via user `codex mcp add`    │  → ~/.codex/config.toml
└───────────────┬──────────────────┘
                │ MCP JSON-RPC (HTTP, config.toml)
                ▼
┌──────────────────────────────────┐
│ Synapse Server — POST /api/mcp   │
│  Codex agent roles ["pre_research"]
│   → registerPublicTools           │
│   → registerSessionTools          │
│   → registerLiteratureTools       │
│  (experiment/compute/admin NOT    │
│   registered for this role)       │
└──────────────────────────────────┘
```

The design follows the obra/superpowers multi-harness pattern (verified against the installed 5.1.0 plugin): one plugin directory carries one `.X-plugin/plugin.json` manifest per harness, while `skills/`, `hooks/`, and `bin/` are shared. Per-harness divergence is larger than first assumed: (a) the manifest, (b) the hooks file (hook event support differs), (c) **MCP wiring** — Claude uses the bundled `.mcp.json`, Codex uses user-level `codex mcp add` (Codex cannot env-expand `.mcp.json`; see the MCP section), and (d) **SKILL.md YAML strictness** — Codex rejects bare colons that Claude tolerates.

---

## Plugin file layout (shared with the existing Claude Code plugin)

Reuses the existing `public/synapse-plugin/` directory rather than creating a separate plugin:

```
public/synapse-plugin/
├── .claude-plugin/
│   └── plugin.json              # existing Claude Code manifest (unchanged)
├── .codex-plugin/
│   └── plugin.json              # NEW: Codex manifest
├── .mcp.json                    # Claude Code only (Codex does not use it; see MCP section)
├── hooks/
│   ├── hooks.json               # existing Claude hooks (unchanged, default-convention path)
│   └── hooks-codex.json         # NEW: Codex-supported event subset
├── bin/                         # shared (synapse-api.sh, on-session-start.sh, ...)
└── skills/                      # shared; research/SKILL.md gets YAML-quoted description for Codex
```

Plus, outside the plugin dir:
- `.agents/plugins/marketplace.json` — NEW: Codex-native marketplace (object `source`); separate from `.claude-plugin/marketplace.json`.
- `README.md` / `README.zh.md` — NEW section: Codex install + `codex mcp add` MCP config.

**Why one directory, not two:** the Claude plugin's assets are role-adaptive (e.g. `on-session-start.sh` calls `synapse_checkin`, caches `agent.roles`, and injects context conditionally). A `pre_research`-only Codex agent connecting through the same assets naturally sees only literature context. Maintaining a second, stripped plugin would duplicate scripts and drift over time, and would have to be progressively re-expanded to reach parity — the opposite of the goal.

### `.codex-plugin/plugin.json` (new)

Per Codex docs, only `plugin.json` belongs in `.codex-plugin/`. The manifest must declare the skills path and the (non-default-located) hooks path:

```json
{
  "name": "synapse",
  "version": "0.9.1",
  "description": "Synapse research orchestration plugin for Codex. Literature search and collection via MCP; expands to full research workflow as agent roles are granted.",
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

> The `interface` block is optional (marketplace display only). `skills` and `hooks` keys are load-bearing for Codex.

### `hooks/hooks-codex.json` (new) — platform-compatible event subset

The existing Claude `hooks/hooks.json` registers events Codex does **not** support: `TeammateIdle` and `TaskCompleted` are not in Codex's event list, and the `PreToolUse` matchers `EnterPlanMode`/`ExitPlanMode`/`Task` are Claude-Code-specific concepts. Codex must get a pruned hooks file. For the paper-search phase, only `SessionStart` is needed:

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

Notes verified against Codex docs:
- `${CLAUDE_PLUGIN_ROOT}` is honored — Codex sets both `PLUGIN_ROOT` and the compatibility var `CLAUDE_PLUGIN_ROOT`. The shared `bin/` scripts therefore need no change.
- `SessionStart` supports the `startup|resume` matcher (applied to the `source` field).
- Hook command output uses `hookSpecificOutput.additionalContext` — identical to Claude Code, so `synapse-api.sh`'s `hook_output()` is reused verbatim.
- stdin to the hook is a JSON object with snake_case fields (`session_id`, `cwd`, `hook_event_name`, `source`, ...). `on-session-start.sh` already reads stdin defensively; confirm parsing is compatible during implementation.

As future phases land, Codex-supported events are added to `hooks-codex.json` incrementally (e.g. `SubagentStart`/`SubagentStop` exist in Codex). Claude-only events stay out of this file.

### Shared, unchanged assets

- `bin/synapse-api.sh`, `bin/on-session-start.sh` — reused as-is; the session-start script is already role-adaptive and emits the `hookSpecificOutput.additionalContext` shape Codex expects (verified by running it with a simulated Codex `source:"startup"` event).
- `skills/` — shared. A `pre_research`-only agent has no tools for experiment/autonomy skills; session-start guidance is filtered by role so the agent is steered to literature work and does not attempt unavailable tools.

### SKILL.md must be YAML-strict for Codex

Codex's SKILL.md YAML parser is **stricter than Claude Code's**. A frontmatter value containing a bare colon-space (`: `) — e.g. `description: Work on research: project context` — parses fine in Claude Code but Codex rejects it (`mapping values are not allowed in this context`) and skips the skill. **Fix:** quote any frontmatter value that contains `: `. Verified failure: `skills/research/SKILL.md` line 2; quoting the `description` value resolves it. This is a cross-harness compatibility rule, not a one-off — audit all SKILL.md frontmatter for bare colons.

### MCP connection: NOT shared via `.mcp.json` — user configures via `codex mcp add`

The original assumption "reuse `.mcp.json` verbatim" is **wrong for Codex** and was corrected after testing. Findings (verified against Codex 0.136.0 + official docs + the OpenAI-curated plugins):

1. **Codex does not expand `${VAR}` in `.mcp.json`.** The Claude plugin's `.mcp.json` (`"url": "${SYNAPSE_URL}/api/mcp"`, `"Bearer ${SYNAPSE_API_KEY}"`) reaches Codex literally, producing `relative URL without a base`.
2. **Codex's HTTP MCP schema is different** (config.toml / `codex mcp add`): `url` is a **literal string with no env/`${}` mechanism**, plus `bearer_token_env_var` (env var *name* for the token) and `env_http_headers`. The token can be env-driven; **the `url` cannot.**
3. **Codex's two plugin-bundled MCP carriers do not fit a self-hosted, user-specific URL:**
   - `mcpServers` → `.mcp.json` is documented for command/stdio servers; the HTTP `url` is a hardcoded literal a user cannot override per-install.
   - `.app.json` is an OpenAI-registered **connector** (the official figma/linear/stripe plugins use only `{ "apps": { "<name>": { "id": "connector_…" } } }`) — requires a platform connector ID; not available for self-hosted Synapse.
4. **Therefore the correct path for a self-hosted remote MCP is the user-level `codex mcp add`**, which writes `[mcp_servers.synapse]` into `~/.codex/config.toml`:
   ```bash
   codex mcp add synapse --url "<SYNAPSE_URL>/api/mcp" --bearer-token-env-var SYNAPSE_API_KEY
   ```
   This is documented in the **README**, not bundled in the plugin and not a setup skill (a one-time config action belongs in install docs).

**The shared `.mcp.json` is kept** (Claude Code requires it by convention; multiple Claude skills/README reference it). Under Codex it is harmless: when the user has run `codex mcp add synapse`, the user-level `config.toml` entry takes precedence over the same-named plugin entry, so the `${VAR}` `.mcp.json` is not used and the startup warning disappears. **The `.codex-plugin/plugin.json` does not declare `mcpServers`**, so Codex has no manifest pointer to that file.

**Known limitation:** in the window after installing the plugin but before running `codex mcp add`, Codex may emit one non-fatal `relative URL without a base` warning from the unconfigured `.mcp.json`. It does not block skills/hooks and clears once MCP is configured. Documented in the README install order (install → `codex mcp add`).

---

## Server-side change (one line + test)

`src/lib/agent-transport.ts` — add `codex` to the transport map:

```ts
const AGENT_TRANSPORT_MAP: Record<string, "realtime" | "poll"> = {
  openclaw: "realtime",
  claude_code: "poll",
  codex: "poll",          // NEW
};
```

This single line does double duty:
- `Agent.type` in `prisma/schema.prisma` is a plain `String` (default `"openclaw"`), **not** a Prisma enum — so **no migration and no `pnpm db:generate` are required**.
- `VALID_AGENT_TYPES = Object.keys(AGENT_TRANSPORT_MAP)` is derived from the map, so adding the key automatically makes the type-validation in `src/app/api/agents/route.ts`, `src/app/api/agents/[uuid]/route.ts`, and `src/app/(dashboard)/settings/actions.ts` accept `type: "codex"`.

`codex` maps to `poll` (like `claude_code`): Codex is not a realtime/SSE transport, so it must be excluded from `getTypesByTransport("realtime")` consumers (auto-search, deep research, autonomous-loop dispatch). Mapping to `poll` achieves this automatically.

### Tool exposure: zero change

The role gating in `src/mcp/server.ts` already yields exactly the paper-search tool set for a `pre_research` key:

| Tool | Source |
|---|---|
| `synapse_checkin`, `synapse_get_research_project`, `synapse_get_project_full_context`, `synapse_get_related_works` | public tools |
| `synapse_search_papers`, `synapse_read_paper_brief`, `synapse_read_paper_head`, `synapse_read_paper_section`, `synapse_read_paper_full`, `synapse_add_related_work` | literature tools (`pre_research`) |

Experiment, compute, research-question, and admin tools are not registered for this role.

---

## Frontend change — expose `codex` in the Agent UI

Confirmed in scope. Required edits:

- `src/app/(dashboard)/agents/agents-page-client.tsx` — `AGENT_TYPES = ["openclaw", "claude_code"]` → add `"codex"`.
- `src/app/onboarding/step1-agent.tsx` — add a `{ value: "codex", label: t("typeCodex"), desc: t("typeCodexDesc"), icon: ... }` option.
- `src/components/agent-type-icon.tsx` — currently `claude_code → Terminal`, else `Bot`. Add a `codex` branch (pick a distinct lucide icon; `Bot` fallback is acceptable if no distinct icon is chosen).
- `messages/en.json` and `messages/zh.json` — add `agents.type.codex`, `agents.typeDesc.codex` (the existing keys live near the `openclaw`/`claude_code` entries, e.g. en.json:985), plus any onboarding `typeCodex`/`typeCodexDesc` strings. No hardcoded English.

### Type ↔ role linkage (codex limited to `pre_research`)

Codex currently supports only the paper-search phase, so the agent dialogs constrain a `codex`-type agent to the `pre_research` role. Implemented via a small `ALLOWED_ROLES_BY_TYPE` map (`codex → ["pre_research"]`, others `null` = unrestricted) in both `agents-page-client.tsx` and `onboarding/step1-agent.tsx`:

- Selecting/switching to `codex` prunes any now-disallowed roles from the selection.
- Disallowed role checkboxes render disabled + dimmed for `codex`.

This is a **UI-level soft constraint only**. By deliberate decision, the server (`createAgent` / `POST /api/agents`) is **not** hardened — a direct API call can still create a `codex` agent with other roles. Rationale: the long-term plan is for Codex to support all phases (see Expansion path), so a hard server lock would have to be torn out later; the UI guard prevents accidental misconfiguration while keeping the API flexible. The README states the current paper-search-only limitation. **Known limitation:** API callers and pre-existing agents can hold disallowed role combinations; editing such an agent shows the extra role checked-but-disabled (surfaced, not silently stripped).

---

## Distribution

Codex and Claude Code use **different marketplace files** — the earlier assumption that one entry serves both was corrected. The `source` schema differs (Claude uses a string `"source": "./public/synapse-plugin"`; Codex uses an object `"source": { "source": "local", "path": "./public/synapse-plugin" }`), so a single shared entry does not parse cleanly for both.

- **Claude Code:** existing `.claude-plugin/marketplace.json` (unchanged).
- **Codex:** new `.agents/plugins/marketplace.json` (Codex-native path) with the object `source`, plus `category` and `policy.installation`/`policy.authentication` (Codex docs say to always include these; inert elsewhere). `path` resolves relative to the marketplace root (repo root).

Verified install flow on **Codex 0.136.0** (subcommands exist; not the interactive-only flow the docs imply):

```bash
codex plugin marketplace add <repo-root>          # registers the local .agents marketplace
codex plugin add synapse@synapse-plugins          # installs (PLUGIN@MARKETPLACE)
codex mcp add synapse --url "<SYNAPSE_URL>/api/mcp" --bearer-token-env-var SYNAPSE_API_KEY
export SYNAPSE_URL=... SYNAPSE_API_KEY=syn_...     # before launching codex
codex
```

Codex **copies** the plugin into `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` (not symlinked). After editing local plugin files, re-run `codex plugin add …` and restart Codex to refresh the cache. There is **no `--plugin-dir` flag** in Codex (unlike Claude Code).

A user creating a Codex agent in the Synapse UI selects type `codex`, grants `pre_research`, and copies the `syn_` key into `SYNAPSE_API_KEY`.

---

## Testing

| Layer | What | How | Needs Codex? |
|---|---|---|---|
| Unit | `agent-transport` codex mapping | Vitest: `getAgentTransport("codex")==="poll"`; `codex` ∉ `getTypesByTransport("realtime")` | no |
| Connectivity / role isolation | a `pre_research` key exposes only the ~10 literature tools; experiment/compute/admin tools absent | `public/mcp-tester.html` or `curl POST /api/mcp` with `tools/list` | no |
| Script / config | `hooks-codex.json` valid; `on-session-start.sh` runs | `bash -n`, `jq .`, pipe a fake `{"source":"startup"}` event to the script and inspect `hookSpecificOutput.additionalContext` | no |
| SKILL.md YAML | all skill frontmatter parses under Codex's strict YAML (no unquoted bare colons) | `codex plugin add` then launch — "Skipped loading N skill(s)" must not appear | yes |
| MCP wiring | `codex mcp add` produces a working `[mcp_servers.synapse]`; `codex mcp get synapse` shows correct url + bearer env | `codex mcp get synapse` | yes |
| Behavior (E2E) | SKILL.md guidance followed; agent stays within paper-search; declines experiment/report asks | install plugin in Codex, start a session, drive conversational scenarios | yes |

Verified during this design pass (Codex 0.136.0 + local Synapse): plugin installs and enables; `research/SKILL.md` loaded after YAML-quoting (previously skipped); MCP connected via `codex mcp add` (the bundled `.mcp.json` `${VAR}` form fails — root cause documented above); `pre_research` key exposed only literature/read tools.

Coverage note: the only `src/` logic change is one line in `agent-transport.ts`; the lib coverage threshold (95% lines) must still pass, so the unit test above is required.

---

## Backward compatibility

- Additive only. No schema migration (`Agent.type` is `String`). No change to existing Claude/OpenClaw behavior.
- Existing `hooks/hooks.json` untouched; Codex reads its own `hooks-codex.json`.
- Shared `bin/`/`skills/` already role-adaptive; the new role-gated literature-only path is an existing supported case.

---

## Out of scope (this phase)

- Codex support for research phases beyond paper search (deep research, research questions, experiments, autonomous loop). These arrive by granting roles + adding Codex-supported events to `hooks-codex.json`, per the expansion path below.
- New MCP tools (none needed; literature tools already exist).
- Realtime/SSE transport for Codex.

## Expansion path to full parity

| Phase added | Change |
|---|---|
| +Deep Research / Reports | grant `report` role to the Codex agent; session-start guidance already role-adaptive |
| +Research Questions | grant `research` role |
| +Experiments | grant `experiment` role; add Codex-supported subagent/tool events to `hooks-codex.json` as needed; reuse experiments skill |
| +Autonomous Loop | (realtime-dependent features remain OpenClaw-only unless Codex gains realtime transport) |

In every case the plugin assets are shared and largely unchanged; parity is primarily a roles + hooks-subset question, not a rewrite.

## Risks & open questions

- **Codex stdin field names**: confirmed snake_case (`source`, `hook_event_name`). `on-session-start.sh` parsing must be verified against a real Codex event during implementation; adjust the jq paths if the script assumed Claude's shape.
- **Shared skills visibility**: a `pre_research`-only Codex agent can read experiment/autonomy SKILL files even without the tools. Mitigation: role-filtered session-start guidance steers it to literature work. Acceptable for this phase; revisit if it causes confusion.
- **`autonomousLoopAgentUuid` / realtime dispatch**: `codex` is `poll`, so it must never be selectable for realtime-only dispatch surfaces. The transport map handles this; verify UI dropdowns that filter `?transport=realtime` exclude codex.

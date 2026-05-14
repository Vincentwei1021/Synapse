# Self-Review and CC Verbal-Approve Design

**Date:** 2026-05-13
**Branch:** `session/2026-05-13-experiment-report-enforcement`
**Status:** Spec — awaiting user review before implementation plan

## Goal

Standardize how OpenClaw and Claude Code (CC) agents prepare experiments for human review, and how a CC user can approve experiments verbally from the terminal without clicking the web UI.

Two changes drive everything else:

1. Every agent-created experiment goes through a **self-review** step performed by a sub-agent before it reaches `pending_review`. Self-review is in-session only — it does not write to the database.
2. CC users may approve / reject `pending_review` experiments verbally in the terminal. The CC main agent records the action via `synapse_review_experiment`, embedding the user's words in `reviewNote` for audit. Only the autonomous loop's **full_auto** mode skips human review (already true today; we keep it so).

OpenClaw should change as little as possible — only its prompts and tool descriptions, not its passthrough logic.

## Non-Goals

- No new database fields, no new entities. Self-review never persists to Synapse storage.
- No new MCP tool. Reuse existing `synapse_review_experiment` for both PI/admin and CC verbal-approve flows.
- No frontend changes.
- No PreToolUse hook to validate `reviewNote` shape (deferred — relying on skill documentation discipline).

## Roles and Flows

### Status Machine (Unchanged)

`draft → pending_review → pending_start → in_progress → completed`

State transitions remain governed by `assertTransition` in `src/services/experiment.service.ts`.

### Who Does What

| Agent type | Initial state on agent-created experiment | Self-review executor | Final review (`pending_review` → `pending_start`) |
|---|---|---|---|
| **OpenClaw — review mode** | `draft` | OpenClaw main agent spawns a sub-agent via the Agent tool | Human clicks Approve in the web UI (current behavior, unchanged) |
| **OpenClaw — full_auto** | `pending_start` (via `synapse_propose_experiment`, current behavior) | Same sub-agent, but reviews the **proposal text** before the propose call | N/A |
| **CC — review mode** | `draft` | CC main agent spawns a sub-agent via the `Task` tool | User says "approve" / "go" in terminal → CC main agent calls `synapse_review_experiment` |
| **CC — full_auto (verbal opt-in)** | `draft` | Same sub-agent | CC main agent auto-approves immediately after self-review, with full-auto reviewNote template |

### Self-Review Contract

- Self-review is always done by a **separate sub-agent** spawned through the platform's native sub-agent mechanism (CC `Task` tool; OpenClaw `Agent` tool).
- Self-review **never writes** to Synapse. It returns its verdict to the main agent in-session.
- Self-review is **advisory**, not gating. The main agent uses the verdict to revise the draft (or proposal text), but is never blocked from advancing.

### Verbal Approve Contract (CC only)

- Only `admin` and `pi_agent` agents may call `synapse_review_experiment`. To enable CC verbal-approve, configure the CC agent with one of those roles.
- When acting on a user's verbal approve, the CC main agent **must** include the user's exact words in `reviewNote`, e.g.
  `User verbally approved in terminal: "OK 上吧"`.
- When acting on a user's verbal reject, the CC main agent summarizes the user's revision request in second-person Chinese and includes the key quoted phrases. Example:
  `用户口头要求修改：把 batch size 改回 32（原话："那个 batch size 改回 32 试试"）`.
- For CC full_auto, `reviewNote` uses a fixed template:
  `Full-auto session authorized by <ownerName> at <ISO time>. Self-review pass: <要点>.`
  (or `Self-review skipped: <reason>.` if the sub-agent failed).
- The CC main agent **must not** call `synapse_add_comment` after `reviewExperiment` reject — `reviewExperiment` already writes a comment + emits `experiment_revision_requested` notification when `decision: "rejected"` and `reviewNote` is non-empty (current behavior in `src/services/experiment.service.ts`). Double-writing is forbidden.

### Full-Auto Persistence Model

- CC full_auto state lives **only in the CC main agent's session context**. The `autonomy` skill maintains a `mode: full_auto | review` flag.
- It is opted in verbally ("turn on autonomous loop", "full auto"). It does not touch the server-side `autonomousLoopEnabled` / `autonomousLoopMode` fields.
- It exits when:
  - the user says stop, or
  - the loop hits an unrecoverable external error (compute exhausted, MCP failure, etc.).
- `full_auto` **never pauses on its own** — self-review never blocks, sub-agent timeouts never block, advisory issues never block. The only exits are user-stop and hard-error.

## Component Changes

### Synapse server

#### `src/services/experiment.service.ts::createExperiment`

Change the default status for agent-created experiments from `pending_review` to `draft`.

Before:
```ts
const status =
  params.status ??
  (params.createdByType === "agent" ? "pending_review" : "pending_start");
```

After:
```ts
const status =
  params.status ??
  (params.createdByType === "agent" ? "draft" : "pending_start");
```

User-created experiments (frontend, direct API) remain `pending_start` by default — unchanged.

`synapse_propose_experiment` passes `status` explicitly (`pending_review` or `pending_start`) and is **not** affected.

#### `src/services/experiment.service.ts::reviewExperiment`

No logic change. Already supports `actorType: "user" | "agent"` and already auto-writes a comment + sends `experiment_revision_requested` on reject.

#### `src/app/api/experiments/[uuid]/review/route.ts`

No logic change from the current branch state. Allowed actors: `user`, plus agents with role `admin`, `pi`, or `pi_agent`. Agents with only `experiment` role get 403.

#### `src/mcp/tools/pi.ts::synapse_review_experiment`

No logic change. Update `description` to:
- State that approving on behalf of a verbal user requires the user's words in `reviewNote`.
- State that full_auto approvals must use the template above.

#### `src/mcp/tools/compute.ts::synapse_propose_experiment`

No logic change. Update `description` to mention "spawn a self-review sub-agent against the proposal text before calling this tool" so any agent reading the tool catalog sees the expectation.

### OpenClaw plugin (`packages/openclaw-plugin/`)

**No code logic changes.** Only:

- `src/tools/common-tool-definitions.ts` — descriptions for `synapse_create_experiment`, `synapse_propose_experiment`, `synapse_review_experiment` updated to mention self-review responsibility and `reviewNote` expectations.
- `src/event-router.ts` — the experiment-related dispatch templates (where they instruct the main agent to spawn a sub-agent) get one extra line: "Before publishing the experiment to `pending_review` (create flow) or before calling `synapse_propose_experiment` (autonomous flow), spawn a sub-agent for self-review."

OpenClaw passthrough logic, registry, and event routing remain untouched.

### CC plugin (`public/synapse-plugin/`)

#### Hook: `bin/on-post-tool-use.sh` (new)

PostToolUse hook with matcher `mcp__synapse__synapse_create_experiment`.

Behavior:
- Parse the tool response. If it includes `experimentUuid` and the experiment was created with `createdByType: "agent"` and `status: "draft"`, emit `additionalContext`:

  > 已在 Synapse 创建实验 `<uuid>`（draft）。下一步：用 `Task` 工具派一个 sub-agent 做 self-review（subagent_type 任选，prompt 里附 experimentUuid + project 上下文 + 评审要点：方法是否清晰、目标是否可衡量、compute 预算是否合理、是否与现有结果重复）。等 sub-agent 返回结论后，必要时用 `synapse_update_experiment_plan` 修订 draft，再调 `synapse_update_experiment_status({ status: "pending_review" })` 推进到 review，并把 self-review 摘要呈给用户等待口头 approve。Full-auto 模式下 self-review 通过即直接调 `synapse_review_experiment` 自动 approve。

- Hook must be registered in the plugin's hook config (mirror `on-post-submit-results.sh` registration pattern).

This hook is CC-only. OpenClaw does not run plugin bash hooks.

#### Skill: `skills/experiments/SKILL.md`

Add a "Create → Self-Review → Pending Review → Verbal Approve" section to the typical flow:

1. `synapse_create_experiment(...)` — defaults to `draft`.
2. Spawn a sub-agent via `Task` for self-review. Provide a sub-agent prompt template inside the skill so the main agent can paste it.
3. Apply revisions with `synapse_update_experiment_plan` if any.
4. `synapse_update_experiment_status({ status: "pending_review" })`.
5. Show user the self-review summary + plan summary in terminal; wait for verbal answer.
6. If approve → `synapse_review_experiment({ decision: "approved", reviewNote: 'User verbally approved in terminal: "<原话>"' })`.
7. If reject → `synapse_review_experiment({ decision: "rejected", reviewNote: '用户口头要求修改：…（原话："…"）' })` — `reviewExperiment` writes the comment for you; do not double-write.

The skill must explicitly forbid `synapse_add_comment` after a `reviewExperiment` reject.

#### Skill: `skills/autonomy/SKILL.md`

Add:
- Verbal opt-in for full_auto. Mode lives only in main-agent session context. Never persists.
- Before `synapse_propose_experiment`, spawn a sub-agent to review the proposal text.
- Full-auto auto-approve template for `reviewNote`.
- Full-auto exit conditions: user-stop or hard external error only. Self-review never pauses the loop. Sub-agent timeout in self-review → record "Self-review skipped: <reason>" in `reviewNote` and continue.

#### Skill: `skills/synapse/references/00-common-tools.md`

Add a `reviewNote` formatting block under `synapse_review_experiment`:
- Quote the user's exact words for verbal approve / reject.
- Use the full-auto template for full_auto approvals.

#### Mirrored copies

All three skill files plus the new hook script live under `public/synapse-plugin/...` and must be mirrored into `packages/synapse-cli/dist/public/synapse-plugin/...` (current repo convention — visible in this branch's `git status`).

## Data Flow

### CC review mode

```
[CC main]              [Sub-agent]         [Synapse]            [User in terminal]
  │
  │── synapse_create_experiment ─────────────────────────────►│ status=draft
  │
  │── PostToolUse hook injects: spawn self-review sub-agent
  │
  │── Task(self-review) ─►│
  │                       │── synapse_get_experiment ────────►│
  │                       │◄── plan + context ────────────────│
  │                       │ writes verdict
  │◄── verdict ───────────│
  │
  │── synapse_update_experiment_plan (if revisions) ─────────►│
  │── synapse_update_experiment_status({ pending_review }) ──►│
  │
  │── show user: "self-review says X, plan summary Y. Approve?" ────►│
  │◄── "上吧" ────────────────────────────────────────────────────────│
  │
  │── synapse_review_experiment({
  │       approved,
  │       reviewNote: 'User verbally approved in terminal: "上吧"'
  │   }) ─────────────────────────────────────────────────────►│
  │                                  state → pending_start
  │                                  activity + task_assigned
```

### CC full_auto

Same as above except after step `pending_review`, instead of asking the user the main agent immediately calls
`synapse_review_experiment({ approved, reviewNote: 'Full-auto session authorized by <owner> at <ISO>. Self-review pass: <key points>.' })`.

If self-review sub-agent fails or times out, the main agent calls `synapse_review_experiment` with `Self-review skipped: <reason>` in `reviewNote` and continues. Full-auto never blocks.

### CC reject path

```
  │── show user: "self-review + plan, OK?" ────►│
  │◄── "再想想 X，把 Y 改成 Z" ───────────────────│
  │
  │ main agent summarizes user feedback in 2nd-person Chinese + key quotes
  │
  │── synapse_review_experiment({
  │       rejected,
  │       reviewNote: '用户口头要求修改：把 Y 改成 Z…（原话："…"）'
  │   }) ─────────────────────────────────────────────────────►│
  │                                  state → draft
  │                                  + comment authored by agent (auto)
  │                                  + experiment_revision_requested notification
  │
  │── revise draft → re-run self-review → pending_review → ...
```

### OpenClaw create path

```
[OpenClaw main]      [Sub-agent (Agent tool)]      [Synapse]
  │── synapse_create_experiment ───────────────────►│ status=draft
  │── Agent(self-review) ──►│
  │                         │── synapse_get_experiment ─────►│
  │◄── verdict ─────────────│
  │── synapse_update_experiment_plan (if revisions) ─►│
  │── synapse_update_experiment_status({ pending_review }) ─────────►│
  │
  │       (human clicks Approve in web UI — unchanged)
  │                                                  state → pending_start
  │                                                  task_assigned → openclaw main agent
  │── execute …
```

### OpenClaw full_auto propose

OpenClaw main agent spawns a sub-agent to review the **proposal text** (no DB row yet), then calls `synapse_propose_experiment`. Server-side propose path stays unchanged.

## Error Handling

| Scenario | Behavior |
|---|---|
| Self-review sub-agent times out (review mode) | Main agent writes a `synapse_add_comment` noting "self-review incomplete: <reason>", presents that to the user along with the plan, and lets the user decide. Not a blocker. |
| Self-review sub-agent times out (full_auto) | Skip self-review, continue. `reviewNote` records `Self-review skipped: <reason>`. |
| Self-review returns blocking concerns (full_auto) | Main agent applies one revision pass if reasonable; whether or not that succeeds, advance. Full-auto never loops on advisory output. |
| Self-review returns blocking concerns (review mode) | Main agent revises if reasonable, then presents both the revised plan and the unresolved concerns to the user. User decides. |
| `synapse_review_experiment` rejected because state is no longer `pending_review` | `assertTransition` returns the existing error. Main agent surfaces error to user and does not retry. |
| `createExperiment` default change collides with old user-created flows | None — user creates default to `pending_start`, unchanged. |
| Existing `pending_review` experiments in DB | No migration needed. State machine unchanged. Existing experiments approve through the regular human path. |
| OpenClaw main agent forgets self-review | No hard block. Discipline is enforced through prompt template + tool description text. This is an explicit trade-off to keep OpenClaw changes minimal. |

## Testing

### Server (Vitest)

- `src/services/__tests__/experiment.service.test.ts` (existing)
  - Add: `createExperiment({ createdByType: "agent" })` defaults to `draft`.
  - Add: `createExperiment({ createdByType: "agent", status: "pending_review" })` is honored when caller specifies.
  - Add: `createExperiment({ createdByType: "user" })` defaults to `pending_start` (regression).
- `src/services/__tests__/experiment.service.review.test.ts` (existing on this branch)
  - Add: `reviewExperiment({ approved: false, reviewNote: "..." actorType: "agent" })` writes exactly one comment with `authorType: "agent"` and emits `experiment_revision_requested`.
  - Verify reject without `reviewNote` does **not** write a comment (current behavior preserved).
- `src/app/api/__tests__/experiments-route.test.ts` (existing on this branch)
  - Add: agent with only `experiment` role gets 403 from `/review`.
  - Confirm: `admin`, `pi`, `pi_agent` allowed.

### OpenClaw plugin

No tests. The diff is description text only.

### CC plugin

- `bin/test-syntax.sh` should validate the new `on-post-tool-use.sh` syntactically.
- Manual integration: run `pnpm dev`, walk through create → self-review → pending_review → verbal approve and create → reject path. Document expected screenshots / observations in the PR description.

## Release Checklist

After implementation:

1. Mirror `public/synapse-plugin/skills/...` → `packages/synapse-cli/dist/public/synapse-plugin/skills/...`.
2. Mirror `public/synapse-plugin/bin/on-post-tool-use.sh` → `packages/synapse-cli/dist/public/synapse-plugin/bin/...`.
3. Bump `packages/openclaw-plugin/package.json` and publish from `synapse` host (per CLAUDE.md OpenClaw deployment section) — required because tool descriptions changed and shipped through openclaw.
4. Bump `packages/synapse-cli` per the existing release flow.
5. Sanity check `synapse_review_experiment` is callable for `admin` / `pi_agent` agents and 403s for `experiment`-only agents.

## Open Questions

None at spec time. All design questions were resolved during brainstorming on 2026-05-13.

# P2 — `synapse daemon`: Frontend-Wakes-Local-Claude-Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `synapse daemon` command that connects to a Synapse server over SSE as an agent, and on each experiment-assignment notification drives a **persistent per-experiment Claude Code conversation** (one `claude` process spawned per turn, conversation persisted via `claude`'s own session file), so a human never has to manually start/resume the agent.

**Architecture:** A new TypeScript workspace package `packages/synapse-daemon`, bundled as a dependency of the existing `@synapse-research/synapse` CLI and exposed via a new `synapse daemon` subcommand (zero extra install step for users). The daemon reuses the SSE connect/reconnect logic (vendored from the OpenClaw plugin in P2; extraction to a shared package is a later cleanup), filters wake-worthy notifications, and for each experiment maintains a session keyed by `experimentUuid`: the **first** turn runs `claude -p "<prompt>" --session-id <experimentUuid> --output-format json …`, **subsequent** turns run `claude -p "<turn>" --resume <experimentUuid> …`. A wake-queue serialises turns per session key. The daemon reports connection heartbeats to the P1 registry (reusing the P1 `/api/agent-connections/heartbeat` endpoint) so a connected `claude_code` agent is treated as realtime.

**Tech Stack:** TypeScript 5, Node ≥18 (`child_process.spawn`, global `fetch`), Vitest. Server side: Next.js 15 route handlers, the existing `src/lib/agent-transport.ts` and P1 `src/lib/connection-registry.ts`. The `claude` CLI is an external runtime dependency discovered on `PATH`.

## Global Constraints

- **User install is one step.** `packages/synapse-daemon` is a `dependencies` entry of `packages/synapse-cli` (`@synapse-research/synapse`); the CLI's `bin/synapse.mjs` dispatches `argv[2] === "daemon"` to it. Users still run only `npx @synapse-research/synapse daemon`. Do NOT publish a second user-facing package.
- **Session model: one persistent conversation per experiment.** `claude --session-id` value = the experiment UUID verbatim (it is already a UUID, which `--session-id` requires). First turn uses `--session-id`; every later turn for that experiment uses `--resume <experimentUuid>`.
- **Per-turn spawn, not a long-lived process.** Each turn is a fresh `claude -p` invocation that exits; conversation state lives in `claude`'s on-disk session. (Decision locked: avoids stdin/stream-json process-liveness complexity.)
- **Turns for one session run strictly serially** via a wake-queue keyed by `experimentUuid`. Concurrent turns to the same `--resume` session corrupt it.
- **Safe-by-default tool posture.** Default spawn allows only the Synapse MCP server: `--allowedTools "mcp__synapse" --permission-mode dontAsk`. `--yolo` (daemon flag) maps to `--dangerously-skip-permissions`. The daemon prints its posture at startup.
- **Headless interaction guard.** Spawns run in `-p` print mode with `--permission-mode dontAsk`, so a tool needing un-pre-approved permission aborts the turn rather than hanging. (P4 will route such needs back to Synapse; P2 only must not hang.)
- **MCP wiring.** The daemon generates a `.mcp.json` (server name `synapse`, `type: http`, `url: ${SYNAPSE_URL}/api/mcp`, `Authorization: Bearer ${SYNAPSE_API_KEY}`) and passes it via `--mcp-config <path> --strict-mcp-config`. Confirmed CLI flags: `-p`/`--print`, `--session-id <uuid>`, `--resume <id>`, `--mcp-config`, `--strict-mcp-config`, `--allowedTools`, `--permission-mode <default|acceptEdits|plan|auto|dontAsk|bypassPermissions>`, `--dangerously-skip-permissions`, `--output-format <text|json|stream-json>`, `--model <id>`.
- **Config/auth.** Daemon reads `SYNAPSE_URL` and `SYNAPSE_API_KEY` (syn_-prefixed) from env first, falling back to `~/.synapse/daemon.json`. Never log the key. Never commit a key.
- **Assignment notification shape (verified).** Wake on `notification.action === "run_assigned" || "task_assigned"`. The SSE event (`SseNotificationEvent`) carries `notificationType`, `action`, `entityType` (`"experiment" | "experiment_run"`), `entityUuid`, `researchProjectUuid`, `entityTitle`, `message`, `actorName`. Ignore noisy events (e.g. `comment_added`).
- **Dynamic realtime.** A `claude_code` agent with a live daemon connection in the P1 registry is treated as realtime. Add a connection-aware check; do NOT statically flip `claude_code` to realtime in `AGENT_TRANSPORT_MAP` (that would mis-gate daemon-less CC agents). The five gate sites all call `isRealtimeAgent(agent.type)`: `src/app/api/research-projects/[uuid]/synthesis/trigger/route.ts:37`, `.../related-works/deep-research/route.ts:38`, `.../related-works/auto-search/route.ts:38`, `src/services/research-project.service.ts:277`, `src/services/paper-feed.service.ts:75`.
- Tests: Vitest, mirroring `packages/openclaw-plugin/src/*.test.ts` (vi.fn loggers, `vi.useFakeTimers`, dependency injection for `fetch`/spawn). No network, no real `claude`, no real child processes in unit tests.
- Business logic that lives server-side stays in `src/services` / `src/lib`; daemon-local logic lives in `packages/synapse-daemon/src`.

---

## File Structure

**New package `packages/synapse-daemon/`:**
- `package.json` — name `@synapse-research/synapse-daemon`, private-ish (bundled into CLI), `type: module`, `build: tsc -p tsconfig.build.json`, `test`, `typecheck`. Deps: none runtime beyond Node built-ins (uses global `fetch`).
- `tsconfig.json`, `tsconfig.build.json` — mirror `packages/openclaw-plugin`.
- `src/config.ts` — resolve `{ synapseUrl, apiKey, yolo, model, cwd }` from env + `~/.synapse/daemon.json`; validate.
- `src/sse-listener.ts` — **vendored copy** of `packages/openclaw-plugin/src/sse-listener.ts` (class `SynapseSseListener`, `SseNotificationEvent`, `SynapseSseListenerOptions`). Unmodified logic.
- `src/wake-filter.ts` — pure: given an `SseNotificationEvent`, decide whether it is a wake (and to which `experimentUuid`).
- `src/wake-queue.ts` — pure-ish: serialise async tasks per string key.
- `src/mcp-config.ts` — write a `.mcp.json` for a given `synapseUrl`/`apiKey`, return its path; build the `claude` argv array (pure, testable).
- `src/claude-spawner.ts` — spawn one `claude` turn (first vs resume), capture `session_id` from `--output-format json`, injectable spawn fn.
- `src/prompt-builder.ts` — pure: build the turn prompt string from a wake event (project/experiment context line + instruction).
- `src/heartbeat-reporter.ts` — **vendored copy** of `packages/openclaw-plugin/src/heartbeat-reporter.ts` (P1 reporter), `clientType: "claude_code"`.
- `src/daemon.ts` — orchestrator: wires config → listener → filter → queue → spawner → heartbeat; tracks per-experiment session state (new vs resume).
- `src/index.ts` — `runDaemon(argv)` entry the CLI calls.
- `src/__tests__/*.test.ts` — one per pure module + a daemon integration test with everything mocked.

**Modified:**
- `packages/synapse-cli/package.json` — add `@synapse-research/synapse-daemon` dependency; ensure its `dist` is bundled at pack time.
- `packages/synapse-cli/bin/synapse.mjs` — dispatch `argv[2] === "daemon"` to the daemon entry before the server-launch path; add `daemon` to `--help`.
- `src/lib/agent-transport.ts` — add `isRealtimeForAgent(agentType, hasLiveConnection)` helper (keeps `AGENT_TRANSPORT_MAP` unchanged).
- `src/lib/connection-registry.ts` — add `hasLiveConnection(agentUuid, now): boolean` (online connection exists for agent).
- `src/services/agent-connection.service.ts` — export `agentHasLiveConnection(agentUuid, now?): boolean` (thin wrapper used by gate sites).
- The five gate sites listed above — replace `isRealtimeAgent(agent.type)` with a connection-aware check.

---

### Task 1: Scaffold the `synapse-daemon` package

Create the package skeleton so later tasks have a home. No daemon logic yet — just a compiling, testable package wired into the workspace.

**Files:**
- Create: `packages/synapse-daemon/package.json`
- Create: `packages/synapse-daemon/tsconfig.json`
- Create: `packages/synapse-daemon/tsconfig.build.json`
- Create: `packages/synapse-daemon/src/index.ts`
- Test: `packages/synapse-daemon/src/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `export async function runDaemon(argv: string[]): Promise<void>` in `src/index.ts` (stub for now: parses `--help`/prints a banner and returns; real wiring in Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";
import { runDaemon } from "../index";

describe("runDaemon", () => {
  it("is a function that resolves for --help", async () => {
    expect(typeof runDaemon).toBe("function");
    await expect(runDaemon(["--help"])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/smoke.test.ts`
Expected: FAIL — cannot resolve `../index`.

- [ ] **Step 3: Create the package files**

`packages/synapse-daemon/package.json`:
```json
{
  "name": "@synapse-research/synapse-daemon",
  "version": "0.1.0",
  "description": "Synapse daemon — wakes local Claude Code on experiment assignment",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "rm -rf dist && pnpm run build",
    "typecheck": "tsc --noEmit",
    "test": "cd ../.. && pnpm exec vitest run packages/synapse-daemon/src/__tests__"
  }
}
```

`packages/synapse-daemon/tsconfig.json` (copy of `packages/openclaw-plugin/tsconfig.json` — read that file and replicate it; it targets ESM/NodeNext). If that file cannot be read, use:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/synapse-daemon/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts", "src/__tests__"]
}
```

`packages/synapse-daemon/src/index.ts`:
```ts
// Entry point for `synapse daemon`. Full wiring lands in a later task.
export async function runDaemon(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("synapse daemon — wakes local Claude Code on experiment assignment");
    return;
  }
  console.log("synapse daemon: not yet wired up");
}
```

- [ ] **Step 4: Run test + typecheck**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/smoke.test.ts` then `pnpm typecheck`
Expected: test PASS (1), typecheck clean.

- [ ] **Step 5: Confirm workspace picks up the package**

Run: from repo root, `pnpm install` (links the new workspace package)
Expected: completes; `@synapse-research/synapse-daemon` resolvable.

- [ ] **Step 6: Commit**

```bash
git add packages/synapse-daemon pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(daemon): scaffold @synapse-research/synapse-daemon package"
```
(Only add `pnpm-workspace.yaml` if you had to edit it to include `packages/*`; check first — it likely already globs `packages/*`.)

---

### Task 2: Config resolution

Resolve and validate daemon config from env + `~/.synapse/daemon.json`.

**Files:**
- Create: `packages/synapse-daemon/src/config.ts`
- Test: `packages/synapse-daemon/src/__tests__/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DaemonConfig {
    synapseUrl: string;   // no trailing slash
    apiKey: string;       // syn_...
    yolo: boolean;
    model: string | null; // null = claude default
    cwd: string;          // working dir for claude spawns
  }
  export interface ResolveConfigInput {
    env: Record<string, string | undefined>;
    argv: string[];
    fileContents?: string | null; // contents of ~/.synapse/daemon.json, or null if absent
    cwd: string;                  // process.cwd() injected
  }
  export function resolveConfig(input: ResolveConfigInput): DaemonConfig; // throws on missing url/key
  ```
  Resolution order per field: argv flag > env > file. Flags: `--url`, `--key` (discouraged—prefer env), `--yolo`, `--model <id>`, `--cwd <path>`. Env: `SYNAPSE_URL`, `SYNAPSE_API_KEY`. File JSON keys: `synapseUrl`, `apiKey`, `yolo`, `model`, `cwd`. Strip trailing slash from url. Throw `Error("SYNAPSE_URL is required")` / `Error("SYNAPSE_API_KEY is required")` if unresolved. Validate apiKey starts with `syn_` else throw `Error("SYNAPSE_API_KEY must start with syn_")`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/config.test.ts
import { describe, it, expect } from "vitest";
import { resolveConfig } from "../config";

const base = { argv: [] as string[], fileContents: null, cwd: "/work" };

describe("resolveConfig", () => {
  it("reads url+key from env, strips trailing slash", () => {
    const c = resolveConfig({ ...base, env: { SYNAPSE_URL: "https://s.example/", SYNAPSE_API_KEY: "syn_abc" } });
    expect(c.synapseUrl).toBe("https://s.example");
    expect(c.apiKey).toBe("syn_abc");
    expect(c.yolo).toBe(false);
    expect(c.model).toBeNull();
    expect(c.cwd).toBe("/work");
  });

  it("argv overrides env; --yolo and --model parsed", () => {
    const c = resolveConfig({
      ...base,
      env: { SYNAPSE_URL: "https://env", SYNAPSE_API_KEY: "syn_env" },
      argv: ["--url", "https://flag", "--yolo", "--model", "opus", "--cwd", "/proj"],
    });
    expect(c.synapseUrl).toBe("https://flag");
    expect(c.yolo).toBe(true);
    expect(c.model).toBe("opus");
    expect(c.cwd).toBe("/proj");
  });

  it("falls back to file contents when env absent", () => {
    const c = resolveConfig({
      ...base,
      env: {},
      fileContents: JSON.stringify({ synapseUrl: "https://file", apiKey: "syn_file" }),
    });
    expect(c.synapseUrl).toBe("https://file");
    expect(c.apiKey).toBe("syn_file");
  });

  it("throws when url missing", () => {
    expect(() => resolveConfig({ ...base, env: { SYNAPSE_API_KEY: "syn_x" } })).toThrow(/SYNAPSE_URL is required/);
  });

  it("throws when key missing", () => {
    expect(() => resolveConfig({ ...base, env: { SYNAPSE_URL: "https://s" } })).toThrow(/SYNAPSE_API_KEY is required/);
  });

  it("throws when key has wrong prefix", () => {
    expect(() => resolveConfig({ ...base, env: { SYNAPSE_URL: "https://s", SYNAPSE_API_KEY: "bad" } })).toThrow(/must start with syn_/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/config.test.ts`
Expected: FAIL — `../config` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/synapse-daemon/src/config.ts
export interface DaemonConfig {
  synapseUrl: string;
  apiKey: string;
  yolo: boolean;
  model: string | null;
  cwd: string;
}

export interface ResolveConfigInput {
  env: Record<string, string | undefined>;
  argv: string[];
  fileContents?: string | null;
  cwd: string;
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

export function resolveConfig(input: ResolveConfigInput): DaemonConfig {
  let file: Record<string, unknown> = {};
  if (input.fileContents) {
    try {
      file = JSON.parse(input.fileContents) as Record<string, unknown>;
    } catch {
      file = {};
    }
  }

  const url =
    flagValue(input.argv, "--url") ??
    input.env.SYNAPSE_URL ??
    (typeof file.synapseUrl === "string" ? file.synapseUrl : undefined);
  const key =
    flagValue(input.argv, "--key") ??
    input.env.SYNAPSE_API_KEY ??
    (typeof file.apiKey === "string" ? file.apiKey : undefined);

  if (!url) throw new Error("SYNAPSE_URL is required");
  if (!key) throw new Error("SYNAPSE_API_KEY is required");
  if (!key.startsWith("syn_")) throw new Error("SYNAPSE_API_KEY must start with syn_");

  const yolo = input.argv.includes("--yolo") || file.yolo === true;
  const model =
    flagValue(input.argv, "--model") ??
    (typeof file.model === "string" ? file.model : null);
  const cwd =
    flagValue(input.argv, "--cwd") ??
    (typeof file.cwd === "string" ? file.cwd : input.cwd);

  return {
    synapseUrl: url.replace(/\/$/, ""),
    apiKey: key,
    yolo,
    model,
    cwd,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/config.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/config.ts packages/synapse-daemon/src/__tests__/config.test.ts
git commit -m "feat(daemon): config resolution from env/file/argv"
```

---

### Task 3: Wake filter

Pure decision: does an SSE event warrant waking, and on which experiment.

**Files:**
- Create: `packages/synapse-daemon/src/sse-listener.ts` (vendored copy — see step 3a)
- Create: `packages/synapse-daemon/src/wake-filter.ts`
- Test: `packages/synapse-daemon/src/__tests__/wake-filter.test.ts`

**Interfaces:**
- Consumes: `SseNotificationEvent` from `./sse-listener`.
- Produces:
  ```ts
  export interface WakeDecision {
    wake: boolean;
    experimentUuid?: string;   // present iff wake
    researchProjectUuid?: string;
    title?: string;
    message?: string;
  }
  export function decideWake(event: SseNotificationEvent): WakeDecision;
  ```
  Wake when `event.type === "new_notification"` AND `event.action` (or `event.notificationType`) ∈ {`run_assigned`, `task_assigned`} AND `event.entityUuid` present. `experimentUuid = event.entityUuid`. Everything else (e.g. `comment_added`, `mentioned` — P2 ignores mention; P4 may add) → `{ wake: false }`.

- [ ] **Step 1: Vendor the SSE listener (no new logic)**

Copy `packages/openclaw-plugin/src/sse-listener.ts` verbatim to `packages/synapse-daemon/src/sse-listener.ts`. Add a one-line header comment: `// Vendored from packages/openclaw-plugin/src/sse-listener.ts (P2). Extract to a shared package later.` Do not change any logic.

- [ ] **Step 2: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/wake-filter.test.ts
import { describe, it, expect } from "vitest";
import { decideWake } from "../wake-filter";
import type { SseNotificationEvent } from "../sse-listener";

function ev(over: Partial<SseNotificationEvent>): SseNotificationEvent {
  return { type: "new_notification", ...over } as SseNotificationEvent;
}

describe("decideWake", () => {
  it("wakes on run_assigned with entityUuid", () => {
    const d = decideWake(ev({ action: "run_assigned", entityUuid: "exp-1", researchProjectUuid: "proj-1", entityTitle: "Run A", message: "go" }));
    expect(d.wake).toBe(true);
    expect(d.experimentUuid).toBe("exp-1");
    expect(d.researchProjectUuid).toBe("proj-1");
    expect(d.title).toBe("Run A");
  });

  it("wakes on task_assigned", () => {
    expect(decideWake(ev({ action: "task_assigned", entityUuid: "exp-2" })).wake).toBe(true);
  });

  it("does not wake on comment_added", () => {
    expect(decideWake(ev({ action: "comment_added", entityUuid: "exp-3" })).wake).toBe(false);
  });

  it("does not wake when entityUuid missing", () => {
    expect(decideWake(ev({ action: "run_assigned" })).wake).toBe(false);
  });

  it("uses notificationType when action absent", () => {
    expect(decideWake(ev({ notificationType: "run_assigned", entityUuid: "exp-4" })).wake).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/wake-filter.test.ts`
Expected: FAIL — `../wake-filter` not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/synapse-daemon/src/wake-filter.ts
import type { SseNotificationEvent } from "./sse-listener";

const WAKE_ACTIONS = new Set(["run_assigned", "task_assigned"]);

export interface WakeDecision {
  wake: boolean;
  experimentUuid?: string;
  researchProjectUuid?: string;
  title?: string;
  message?: string;
}

export function decideWake(event: SseNotificationEvent): WakeDecision {
  if (event.type !== "new_notification") return { wake: false };
  const action = event.action ?? event.notificationType;
  if (!action || !WAKE_ACTIONS.has(action)) return { wake: false };
  if (!event.entityUuid) return { wake: false };
  return {
    wake: true,
    experimentUuid: event.entityUuid,
    researchProjectUuid: event.researchProjectUuid,
    title: event.entityTitle,
    message: event.message,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/wake-filter.test.ts`
Expected: PASS (5).

- [ ] **Step 6: Commit**

```bash
git add packages/synapse-daemon/src/sse-listener.ts packages/synapse-daemon/src/wake-filter.ts packages/synapse-daemon/src/__tests__/wake-filter.test.ts
git commit -m "feat(daemon): vendor SSE listener + wake-filter decision"
```

---

### Task 4: Wake queue (per-key serialisation)

Serialise async work per string key so two turns for the same experiment never overlap.

**Files:**
- Create: `packages/synapse-daemon/src/wake-queue.ts`
- Test: `packages/synapse-daemon/src/__tests__/wake-queue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class WakeQueue {
    // Enqueue work under `key`. Tasks with the same key run strictly in FIFO order,
    // one at a time. Different keys run concurrently. Returns the task's result.
    enqueue<T>(key: string, task: () => Promise<T>): Promise<T>;
    // Number of keys with pending/running work (for observability/tests).
    activeKeyCount(): number;
  }
  ```
  A task that throws must not break the chain for its key (the next task still runs); the throwing task's promise rejects.

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/wake-queue.test.ts
import { describe, it, expect } from "vitest";
import { WakeQueue } from "../wake-queue";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("WakeQueue", () => {
  it("runs same-key tasks strictly in order", async () => {
    const q = new WakeQueue();
    const order: number[] = [];
    const mk = (n: number, ms: number) => () =>
      new Promise<void>((res) => setTimeout(() => { order.push(n); res(); }, ms));
    const p1 = q.enqueue("k", mk(1, 20));
    const p2 = q.enqueue("k", mk(2, 1));
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]); // 2 waited for 1 despite being faster
  });

  it("runs different keys concurrently", async () => {
    const q = new WakeQueue();
    let running = 0, maxConcurrent = 0;
    const mk = () => () => new Promise<void>((res) => {
      running++; maxConcurrent = Math.max(maxConcurrent, running);
      setTimeout(() => { running--; res(); }, 10);
    });
    await Promise.all([q.enqueue("a", mk()), q.enqueue("b", mk())]);
    expect(maxConcurrent).toBe(2);
  });

  it("a throwing task rejects but does not block the next same-key task", async () => {
    const q = new WakeQueue();
    const ran: string[] = [];
    const bad = q.enqueue("k", async () => { throw new Error("boom"); });
    const good = q.enqueue("k", async () => { ran.push("good"); return "ok"; });
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
    expect(ran).toEqual(["good"]);
  });

  it("activeKeyCount drops back to 0 when drained", async () => {
    const q = new WakeQueue();
    await q.enqueue("k", async () => {});
    await tick();
    expect(q.activeKeyCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/wake-queue.test.ts`
Expected: FAIL — `../wake-queue` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/synapse-daemon/src/wake-queue.ts
// Serialises async tasks per key: same key runs FIFO one-at-a-time; different
// keys run concurrently. A failing task rejects its own promise without
// breaking the chain for its key.
export class WakeQueue {
  private tails = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    // Chain after prev regardless of whether prev resolved or rejected.
    const run = prev.then(() => task(), () => task());
    // The tail tracks completion (settled either way) so the next task waits.
    const tail = run.then(() => undefined, () => undefined).then(() => {
      // If this run is still the tail, the key is drained — drop it.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    this.tails.set(key, tail);
    return run;
  }

  activeKeyCount(): number {
    return this.tails.size;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/wake-queue.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/wake-queue.ts packages/synapse-daemon/src/__tests__/wake-queue.test.ts
git commit -m "feat(daemon): per-key wake queue"
```

---

### Task 5: MCP config + claude argv builder

Write a `.mcp.json` for the spawn and build the exact `claude` argv. Pure/IO-light and fully testable.

**Files:**
- Create: `packages/synapse-daemon/src/mcp-config.ts`
- Test: `packages/synapse-daemon/src/__tests__/mcp-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function buildMcpConfigJson(synapseUrl: string, apiKey: string): string; // pretty JSON string
  export interface ClaudeArgvParams {
    prompt: string;
    sessionId: string;        // experimentUuid
    isResume: boolean;        // false = first turn (--session-id), true = (--resume)
    mcpConfigPath: string;
    yolo: boolean;
    model: string | null;
  }
  export function buildClaudeArgv(p: ClaudeArgvParams): string[];
  // writeMcpConfig writes the json under a daemon temp dir and returns the path.
  export function writeMcpConfig(args: {
    synapseUrl: string; apiKey: string; dir: string;
    writeFile: (path: string, contents: string) => void; // injectable
  }): string;
  ```
  `buildClaudeArgv` rules (order matters for readability, not correctness):
  - always: `["-p", prompt]`
  - session: first turn → `["--session-id", sessionId]`; resume → `["--resume", sessionId]`
  - always: `["--mcp-config", mcpConfigPath, "--strict-mcp-config"]`
  - always: `["--output-format", "json"]` (so we can capture `session_id`)
  - tools/permission: yolo → `["--dangerously-skip-permissions"]`; else → `["--allowedTools", "mcp__synapse", "--permission-mode", "dontAsk"]`
  - model: if non-null → `["--model", model]`

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/mcp-config.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildMcpConfigJson, buildClaudeArgv, writeMcpConfig } from "../mcp-config";

describe("buildMcpConfigJson", () => {
  it("produces a synapse http server config", () => {
    const json = JSON.parse(buildMcpConfigJson("https://s.example", "syn_abc"));
    expect(json.mcpServers.synapse.type).toBe("http");
    expect(json.mcpServers.synapse.url).toBe("https://s.example/api/mcp");
    expect(json.mcpServers.synapse.headers.Authorization).toBe("Bearer syn_abc");
  });
});

describe("buildClaudeArgv", () => {
  const baseArgs = { prompt: "do it", sessionId: "exp-1", mcpConfigPath: "/tmp/m.json", yolo: false, model: null };

  it("first turn uses --session-id and safe tool posture", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: false });
    expect(a).toContain("-p");
    expect(a[a.indexOf("-p") + 1]).toBe("do it");
    expect(a).toContain("--session-id");
    expect(a[a.indexOf("--session-id") + 1]).toBe("exp-1");
    expect(a).not.toContain("--resume");
    expect(a).toContain("--mcp-config");
    expect(a).toContain("--strict-mcp-config");
    expect(a.join(" ")).toContain("--output-format json");
    expect(a).toContain("--allowedTools");
    expect(a[a.indexOf("--allowedTools") + 1]).toBe("mcp__synapse");
    expect(a.join(" ")).toContain("--permission-mode dontAsk");
    expect(a).not.toContain("--dangerously-skip-permissions");
  });

  it("resume turn uses --resume not --session-id", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: true });
    expect(a).toContain("--resume");
    expect(a[a.indexOf("--resume") + 1]).toBe("exp-1");
    expect(a).not.toContain("--session-id");
  });

  it("yolo maps to --dangerously-skip-permissions and drops allowedTools", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: false, yolo: true });
    expect(a).toContain("--dangerously-skip-permissions");
    expect(a).not.toContain("--allowedTools");
  });

  it("model adds --model when set", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: false, model: "opus" });
    expect(a[a.indexOf("--model") + 1]).toBe("opus");
  });
});

describe("writeMcpConfig", () => {
  it("writes json to dir and returns path", () => {
    const writeFile = vi.fn();
    const path = writeMcpConfig({ synapseUrl: "https://s", apiKey: "syn_x", dir: "/tmp/d", writeFile });
    expect(path).toBe("/tmp/d/.mcp.json");
    expect(writeFile).toHaveBeenCalledWith("/tmp/d/.mcp.json", expect.stringContaining("api/mcp"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/mcp-config.test.ts`
Expected: FAIL — `../mcp-config` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/synapse-daemon/src/mcp-config.ts
export function buildMcpConfigJson(synapseUrl: string, apiKey: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        synapse: {
          type: "http",
          url: `${synapseUrl.replace(/\/$/, "")}/api/mcp`,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );
}

export interface ClaudeArgvParams {
  prompt: string;
  sessionId: string;
  isResume: boolean;
  mcpConfigPath: string;
  yolo: boolean;
  model: string | null;
}

export function buildClaudeArgv(p: ClaudeArgvParams): string[] {
  const argv: string[] = ["-p", p.prompt];
  if (p.isResume) {
    argv.push("--resume", p.sessionId);
  } else {
    argv.push("--session-id", p.sessionId);
  }
  argv.push("--mcp-config", p.mcpConfigPath, "--strict-mcp-config");
  argv.push("--output-format", "json");
  if (p.yolo) {
    argv.push("--dangerously-skip-permissions");
  } else {
    argv.push("--allowedTools", "mcp__synapse", "--permission-mode", "dontAsk");
  }
  if (p.model) argv.push("--model", p.model);
  return argv;
}

export function writeMcpConfig(args: {
  synapseUrl: string;
  apiKey: string;
  dir: string;
  writeFile: (path: string, contents: string) => void;
}): string {
  const path = `${args.dir.replace(/\/$/, "")}/.mcp.json`;
  args.writeFile(path, buildMcpConfigJson(args.synapseUrl, args.apiKey));
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/mcp-config.test.ts`
Expected: PASS (6).

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/mcp-config.ts packages/synapse-daemon/src/__tests__/mcp-config.test.ts
git commit -m "feat(daemon): mcp-config writer + claude argv builder"
```

---

### Task 6: Prompt builder

Build the per-turn prompt text from a wake decision. Pure.

**Files:**
- Create: `packages/synapse-daemon/src/prompt-builder.ts`
- Test: `packages/synapse-daemon/src/__tests__/prompt-builder.test.ts`

**Interfaces:**
- Consumes: `WakeDecision` from `./wake-filter`.
- Produces:
  ```ts
  export function buildTurnPrompt(d: {
    experimentUuid: string;
    researchProjectUuid?: string;
    title?: string;
    message?: string;
    isFirstTurn: boolean;
  }): string;
  ```
  First turn: instruct the agent to pick up experiment `<uuid>` ("<title>") in project `<projUuid>`, inspect context via Synapse MCP tools (`synapse_get_experiment`, `synapse_get_project_full_context`), and execute. Resume turn: a shorter "new instruction on experiment <uuid>: <message>" continuation. Always include the experiment UUID verbatim. Never fabricate compute or paths (let the agent use MCP tools).

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/prompt-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildTurnPrompt } from "../prompt-builder";

describe("buildTurnPrompt", () => {
  it("first turn references experiment uuid, title, project, and MCP tools", () => {
    const p = buildTurnPrompt({
      experimentUuid: "exp-1", researchProjectUuid: "proj-1",
      title: "Train A", message: "kick off", isFirstTurn: true,
    });
    expect(p).toContain("exp-1");
    expect(p).toContain("proj-1");
    expect(p).toContain("Train A");
    expect(p).toMatch(/synapse_get_experiment/);
  });

  it("resume turn is a continuation carrying the new message + uuid", () => {
    const p = buildTurnPrompt({ experimentUuid: "exp-2", message: "stop early", isFirstTurn: false });
    expect(p).toContain("exp-2");
    expect(p).toContain("stop early");
  });

  it("tolerates missing title/message/project", () => {
    const p = buildTurnPrompt({ experimentUuid: "exp-3", isFirstTurn: true });
    expect(p).toContain("exp-3");
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/prompt-builder.test.ts`
Expected: FAIL — `../prompt-builder` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/synapse-daemon/src/prompt-builder.ts
export function buildTurnPrompt(d: {
  experimentUuid: string;
  researchProjectUuid?: string;
  title?: string;
  message?: string;
  isFirstTurn: boolean;
}): string {
  if (d.isFirstTurn) {
    const titlePart = d.title ? ` ("${d.title}")` : "";
    const projPart = d.researchProjectUuid ? ` in research project ${d.researchProjectUuid}` : "";
    return [
      `You have been assigned Synapse experiment ${d.experimentUuid}${titlePart}${projPart}.`,
      `Use the Synapse MCP tools to inspect context before acting: call synapse_get_experiment for this experiment and synapse_get_project_full_context for the project.`,
      `Then plan and execute the experiment. Check compute availability with synapse_list_compute_nodes before any run; reserve GPUs inside the project's pool if one is set.`,
      `Report progress with synapse_report_experiment_progress and submit results with synapse_submit_experiment_results when done.`,
      d.message ? `Assignment note: ${d.message}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `New instruction on Synapse experiment ${d.experimentUuid}.`,
    d.message ? `Instruction: ${d.message}` : `Continue the work on this experiment.`,
    `Re-check current state with synapse_get_experiment before acting.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/prompt-builder.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/prompt-builder.ts packages/synapse-daemon/src/__tests__/prompt-builder.test.ts
git commit -m "feat(daemon): per-turn prompt builder"
```

---

### Task 7: Claude spawner

Spawn one `claude` turn and capture the session id from JSON output. Child process is injected for tests.

**Files:**
- Create: `packages/synapse-daemon/src/claude-spawner.ts`
- Test: `packages/synapse-daemon/src/__tests__/claude-spawner.test.ts`

**Interfaces:**
- Consumes (from Task 5): `buildClaudeArgv`, `ClaudeArgvParams`.
- Produces:
  ```ts
  export interface SpawnResult {
    ok: boolean;
    sessionId: string | null;  // parsed from --output-format json
    exitCode: number | null;
    stderr: string;
  }
  export interface SpawnDeps {
    // Injected runner: receives argv + options, resolves with { code, stdout, stderr }.
    run: (argv: string[], opts: { cwd: string; env: Record<string, string | undefined> }) =>
      Promise<{ code: number | null; stdout: string; stderr: string }>;
    logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
  }
  export async function spawnClaudeTurn(
    params: ClaudeArgvParams & { cwd: string; env: Record<string, string | undefined> },
    deps: SpawnDeps,
  ): Promise<SpawnResult>;
  ```
  Behaviour: build argv via `buildClaudeArgv`, call `deps.run("claude"-less argv? no — see note)`. NOTE: `deps.run` receives the argv array WITHOUT the leading `"claude"`; the production runner (Task 9) is responsible for invoking the `claude` binary with that argv. On a zero exit code, parse `stdout` as JSON and read `session_id`; set `ok: code === 0`. If JSON parse fails, `sessionId: null` but still `ok` per exit code. Never throw; capture errors into `stderr`/`ok:false`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/claude-spawner.test.ts
import { describe, it, expect, vi } from "vitest";
import { spawnClaudeTurn } from "../claude-spawner";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const base = {
  prompt: "do it", sessionId: "exp-1", isResume: false,
  mcpConfigPath: "/tmp/m.json", yolo: false, model: null,
  cwd: "/work", env: { PATH: "/usr/bin" },
};

describe("spawnClaudeTurn", () => {
  it("passes built argv to the runner and captures session_id from json", async () => {
    const run = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ session_id: "exp-1", result: "done" }),
      stderr: "",
    });
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBe("exp-1");
    const argv = run.mock.calls[0][0] as string[];
    expect(argv).toContain("--session-id");
    expect(argv).toContain("--mcp-config");
    expect(run.mock.calls[0][1]).toMatchObject({ cwd: "/work" });
  });

  it("ok:false on non-zero exit, stderr captured", async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "boom" });
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toBe("boom");
  });

  it("ok stays true but sessionId null when stdout is not json", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: "not json", stderr: "" });
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBeNull();
  });

  it("never throws if runner rejects", async () => {
    const run = vi.fn().mockRejectedValue(new Error("spawn failed"));
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain("spawn failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/claude-spawner.test.ts`
Expected: FAIL — `../claude-spawner` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/synapse-daemon/src/claude-spawner.ts
import { buildClaudeArgv, type ClaudeArgvParams } from "./mcp-config";

export interface SpawnResult {
  ok: boolean;
  sessionId: string | null;
  exitCode: number | null;
  stderr: string;
}

export interface SpawnDeps {
  run: (
    argv: string[],
    opts: { cwd: string; env: Record<string, string | undefined> },
  ) => Promise<{ code: number | null; stdout: string; stderr: string }>;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export async function spawnClaudeTurn(
  params: ClaudeArgvParams & { cwd: string; env: Record<string, string | undefined> },
  deps: SpawnDeps,
): Promise<SpawnResult> {
  const argv = buildClaudeArgv(params);
  try {
    const { code, stdout, stderr } = await deps.run(argv, { cwd: params.cwd, env: params.env });
    let sessionId: string | null = null;
    if (code === 0 && stdout) {
      try {
        const parsed = JSON.parse(stdout) as { session_id?: string };
        if (typeof parsed.session_id === "string") sessionId = parsed.session_id;
      } catch {
        deps.logger.warn("claude stdout was not valid JSON; session_id not captured");
      }
    }
    if (code !== 0) deps.logger.error(`claude turn exited ${code}: ${stderr}`);
    return { ok: code === 0, sessionId, exitCode: code, stderr };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.logger.error(`claude spawn failed: ${msg}`);
    return { ok: false, sessionId: null, exitCode: null, stderr: msg };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/claude-spawner.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/claude-spawner.ts packages/synapse-daemon/src/__tests__/claude-spawner.test.ts
git commit -m "feat(daemon): claude turn spawner with session-id capture"
```

---

### Task 8: Daemon orchestrator

Wire filter → per-experiment session state → queue → spawner. Tracks which experiments have an existing session (resume) vs are new (`--session-id`).

**Files:**
- Create: `packages/synapse-daemon/src/heartbeat-reporter.ts` (vendored copy — step 1)
- Create: `packages/synapse-daemon/src/daemon.ts`
- Test: `packages/synapse-daemon/src/__tests__/daemon.test.ts`

**Interfaces:**
- Consumes: `decideWake` (Task 3), `WakeQueue` (Task 4), `writeMcpConfig` (Task 5), `buildTurnPrompt` (Task 6), `spawnClaudeTurn`/`SpawnDeps` (Task 7), `SseNotificationEvent` (Task 3), `DaemonConfig` (Task 2).
- Produces:
  ```ts
  export interface DaemonDeps {
    config: DaemonConfig;
    queue: WakeQueue;
    mcpConfigPath: string;       // pre-written path
    spawn: SpawnDeps;            // passed through to spawnClaudeTurn
    logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
  }
  export class Daemon {
    constructor(deps: DaemonDeps);
    // Handle one SSE event: ignore non-wakes; otherwise enqueue a turn under
    // the experiment key. First wake for an experiment → first turn (--session-id);
    // later wakes → resume turn. Returns the enqueued promise (or null if ignored).
    handleEvent(event: SseNotificationEvent): Promise<unknown> | null;
    seenExperiment(uuid: string): boolean; // test introspection
  }
  ```
  First wake for an experiment uses `isResume: false` and `isFirstTurn: true`; record the experiment as seen only after the turn is enqueued (so a second event correctly resumes). A failed first turn still marks the experiment seen? — NO: if the first turn fails (ok:false and no session created), keep it un-seen so a retry starts fresh. Mark seen only on `ok && sessionId`.

- [ ] **Step 1: Vendor the heartbeat reporter**

Copy `packages/openclaw-plugin/src/heartbeat-reporter.ts` verbatim to `packages/synapse-daemon/src/heartbeat-reporter.ts`. Header comment: `// Vendored from packages/openclaw-plugin/src/heartbeat-reporter.ts (P2).` No logic changes. (It is wired in Task 9, but lives here.)

- [ ] **Step 2: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/daemon.test.ts
import { describe, it, expect, vi } from "vitest";
import { Daemon } from "../daemon";
import { WakeQueue } from "../wake-queue";
import type { SseNotificationEvent } from "../sse-listener";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const config = { synapseUrl: "https://s", apiKey: "syn_x", yolo: false, model: null, cwd: "/work" };

function ev(over: Partial<SseNotificationEvent>): SseNotificationEvent {
  return { type: "new_notification", ...over } as SseNotificationEvent;
}

function makeDaemon(run: ReturnType<typeof vi.fn>) {
  return new Daemon({
    config,
    queue: new WakeQueue(),
    mcpConfigPath: "/tmp/.mcp.json",
    spawn: { run, logger },
    logger,
  });
}

describe("Daemon.handleEvent", () => {
  it("ignores non-wake events", async () => {
    const run = vi.fn();
    const d = makeDaemon(run);
    expect(d.handleEvent(ev({ action: "comment_added", entityUuid: "x" }))).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("first wake spawns a --session-id turn", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ session_id: "exp-1" }), stderr: "" });
    const d = makeDaemon(run);
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1", researchProjectUuid: "p1", entityTitle: "T" }));
    const argv = run.mock.calls[0][0] as string[];
    expect(argv).toContain("--session-id");
    expect(argv).not.toContain("--resume");
    expect(d.seenExperiment("exp-1")).toBe(true);
  });

  it("second wake for same experiment resumes", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ session_id: "exp-1" }), stderr: "" });
    const d = makeDaemon(run);
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1" }));
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1", message: "more" }));
    const secondArgv = run.mock.calls[1][0] as string[];
    expect(secondArgv).toContain("--resume");
    expect(secondArgv).not.toContain("--session-id");
  });

  it("failed first turn leaves experiment un-seen for retry", async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "boom" });
    const d = makeDaemon(run);
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-9" }));
    expect(d.seenExperiment("exp-9")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/daemon.test.ts`
Expected: FAIL — `../daemon` not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/synapse-daemon/src/daemon.ts
import { decideWake } from "./wake-filter";
import { WakeQueue } from "./wake-queue";
import { buildTurnPrompt } from "./prompt-builder";
import { spawnClaudeTurn, type SpawnDeps } from "./claude-spawner";
import type { SseNotificationEvent } from "./sse-listener";
import type { DaemonConfig } from "./config";

export interface DaemonDeps {
  config: DaemonConfig;
  queue: WakeQueue;
  mcpConfigPath: string;
  spawn: SpawnDeps;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export class Daemon {
  private readonly deps: DaemonDeps;
  private readonly seen = new Set<string>();

  constructor(deps: DaemonDeps) {
    this.deps = deps;
  }

  seenExperiment(uuid: string): boolean {
    return this.seen.has(uuid);
  }

  handleEvent(event: SseNotificationEvent): Promise<unknown> | null {
    const decision = decideWake(event);
    if (!decision.wake || !decision.experimentUuid) return null;

    const experimentUuid = decision.experimentUuid;
    const isResume = this.seen.has(experimentUuid);

    return this.deps.queue.enqueue(experimentUuid, async () => {
      const prompt = buildTurnPrompt({
        experimentUuid,
        researchProjectUuid: decision.researchProjectUuid,
        title: decision.title,
        message: decision.message,
        isFirstTurn: !isResume,
      });
      this.deps.logger.info(`Spawning claude turn for experiment ${experimentUuid} (resume=${isResume})`);
      const result = await spawnClaudeTurn(
        {
          prompt,
          sessionId: experimentUuid,
          isResume,
          mcpConfigPath: this.deps.mcpConfigPath,
          yolo: this.deps.config.yolo,
          model: this.deps.config.model,
          cwd: this.deps.config.cwd,
          env: { ...process.env, SYNAPSE_URL: this.deps.config.synapseUrl, SYNAPSE_API_KEY: this.deps.config.apiKey },
        },
        this.deps.spawn,
      );
      // Mark seen only when a session actually exists, so a failed first turn retries fresh.
      if (result.ok && (result.sessionId || isResume)) {
        this.seen.add(experimentUuid);
      }
      return result;
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/daemon.test.ts`
Expected: PASS (4).

- [ ] **Step 6: Commit**

```bash
git add packages/synapse-daemon/src/heartbeat-reporter.ts packages/synapse-daemon/src/daemon.ts packages/synapse-daemon/src/__tests__/daemon.test.ts
git commit -m "feat(daemon): orchestrator with per-experiment session state"
```

---

### Task 9: Runtime entry + CLI subcommand wiring

Assemble the production runtime in `runDaemon` (real `fetch`/SSE/child_process), and dispatch `synapse daemon` from the CLI. This is the integration glue; keep its own logic thin and lean on the tested modules.

**Files:**
- Modify: `packages/synapse-daemon/src/index.ts`
- Modify: `packages/synapse-cli/bin/synapse.mjs`
- Modify: `packages/synapse-cli/package.json`
- Test: `packages/synapse-daemon/src/__tests__/index.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: real `runDaemon(argv)` that: resolves config (reading `~/.synapse/daemon.json` if present), writes the MCP config to a temp dir, constructs a real child-process runner, prints the safety posture, starts the `HeartbeatReporter` (`clientType: "claude_code"`), starts a `SynapseSseListener` whose `onEvent` calls `daemon.handleEvent`, and keeps the process alive. The production runner invokes the `claude` binary: `spawn("claude", argv, { cwd, env })`, collecting stdout/stderr, resolving `{ code, stdout, stderr }` on close.

- [ ] **Step 1: Write the failing test (entry seams only)**

`runDaemon` does real IO, so unit-test only the seams it can expose without network. Extract a pure `makeChildRunner()` and a `printPosture(config, logger)` and test those.

```ts
// packages/synapse-daemon/src/__tests__/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { printPosture } from "../index";

describe("printPosture", () => {
  it("announces safe default posture", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    printPosture({ synapseUrl: "https://s", apiKey: "syn_x", yolo: false, model: null, cwd: "/w" }, logger);
    const out = logger.info.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toContain("mcp__synapse");
    expect(out).not.toContain("syn_x"); // never leak the key
  });

  it("announces yolo posture when enabled", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    printPosture({ synapseUrl: "https://s", apiKey: "syn_x", yolo: true, model: null, cwd: "/w" }, logger);
    const out = logger.info.mock.calls.map((c) => c[0]).join("\n");
    expect(out).toMatch(/dangerously-skip-permissions|YOLO/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/index.test.ts`
Expected: FAIL — `printPosture` not exported.

- [ ] **Step 3: Implement the runtime entry**

```ts
// packages/synapse-daemon/src/index.ts
import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolveConfig, type DaemonConfig } from "./config";
import { writeMcpConfig } from "./mcp-config";
import { WakeQueue } from "./wake-queue";
import { Daemon } from "./daemon";
import { SynapseSseListener } from "./sse-listener";
import { HeartbeatReporter } from "./heartbeat-reporter";

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };

const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

export function printPosture(config: DaemonConfig, logger: Logger): void {
  logger.info(`Synapse daemon connecting to ${config.synapseUrl}`);
  if (config.yolo) {
    logger.info("Tool posture: YOLO — spawns use --dangerously-skip-permissions (full autonomy).");
  } else {
    logger.info('Tool posture: safe — spawns allow only "mcp__synapse" with --permission-mode dontAsk.');
  }
}

// Real child-process runner: invokes the `claude` binary with the given argv.
function makeChildRunner() {
  return (argv: string[], opts: { cwd: string; env: Record<string, string | undefined> }) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("claude", argv, { cwd: opts.cwd, env: opts.env as NodeJS.ProcessEnv });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => resolve({ code: null, stdout, stderr: stderr + String(err) }));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

export async function runDaemon(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`synapse daemon — wakes local Claude Code on experiment assignment

Usage: synapse daemon [options]
  --url <url>     Synapse server URL (or env SYNAPSE_URL)
  --key <key>     Agent API key syn_... (or env SYNAPSE_API_KEY; env preferred)
  --cwd <path>    Working directory for claude (default: current dir)
  --model <id>    Claude model (default: claude default)
  --yolo          Use --dangerously-skip-permissions (full autonomy)
`);
    return;
  }

  const configPath = join(homedir(), ".synapse", "daemon.json");
  const fileContents = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  const config = resolveConfig({ env: process.env, argv, fileContents, cwd: process.cwd() });

  printPosture(config, consoleLogger);

  const dir = mkdtempSync(join(tmpdir(), "synapse-daemon-"));
  const mcpConfigPath = writeMcpConfig({
    synapseUrl: config.synapseUrl,
    apiKey: config.apiKey,
    dir,
    writeFile: (p, c) => writeFileSync(p, c),
  });

  const queue = new WakeQueue();
  const daemon = new Daemon({
    config,
    queue,
    mcpConfigPath,
    spawn: { run: makeChildRunner(), logger: consoleLogger },
    logger: consoleLogger,
  });

  const heartbeat = new HeartbeatReporter({
    synapseUrl: config.synapseUrl,
    apiKey: config.apiKey,
    host: (await import("os")).hostname(),
    cwd: config.cwd,
    pid: process.pid,
    clientType: "claude_code",
    logger: { warn: (m) => consoleLogger.warn(m) },
  });
  heartbeat.start();

  const listener = new SynapseSseListener({
    synapseUrl: config.synapseUrl,
    apiKey: config.apiKey,
    onEvent: (event) => {
      const p = daemon.handleEvent(event);
      if (p) p.catch((err) => consoleLogger.error(`turn error: ${err}`));
    },
    onReconnect: async () => {
      consoleLogger.info("SSE reconnected");
    },
    logger: consoleLogger,
  });

  await listener.connect();
  consoleLogger.info("Synapse daemon running. Press Ctrl-C to stop.");

  const shutdown = () => {
    heartbeat.stop();
    listener.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive.
  await new Promise<void>(() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/index.test.ts` then `pnpm typecheck`
Expected: test PASS (2), typecheck clean.

- [ ] **Step 5: Wire the CLI subcommand**

In `packages/synapse-cli/bin/synapse.mjs`, immediately after `const args = process.argv.slice(2);` (line ~20) and BEFORE the option-parse loop, add:

```js
// --- Subcommand dispatch ---
if (args[0] === "daemon") {
  const { runDaemon } = await import("@synapse-research/synapse-daemon");
  await runDaemon(args.slice(1));
  process.exit(0);
}
```

(`bin/synapse.mjs` already uses top-level `await`/ESM imports.) Add a `daemon` line to the `--help` text in that file.

In `packages/synapse-cli/package.json`, add to `dependencies`:
```json
"@synapse-research/synapse-daemon": "workspace:*"
```
and confirm the daemon's built `dist` ships with the CLI tarball (the daemon is a normal dependency, so npm bundles it transitively at publish — verify with `npm pack --dry-run` in Step 7).

- [ ] **Step 6: Build both packages**

Run: from `packages/synapse-daemon` `pnpm build`; from repo root `pnpm install` (relink workspace).
Expected: daemon `dist/` produced; install clean.

- [ ] **Step 7: Verify CLI dispatch + packaging**

Run:
```bash
node packages/synapse-cli/bin/synapse.mjs daemon --help
cd packages/synapse-cli && npm pack --dry-run 2>&1 | grep -i daemon || echo "NOTE: daemon resolved as node_modules dep at install time"
```
Expected: the daemon help text prints. (The daemon is a runtime dependency installed from the registry on the user's machine, so it need not appear inside the CLI tarball — but it MUST be published before/with the CLI; see release note below.)

- [ ] **Step 8: Commit**

```bash
git add packages/synapse-daemon/src/index.ts packages/synapse-daemon/src/__tests__/index.test.ts \
        packages/synapse-cli/bin/synapse.mjs packages/synapse-cli/package.json pnpm-lock.yaml
git commit -m "feat(daemon): runtime entry + synapse daemon CLI subcommand"
```

---

### Task 10: Dynamic realtime for connected `claude_code` agents

Treat a `claude_code` agent as realtime when it has a live daemon connection in the P1 registry. Touches the five gate sites.

**Files:**
- Modify: `src/lib/connection-registry.ts` (add `hasLiveConnection`)
- Modify: `src/lib/agent-transport.ts` (add `isRealtimeForAgent`)
- Modify: `src/services/agent-connection.service.ts` (export `agentHasLiveConnection`)
- Modify (gate sites): `src/services/research-project.service.ts`, `src/services/paper-feed.service.ts`, `src/app/api/research-projects/[uuid]/synthesis/trigger/route.ts`, `src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts`, `src/app/api/research-projects/[uuid]/related-works/auto-search/route.ts`
- Test: `src/lib/__tests__/connection-registry.test.ts` (extend), `src/lib/__tests__/agent-transport.test.ts` (create or extend)

**Interfaces:**
- Consumes (Task-1/P1): `listConnections`, `livenessOf` from `connection-registry`.
- Produces:
  ```ts
  // connection-registry.ts
  export function hasLiveConnection(agentUuid: string, now: number): boolean;
  // agent-transport.ts
  export function isRealtimeForAgent(agentType: string, hasLiveConnection: boolean): boolean;
  // agent-connection.service.ts
  export function agentHasLiveConnection(agentUuid: string, now?: number): boolean;
  ```
  `isRealtimeForAgent` returns `true` if `isRealtimeAgent(agentType)` OR (`agentType === "claude_code"` AND `hasLiveConnection`). `hasLiveConnection(agentUuid, now)` returns true iff some registry record for that agent has `livenessOf === "online"`. Gate sites change from `if (!isRealtimeAgent(agent.type))` to `if (!isRealtimeForAgent(agent.type, agentHasLiveConnection(agent.uuid)))`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/connection-registry.test.ts`:
```ts
import { hasLiveConnection } from "@/lib/connection-registry";
// ... within describe, after the existing imports/setup:
it("hasLiveConnection true only when an online record exists", () => {
  _resetRegistryForTest();
  upsertConnection({ agentUuid: "agent-1", companyUuid: "c", host: "h", cwd: "/c", clientType: "claude_code", now: 1_000 });
  expect(hasLiveConnection("agent-1", 1_000)).toBe(true);
  expect(hasLiveConnection("agent-1", 1_000 + STALE_THRESHOLD_MS + 1)).toBe(false); // stale
  expect(hasLiveConnection("agent-2", 1_000)).toBe(false); // no record
});
```

Create `src/lib/__tests__/agent-transport.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isRealtimeForAgent } from "@/lib/agent-transport";

describe("isRealtimeForAgent", () => {
  it("openclaw is realtime regardless of connection", () => {
    expect(isRealtimeForAgent("openclaw", false)).toBe(true);
  });
  it("claude_code is realtime only with a live connection", () => {
    expect(isRealtimeForAgent("claude_code", false)).toBe(false);
    expect(isRealtimeForAgent("claude_code", true)).toBe(true);
  });
  it("codex stays poll even with a connection", () => {
    expect(isRealtimeForAgent("codex", true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/connection-registry.test.ts src/lib/__tests__/agent-transport.test.ts`
Expected: FAIL — `hasLiveConnection` / `isRealtimeForAgent` not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/connection-registry.ts`, add:
```ts
export function hasLiveConnection(agentUuid: string, now: number): boolean {
  return listConnections(now, { agentUuids: [agentUuid] }).some(
    (r) => livenessOf(r, now) === "online",
  );
}
```

In `src/lib/agent-transport.ts`, add (keep `AGENT_TRANSPORT_MAP` and `isRealtimeAgent` unchanged):
```ts
export function isRealtimeForAgent(agentType: string, hasLiveConnection: boolean): boolean {
  if (isRealtimeAgent(agentType)) return true;
  return agentType === "claude_code" && hasLiveConnection;
}
```

In `src/services/agent-connection.service.ts`, add:
```ts
import { hasLiveConnection } from "@/lib/connection-registry";
export function agentHasLiveConnection(agentUuid: string, now: number = Date.now()): boolean {
  return hasLiveConnection(agentUuid, now);
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `pnpm test src/lib/__tests__/connection-registry.test.ts src/lib/__tests__/agent-transport.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the five gate sites**

In each of the five files, change the realtime guard. Pattern (adapt the variable names — each site already has an `agent` with `.type` and `.uuid`):

```ts
// add imports
import { isRealtimeForAgent } from "@/lib/agent-transport";
import { agentHasLiveConnection } from "@/services/agent-connection.service";

// change the guard from:
//   if (!isRealtimeAgent(agent.type)) { ...reject... }
// to:
if (!isRealtimeForAgent(agent.type, agentHasLiveConnection(agent.uuid))) {
  // ...same rejection as before...
}
```

Read each file first to confirm the exact local variable (`agent`) and the existing rejection branch; keep the rejection message/behaviour identical. Files & lines: `src/services/research-project.service.ts:277`, `src/services/paper-feed.service.ts:75`, `src/app/api/research-projects/[uuid]/synthesis/trigger/route.ts:37`, `src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts:38`, `src/app/api/research-projects/[uuid]/related-works/auto-search/route.ts:38`. Leave the `isRealtimeAgent` import if still used elsewhere in the file; otherwise remove it to avoid an unused-import lint error.

- [ ] **Step 6: Run the affected server test suites**

Run: `pnpm test src/services/__tests__/research-project.service.test.ts src/services/__tests__/paper-feed.service.test.ts` (and any route tests for the three routes if they exist — discover with `ls src/app/api/research-projects/[uuid]/related-works/**/__tests__ 2>/dev/null`).
Expected: PASS. If an existing test asserted that a `claude_code` agent is rejected from these features, it will now need a live-connection stub — update such a test to pass `agentHasLiveConnection` semantics (mock the registry by calling `upsertConnection` for the agent, or mock `agentHasLiveConnection`). Note any updated test in the commit.

- [ ] **Step 7: Commit**

```bash
git add src/lib/connection-registry.ts src/lib/agent-transport.ts src/services/agent-connection.service.ts \
        src/lib/__tests__/connection-registry.test.ts src/lib/__tests__/agent-transport.test.ts \
        src/services/research-project.service.ts src/services/paper-feed.service.ts \
        "src/app/api/research-projects/[uuid]/synthesis/trigger/route.ts" \
        "src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts" \
        "src/app/api/research-projects/[uuid]/related-works/auto-search/route.ts"
git commit -m "feat(transport): treat connected claude_code agents as realtime"
```

---

### Task 11: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Daemon package suite + typecheck**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__` and `pnpm typecheck`
Expected: all daemon tests pass; typecheck clean.

- [ ] **Step 2: Server test suite (changed files)**

Run: `pnpm test src/lib src/services/__tests__/agent-connection.service.test.ts src/services/__tests__/research-project.service.test.ts src/services/__tests__/paper-feed.service.test.ts`
Expected: pass. (The pre-existing `uuid-resolver.test.ts` failures and zod-in-node_modules noise from P1 remain unrelated — do not treat as regressions; confirm they are the SAME failures as on the branch base.)

- [ ] **Step 3: Lint changed files**

Run: `git diff --name-only <P2-base>..HEAD | grep -E '\.(ts|tsx)$' | tr '\n' ' ' | xargs pnpm exec eslint`
Expected: 0 errors in changed files (test files may show "ignored" warnings).

- [ ] **Step 4: Manual smoke (optional — requires a real Synapse server + a claude_code agent key + `claude` on PATH)**

```bash
export SYNAPSE_URL=http://localhost:13000
export SYNAPSE_API_KEY=syn_...   # a claude_code agent key
node packages/synapse-cli/bin/synapse.mjs daemon --cwd /tmp/daemon-work
# In the Synapse UI, assign an experiment to that agent.
# Expected: daemon logs "Spawning claude turn for experiment <uuid> (resume=false)",
# and the agent's connection shows online in GET /api/agent-connections.
```

- [ ] **Step 5: Commit any fixups**

```bash
git add -A && git commit -m "chore(daemon): lint + test cleanup for P2"
```

---

## Self-Review

**Spec coverage (against the macro plan's P2):**
- ✅ `synapse daemon` subcommand reusing SSE logic → Tasks 3 (vendor), 9 (CLI dispatch).
- ✅ On assign/mention event spawn headless `claude` with experiment context → Tasks 6, 7, 8 (P2 wakes on assignment; mention deferred to P4, documented in wake-filter).
- ✅ wake-queue serialises → Task 4, used in Task 8.
- ✅ Default `--allowedTools "mcp__synapse"`, `--yolo`→skip-permissions, prints posture → Tasks 5, 9.
- ✅ Headless interaction guard (no hang) → `--permission-mode dontAsk` in Task 5; P2 requirement is "must not hang", full routing is P4.
- ✅ Reports to P1 registry → vendored `HeartbeatReporter` with `clientType: "claude_code"`, started in Task 9.
- ✅ Makes `claude_code` realtime-capable → Task 10 (dynamic, connection-aware; static map unchanged).
- ✅ One persistent conversation per experiment, per-turn `--session-id`/`--resume` spawn → Tasks 5, 8 (decision locked with user).
- ✅ One-step user install → Task 9 (workspace dependency + subcommand dispatch).

**Placeholder scan:** No TODO/TBD/"handle edge cases"/"similar to Task N". Every code step shows full code. The five gate-site edits (Task 10 Step 5) are described as a precise pattern rather than five verbatim diffs because each site's surrounding rejection branch differs — the implementer is told to read each file and preserve the exact existing rejection; this is a deliberate integration instruction, not a placeholder.

**Type consistency:** `DaemonConfig` (Task 2) flows unchanged into Tasks 5/8/9. `SseNotificationEvent` (Task 3 vendor) is consumed by Tasks 3/8/9. `WakeDecision` (Task 3) → Task 8. `ClaudeArgvParams` (Task 5) → Task 7 `spawnClaudeTurn` → Task 8. `SpawnDeps.run` signature (argv-without-"claude") is identical in Task 7 (consumer) and Task 9 (`makeChildRunner` producer). `HeartbeatReporter` options match the P1 reporter (vendored verbatim). `isRealtimeForAgent`/`hasLiveConnection`/`agentHasLiveConnection` signatures (Task 10) are consistent across helper, registry, service, and the five call sites.

**Known assumptions flagged inline (not blockers):**
- `--allowedTools "mcp__synapse"` (whole-server allow) is the documented form; the `mcp__synapse__*` glob was unverifiable, so the plan uses the server-name form.
- `packages/openclaw-plugin/tsconfig.json` is the template for the daemon's tsconfig — read it; the inline fallback is only if it can't be read.
- `pnpm-workspace.yaml` likely already globs `packages/*` — verify before editing.
- Each gate site's `agent` variable name and rejection branch — read before editing.

**Release note (carry to PR/release, per CLAUDE.md):** P2 adds a new published package `@synapse-research/synapse-daemon` AND makes `@synapse-research/synapse` depend on it. At release time the daemon must be published **before/with** the CLI, and the CLI version bumped. The OpenClaw plugin is untouched (SSE listener was vendored, not extracted), so it does not need republishing for P2.

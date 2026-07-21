# P4 + P5 — Reverse Control, In-Experiment Instruction Injection & Human Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a human, from the experiment detail panel, (a) inject a free-text instruction that wakes the assigned daemon agent to resume that experiment's Claude Code session, (b) interrupt a running turn, and (c) copy the session id + see the origin (host/cwd) so they can `claude --resume <experimentUuid>` and take over manually.

**Architecture:** Reuse the P2 notification→SSE→daemon wake chain — NO new realtime channel. Instruction and interrupt are two new notification `action` strings (`experiment_instruction`, `experiment_interrupt`) created directly via `notificationService.create()` (the pattern `comment.service.ts` already uses), targeted at the experiment's assignee agent. The daemon's wake-filter classifies each event as `resume` or `interrupt`; resume reuses the existing P2 `--resume` path, interrupt kills the in-flight child for that experiment (the P2 `inflight` set is upgraded to a `Map<experimentUuid, ChildProcess>`). Instruction injection also writes a `comment` on the experiment for audit (per CLAUDE.md "prefer comments on targetType experiment"). P5 is mostly already shipped (P2 anchors `--session-id = experimentUuid`; the heartbeat records host/cwd); P5 here is the frontend surfacing.

**Tech Stack:** TypeScript 5; Next.js 15 route handlers (user-auth); existing `notificationService.create`, `commentService.createComment`, `experiment.service` assignee fields; the P2 daemon package (wake-filter, daemon orchestrator, index runtime); React 19 client components in the experiments board + the P3 `ExecutionRow`; next-intl; Vitest.

## Global Constraints

- **No new SSE/control channel.** Instruction + interrupt ride the existing notification stream the daemon already listens to (`/api/events/notifications`, channel `notification:agent:<uuid>`). (verified P2/P1)
- **Two new notification actions:** `experiment_instruction` (wake→resume) and `experiment_interrupt` (wake→kill). Created directly via `notificationService.create({ ..., recipientType: "agent", recipientUuid: <assigneeUuid>, action, message, entityType: "experiment", entityUuid: <experimentUuid> })` — NOT through the activity→listener pipeline. Mirror `comment.service.ts`'s direct-create usage. (verified)
- The SSE event payload the daemon receives carries `action`, `entityUuid`, `entityTitle`, `message`, `researchProjectUuid` (verified `buildRealtimeNotificationEvent`). The daemon keys everything on `entityUuid` = experimentUuid.
- **Recipient = the experiment's current assignee agent.** Only inject/interrupt when `experiment.assigneeType === "agent"` and `assigneeUuid` is set; otherwise the endpoint returns a 409/400 (no agent to wake). Owner/company scoping via the existing experiment lookup (`getExperiment(companyUuid, uuid)`).
- **Instruction injection** also creates a `comment` (targetType `experiment`, the instruction text) BEFORE the notification, for an audit trail. Reuse `commentService.createComment`. (CLAUDE.md)
- **Interrupt kills only the current in-flight turn** for that experiment; if none is running it is a no-op that logs. It does NOT clear the `seen` set (so a later instruction still resumes). It does NOT spawn anything.
- **Offline daemon:** the notification is still persisted (normal `create`). The daemon does NOT replay missed instruction/interrupt notifications on reconnect (P2's reconnect back-fill is OpenClaw-only; the synapse-daemon has no back-fill). Document this; do not add replay (avoids re-running stale instructions). 
- API routes are **user-only** (mirror `PATCH /api/experiments/[uuid]` auth: `getAuthContext` + `isUser`). Body validated; 404 on missing experiment (company-scoped); 409 when no agent assignee.
- daemon source files import siblings WITH `.js` (NodeNext); test files omit it. Pure seams live in `.ts`/`.helpers.ts` (repo `jsx:"preserve"` constraint) — applies to any new frontend pure logic.
- All new user-facing text uses i18n keys in BOTH `messages/en.json` and `messages/zh.json` (extend the existing `experiments`/`presence` sections or add keys; pick the section that fits and keep en/zh parity).
- Tests: Vitest. Service/route tests use the hoisted-mock prisma pattern. Daemon pure logic (wake-filter classification, child-registry) is unit-tested; frontend pure seams extracted + tested; React rendering not unit-tested (no jsdom — established P3 fact).
- Experiment deep-link / panel: the detail panel is the `Sheet` in `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`, opened via `?selected=<experimentUuid>`. `selectedExperiment` is in scope inside `{selectedExperiment && (...)}`.

---

## File Structure

**Server:**
- `src/services/experiment-control.service.ts` — **new.** `injectInstruction(...)` (comment + notification) and `requestInterrupt(...)` (notification). Both resolve the assignee agent and enforce "agent assignee required".
- `src/services/__tests__/experiment-control.service.test.ts` — **new.**
- `src/app/api/experiments/[uuid]/instruction/route.ts` — **new.** `POST`, user-only.
- `src/app/api/experiments/[uuid]/interrupt/route.ts` — **new.** `POST`, user-only.
- `src/app/api/experiments/[uuid]/instruction/__tests__/route.test.ts`, `.../interrupt/__tests__/route.test.ts` — **new.**

**Daemon:**
- `packages/synapse-daemon/src/wake-filter.ts` — **modify.** Add `experiment_instruction` (→ resume) + `experiment_interrupt` (→ interrupt) and a `kind` discriminator on `WakeDecision`.
- `packages/synapse-daemon/src/child-registry.ts` — **new.** `Map<experimentUuid, ChildProcess>` with `register/unregister/kill(experimentUuid)`.
- `packages/synapse-daemon/src/daemon.ts` — **modify.** Route `kind: "interrupt"` to the registry kill; resume path unchanged.
- `packages/synapse-daemon/src/index.ts` — **modify.** `inflight: Set` → child registry keyed by experimentUuid; thread the key through the runner.
- daemon test files — **modify/new** for wake-filter + child-registry.

**Frontend:**
- `src/components/presence/execution-row.tsx` — **modify.** Add optional `onInterrupt` + an Interrupt button (both variants).
- `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx` — **modify.** Add to the detail panel: live status/message line, an instruction input box (posts to `/instruction`), an Interrupt button (posts to `/interrupt`), and a "Copy session ID" control showing `experimentUuid`.
- `src/lib/experiment-control-actions.ts` — **new (optional helper).** Pure builders for the two fetch calls (testable seam) if useful.
- `messages/en.json`, `messages/zh.json` — **modify.**

---

### Task 1: Experiment-control service (instruction + interrupt)

Server logic: resolve assignee agent, create comment (instruction only), create notification.

**Files:**
- Create: `src/services/experiment-control.service.ts`
- Test: `src/services/__tests__/experiment-control.service.test.ts`

**Interfaces:**
- Consumes (verify exact signatures by reading the files): `getExperiment(companyUuid, uuid)` from `@/services/experiment.service` (returns experiment with `assigneeType`, `assigneeUuid`, `researchProjectUuid`, `title`, company scoping); `notificationService.create(params)` from `@/services/notification.service`; `commentService.createComment(params)` from `@/services/comment.service`.
- Produces:
  ```ts
  export class NoAgentAssigneeError extends Error {}      // thrown when no agent assignee
  export class ExperimentNotFoundError extends Error {}   // thrown when experiment missing/!company
  export interface InjectInstructionParams {
    companyUuid: string; experimentUuid: string; message: string;
    actorUuid: string; actorName: string;
  }
  export async function injectInstruction(p: InjectInstructionParams): Promise<{ notificationUuid?: string }>;
  export interface RequestInterruptParams {
    companyUuid: string; experimentUuid: string; actorUuid: string; actorName: string;
  }
  export async function requestInterrupt(p: RequestInterruptParams): Promise<{ notificationUuid?: string }>;
  ```
  Both: load experiment via `getExperiment`; throw `ExperimentNotFoundError` if null; throw `NoAgentAssigneeError` if `assigneeType !== "agent" || !assigneeUuid`. `injectInstruction`: first `createComment({ companyUuid, targetType: "experiment", targetUuid: experimentUuid, body/content: message, authorType: "user", authorUuid: actorUuid, ... })` (match the real `CommentCreateParams`), then `notificationService.create({ action: "experiment_instruction", message, recipientType: "agent", recipientUuid: assigneeUuid, entityType: "experiment", entityUuid: experimentUuid, entityTitle: title, researchProjectUuid, actorType: "user", actorUuid, actorName, companyUuid, projectName })`. `requestInterrupt`: just the notification with `action: "experiment_interrupt"`, `message: "Interrupt requested"`. Return the created notification's uuid if available.

  NOTE: read `notification.service.ts` `create` for the EXACT required params (projectName, entityTitle may be required) and `comment.service.ts` `createComment` for its exact param names (`content` vs `body`, `authorType` vs `creatorType`). Match them; the test asserts the calls carry `action`, `recipientUuid`, `entityUuid`.

- [ ] **Step 1: Write the failing test**

```ts
// src/services/__tests__/experiment-control.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetExperiment = vi.hoisted(() => vi.fn());
vi.mock("@/services/experiment.service", () => ({ getExperiment: mockGetExperiment }));
const mockNotify = vi.hoisted(() => vi.fn());
vi.mock("@/services/notification.service", () => ({ create: mockNotify }));
const mockCreateComment = vi.hoisted(() => vi.fn());
vi.mock("@/services/comment.service", () => ({ createComment: mockCreateComment }));

import {
  injectInstruction, requestInterrupt,
  NoAgentAssigneeError, ExperimentNotFoundError,
} from "@/services/experiment-control.service";

const base = { companyUuid: "c", experimentUuid: "exp-1", actorUuid: "u", actorName: "Dr. U" };
const agentExp = {
  uuid: "exp-1", title: "Run A", researchProjectUuid: "p1",
  assigneeType: "agent", assigneeUuid: "agent-1", companyUuid: "c",
};

beforeEach(() => { vi.clearAllMocks(); mockNotify.mockResolvedValue({ uuid: "notif-1" }); mockCreateComment.mockResolvedValue({ uuid: "cmt-1" }); });

describe("injectInstruction", () => {
  it("throws when experiment missing", async () => {
    mockGetExperiment.mockResolvedValue(null);
    await expect(injectInstruction({ ...base, message: "go" })).rejects.toBeInstanceOf(ExperimentNotFoundError);
  });
  it("throws when no agent assignee", async () => {
    mockGetExperiment.mockResolvedValue({ ...agentExp, assigneeType: "user", assigneeUuid: "u2" });
    await expect(injectInstruction({ ...base, message: "go" })).rejects.toBeInstanceOf(NoAgentAssigneeError);
  });
  it("creates a comment then an experiment_instruction notification to the agent", async () => {
    mockGetExperiment.mockResolvedValue(agentExp);
    await injectInstruction({ ...base, message: "continue step 3" });
    expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({
      companyUuid: "c", targetType: "experiment", targetUuid: "exp-1",
    }));
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      action: "experiment_instruction", recipientType: "agent", recipientUuid: "agent-1",
      entityType: "experiment", entityUuid: "exp-1", message: "continue step 3",
    }));
    // comment created before notification
    expect(mockCreateComment.mock.invocationCallOrder[0]).toBeLessThan(mockNotify.mock.invocationCallOrder[0]);
  });
});

describe("requestInterrupt", () => {
  it("creates an experiment_interrupt notification, no comment", async () => {
    mockGetExperiment.mockResolvedValue(agentExp);
    await requestInterrupt({ ...base });
    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      action: "experiment_interrupt", recipientType: "agent", recipientUuid: "agent-1", entityUuid: "exp-1",
    }));
  });
  it("throws NoAgentAssigneeError when no agent", async () => {
    mockGetExperiment.mockResolvedValue({ ...agentExp, assigneeType: null, assigneeUuid: null });
    await expect(requestInterrupt({ ...base })).rejects.toBeInstanceOf(NoAgentAssigneeError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/services/__tests__/experiment-control.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Read `src/services/notification.service.ts` `create` params and `src/services/comment.service.ts` `createComment` params first; match field names exactly. Then:

```ts
// src/services/experiment-control.service.ts
import { getExperiment } from "@/services/experiment.service";
import * as notificationService from "@/services/notification.service";
import * as commentService from "@/services/comment.service";

export class NoAgentAssigneeError extends Error {
  constructor() { super("Experiment has no agent assignee"); this.name = "NoAgentAssigneeError"; }
}
export class ExperimentNotFoundError extends Error {
  constructor() { super("Experiment not found"); this.name = "ExperimentNotFoundError"; }
}

export interface InjectInstructionParams {
  companyUuid: string; experimentUuid: string; message: string;
  actorUuid: string; actorName: string;
}

async function loadAgentExperiment(companyUuid: string, experimentUuid: string) {
  const exp = await getExperiment(companyUuid, experimentUuid);
  if (!exp) throw new ExperimentNotFoundError();
  if (exp.assigneeType !== "agent" || !exp.assigneeUuid) throw new NoAgentAssigneeError();
  return exp;
}

export async function injectInstruction(p: InjectInstructionParams): Promise<{ notificationUuid?: string }> {
  const exp = await loadAgentExperiment(p.companyUuid, p.experimentUuid);
  await commentService.createComment({
    companyUuid: p.companyUuid,
    targetType: "experiment",
    targetUuid: p.experimentUuid,
    // match the real CommentCreateParams field names:
    content: p.message,
    authorType: "user",
    authorUuid: p.actorUuid,
  } as Parameters<typeof commentService.createComment>[0]);
  const notif = await notificationService.create({
    companyUuid: p.companyUuid,
    researchProjectUuid: exp.researchProjectUuid,
    recipientType: "agent",
    recipientUuid: exp.assigneeUuid!,
    entityType: "experiment",
    entityUuid: p.experimentUuid,
    entityTitle: exp.title,
    projectName: exp.researchProjectUuid, // replace with real project name if create() requires it
    action: "experiment_instruction",
    message: p.message,
    actorType: "user",
    actorUuid: p.actorUuid,
    actorName: p.actorName,
  } as Parameters<typeof notificationService.create>[0]);
  return { notificationUuid: (notif as { uuid?: string })?.uuid };
}

export interface RequestInterruptParams {
  companyUuid: string; experimentUuid: string; actorUuid: string; actorName: string;
}

export async function requestInterrupt(p: RequestInterruptParams): Promise<{ notificationUuid?: string }> {
  const exp = await loadAgentExperiment(p.companyUuid, p.experimentUuid);
  const notif = await notificationService.create({
    companyUuid: p.companyUuid,
    researchProjectUuid: exp.researchProjectUuid,
    recipientType: "agent",
    recipientUuid: exp.assigneeUuid!,
    entityType: "experiment",
    entityUuid: p.experimentUuid,
    entityTitle: exp.title,
    projectName: exp.researchProjectUuid,
    action: "experiment_interrupt",
    message: "Interrupt requested",
    actorType: "user",
    actorUuid: p.actorUuid,
    actorName: p.actorName,
  } as Parameters<typeof notificationService.create>[0]);
  return { notificationUuid: (notif as { uuid?: string })?.uuid };
}
```
> The `as Parameters<...>[0]` casts are a safety net so the test passes even if optional fields differ; during implementation, REMOVE the casts and pass the exact real param shapes (read both service signatures). If `create()` requires a real `projectName`, fetch it from the experiment's project (the experiment object likely carries `projectName` or `researchProject.name` — use it; do not leave the uuid as the name).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/services/__tests__/experiment-control.service.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/services/experiment-control.service.ts src/services/__tests__/experiment-control.service.test.ts
git commit -m "feat(control): experiment instruction + interrupt service"
```

---

### Task 2: Instruction + interrupt API routes

User-only POST endpoints.

**Files:**
- Create: `src/app/api/experiments/[uuid]/instruction/route.ts`
- Create: `src/app/api/experiments/[uuid]/interrupt/route.ts`
- Test: `src/app/api/experiments/[uuid]/instruction/__tests__/route.test.ts`
- Test: `src/app/api/experiments/[uuid]/interrupt/__tests__/route.test.ts`

**Interfaces:**
- Consumes (Task 1): `injectInstruction`, `requestInterrupt`, `NoAgentAssigneeError`, `ExperimentNotFoundError`.
- Consumes (existing): `withErrorHandler`, `parseBody`, `success`, `errors`, `getAuthContext`, `isUser`.
- Produces: `POST /api/experiments/[uuid]/instruction` body `{ message: string }` → 200 `{ notificationUuid? }`; `POST /api/experiments/[uuid]/interrupt` → 200. Auth: 401 unauth, 403 non-user, 400 empty message (instruction), 404 experiment-not-found, 409 no-agent-assignee. The `[uuid]` route param is the experimentUuid.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/experiments/[uuid]/instruction/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (o) => ({ ...(await (o as any)()), getAuthContext: mockAuth }));
const mockInject = vi.hoisted(() => vi.fn());
const NoAgent = vi.hoisted(() => class NoAgentAssigneeError extends Error {});
const NotFound = vi.hoisted(() => class ExperimentNotFoundError extends Error {});
vi.mock("@/services/experiment-control.service", () => ({
  injectInstruction: mockInject, NoAgentAssigneeError: NoAgent, ExperimentNotFoundError: NotFound,
}));
import { POST } from "@/app/api/experiments/[uuid]/instruction/route";

function req(body: unknown) {
  return new Request("http://localhost/api/experiments/exp-1/instruction", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer x" },
    body: JSON.stringify(body),
  }) as any;
}
const ctx = { params: Promise.resolve({ uuid: "exp-1" }) } as any;
beforeEach(() => vi.clearAllMocks());

describe("POST instruction", () => {
  it("401 unauth", async () => { mockAuth.mockResolvedValue(null); expect((await POST(req({ message: "g" }), ctx)).status).toBe(401); });
  it("403 non-user", async () => { mockAuth.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" }); expect((await POST(req({ message: "g" }), ctx)).status).toBe(403); });
  it("400 empty message", async () => { mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" }); expect((await POST(req({ message: "" }), ctx)).status).toBe(400); });
  it("409 no agent assignee", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInject.mockRejectedValue(new NoAgent());
    expect((await POST(req({ message: "g" }), ctx)).status).toBe(409);
  });
  it("404 experiment not found", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInject.mockRejectedValue(new NotFound());
    expect((await POST(req({ message: "g" }), ctx)).status).toBe(404);
  });
  it("200 success calls injectInstruction with company+experiment+message", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInject.mockResolvedValue({ notificationUuid: "n1" });
    const res = await POST(req({ message: "do it" }), ctx);
    expect(res.status).toBe(200);
    expect(mockInject).toHaveBeenCalledWith(expect.objectContaining({ companyUuid: "c", experimentUuid: "exp-1", message: "do it", actorUuid: "u" }));
  });
});
```
(Write the analogous interrupt test: no message body; 200 calls `requestInterrupt`; 409/404/403/401 paths.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/app/api/experiments/[uuid]/instruction src/app/api/experiments/[uuid]/interrupt`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement both routes**

Read `src/app/api/experiments/[uuid]/route.ts` for the exact param-context signature (Next 15 async `params`) and `errors.*` helpers (`conflict`? if no `errors.conflict`, build a 409 — check `api-response.ts`; there is likely a generic; if not, use the lowest-level error builder for 409).

```ts
// src/app/api/experiments/[uuid]/instruction/route.ts
import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { injectInstruction, NoAgentAssigneeError, ExperimentNotFoundError } from "@/services/experiment-control.service";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest, ctx: { params: Promise<{ uuid: string }> }) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can send instructions");
  const { uuid } = await ctx.params;
  const body = await parseBody<{ message?: string }>(request);
  if (!body.message || body.message.trim() === "") return errors.badRequest("message is required");
  try {
    const result = await injectInstruction({
      companyUuid: auth.companyUuid, experimentUuid: uuid,
      message: body.message.trim(), actorUuid: auth.actorUuid, actorName: auth.name ?? "",
    });
    return success(result);
  } catch (e) {
    if (e instanceof ExperimentNotFoundError) return errors.notFound("Experiment not found");
    if (e instanceof NoAgentAssigneeError) return errors.conflict?.("Experiment has no agent assignee") ?? errors.badRequest("Experiment has no agent assignee");
    throw e;
  }
});
```
(interrupt route: same shape, no message parse, calls `requestInterrupt`.)
> Verify `auth.name` exists on `UserAuthContext` (it may be `auth.userName` or absent — read `@/types/auth`); use the correct field or `""`. Verify `errors.notFound`/`errors.conflict` exist in `api-response.ts`; if `conflict` is absent, map 409 via the generic error builder used elsewhere (read the file) — the test asserts status 409, so produce a 409.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/app/api/experiments/[uuid]/instruction src/app/api/experiments/[uuid]/interrupt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/experiments/[uuid]/instruction" "src/app/api/experiments/[uuid]/interrupt"
git commit -m "feat(control): instruction + interrupt API routes"
```

---

### Task 3: Daemon wake-filter — classify resume vs interrupt

Extend the wake decision to carry a `kind`.

**Files:**
- Modify: `packages/synapse-daemon/src/wake-filter.ts`
- Test: `packages/synapse-daemon/src/__tests__/wake-filter.test.ts`

**Interfaces:**
- Produces (extends existing `WakeDecision`):
  ```ts
  export interface WakeDecision {
    wake: boolean;
    kind?: "resume" | "interrupt";   // present iff wake
    experimentUuid?: string;
    researchProjectUuid?: string;
    title?: string;
    message?: string;
  }
  ```
  Wake actions now: `run_assigned`, `task_assigned`, `experiment_instruction` → `kind: "resume"`; `experiment_interrupt` → `kind: "interrupt"`. Non-wake unchanged.

- [ ] **Step 1: Extend the test**

Add to `packages/synapse-daemon/src/__tests__/wake-filter.test.ts`:
```ts
it("classifies experiment_instruction as a resume wake", () => {
  const d = decideWake(ev({ action: "experiment_instruction", entityUuid: "exp-1", message: "go" }));
  expect(d.wake).toBe(true);
  expect(d.kind).toBe("resume");
  expect(d.experimentUuid).toBe("exp-1");
});
it("classifies experiment_interrupt as an interrupt wake", () => {
  const d = decideWake(ev({ action: "experiment_interrupt", entityUuid: "exp-1" }));
  expect(d.wake).toBe(true);
  expect(d.kind).toBe("interrupt");
});
it("run_assigned stays a resume wake", () => {
  expect(decideWake(ev({ action: "run_assigned", entityUuid: "exp-1" })).kind).toBe("resume");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/wake-filter.test.ts`
Expected: FAIL — `kind` undefined.

- [ ] **Step 3: Implement**

```ts
// packages/synapse-daemon/src/wake-filter.ts (modified)
import type { SseNotificationEvent } from "./sse-listener.js";

const RESUME_ACTIONS = new Set(["run_assigned", "task_assigned", "experiment_instruction"]);
const INTERRUPT_ACTIONS = new Set(["experiment_interrupt"]);

export interface WakeDecision {
  wake: boolean;
  kind?: "resume" | "interrupt";
  experimentUuid?: string;
  researchProjectUuid?: string;
  title?: string;
  message?: string;
}

export function decideWake(event: SseNotificationEvent): WakeDecision {
  if (event.type !== "new_notification") return { wake: false };
  const action = event.action ?? event.notificationType;
  if (!action || !event.entityUuid) return { wake: false };
  const kind: "resume" | "interrupt" | null =
    RESUME_ACTIONS.has(action) ? "resume" : INTERRUPT_ACTIONS.has(action) ? "interrupt" : null;
  if (!kind) return { wake: false };
  return {
    wake: true,
    kind,
    experimentUuid: event.entityUuid,
    researchProjectUuid: event.researchProjectUuid,
    title: event.entityTitle,
    message: event.message,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/wake-filter.test.ts` then `pnpm build`
Expected: tests PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/wake-filter.ts packages/synapse-daemon/src/__tests__/wake-filter.test.ts
git commit -m "feat(daemon): classify wake events as resume vs interrupt"
```

---

### Task 4: Daemon child registry (experimentUuid → child)

Replace the flat in-flight Set with a keyed registry so a turn can be interrupted by experiment.

**Files:**
- Create: `packages/synapse-daemon/src/child-registry.ts`
- Test: `packages/synapse-daemon/src/__tests__/child-registry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // Minimal child shape we depend on (kill); real ChildProcess satisfies it.
  export interface Killable { kill(signal?: string): boolean; }
  export class ChildRegistry {
    register(experimentUuid: string, child: Killable): void;
    unregister(experimentUuid: string, child: Killable): void;  // only deletes if same child
    interrupt(experimentUuid: string): boolean;  // SIGTERM the current child for that experiment; true if one was killed
    killAll(): void;                              // shutdown
    size(): number;
  }
  ```
  One in-flight child per experiment at a time (turns are serialized by the WakeQueue), so the map holds at most one child per key. `unregister` is identity-guarded (don't delete a newer child registered after this one settled).

- [ ] **Step 1: Write the failing test**

```ts
// packages/synapse-daemon/src/__tests__/child-registry.test.ts
import { describe, it, expect, vi } from "vitest";
import { ChildRegistry, type Killable } from "../child-registry";

const fakeChild = () => ({ kill: vi.fn().mockReturnValue(true) } as Killable & { kill: ReturnType<typeof vi.fn> });

describe("ChildRegistry", () => {
  it("interrupt kills the registered child and returns true", () => {
    const r = new ChildRegistry(); const c = fakeChild();
    r.register("exp-1", c);
    expect(r.interrupt("exp-1")).toBe(true);
    expect(c.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("interrupt returns false when nothing is running for that experiment", () => {
    const r = new ChildRegistry();
    expect(r.interrupt("nope")).toBe(false);
  });
  it("unregister only deletes the same child (identity-guarded)", () => {
    const r = new ChildRegistry(); const c1 = fakeChild(); const c2 = fakeChild();
    r.register("exp-1", c1);
    r.unregister("exp-1", c2);          // different child — must NOT remove c1
    expect(r.interrupt("exp-1")).toBe(true);
    expect(c1.kill).toHaveBeenCalled();
  });
  it("killAll SIGTERMs every registered child", () => {
    const r = new ChildRegistry(); const a = fakeChild(); const b = fakeChild();
    r.register("a", a); r.register("b", b);
    r.killAll();
    expect(a.kill).toHaveBeenCalledWith("SIGTERM");
    expect(b.kill).toHaveBeenCalledWith("SIGTERM");
    expect(r.size()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/child-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/synapse-daemon/src/child-registry.ts
export interface Killable { kill(signal?: string): boolean; }

export class ChildRegistry {
  private children = new Map<string, Killable>();

  register(experimentUuid: string, child: Killable): void {
    this.children.set(experimentUuid, child);
  }

  unregister(experimentUuid: string, child: Killable): void {
    if (this.children.get(experimentUuid) === child) this.children.delete(experimentUuid);
  }

  interrupt(experimentUuid: string): boolean {
    const child = this.children.get(experimentUuid);
    if (!child) return false;
    child.kill("SIGTERM");
    return true;
  }

  killAll(): void {
    for (const child of this.children.values()) child.kill("SIGTERM");
    this.children.clear();
  }

  size(): number {
    return this.children.size;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/child-registry.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add packages/synapse-daemon/src/child-registry.ts packages/synapse-daemon/src/__tests__/child-registry.test.ts
git commit -m "feat(daemon): per-experiment child registry"
```

---

### Task 5: Daemon orchestrator — route interrupt + register children

Wire the registry into the runner and route `kind: "interrupt"` to `registry.interrupt`.

**Files:**
- Modify: `packages/synapse-daemon/src/daemon.ts`
- Modify: `packages/synapse-daemon/src/index.ts`
- Test: `packages/synapse-daemon/src/__tests__/daemon.test.ts`

**Interfaces:**
- Consumes: `decideWake` (now with `kind`), `ChildRegistry` (Task 4).
- `daemon.ts` change: `DaemonDeps` gains `interrupt: (experimentUuid: string) => boolean` (injected; in prod it's `registry.interrupt.bind(registry)`). `handleEvent`:
  - If `decision.kind === "interrupt"`: call `this.deps.interrupt(experimentUuid)`, log, and return `null` (no enqueue, no spawn). Do NOT touch `seen`.
  - Else (resume): existing path unchanged.
- `index.ts` change: replace `const inflight = new Set<ChildProcess>()` with `const registry = new ChildRegistry()`; `makeChildRunner` takes the registry + the experimentUuid for the current turn and `register/unregister`s by key; pass `interrupt: (uuid) => registry.interrupt(uuid)` into the Daemon; shutdown calls `registry.killAll()`. The runner must learn the experimentUuid — thread it via the run opts (the spawner already has `sessionId = experimentUuid`; pass it into `deps.run` opts as `experimentUuid`).

- [ ] **Step 1: Extend the daemon test**

Add to `packages/synapse-daemon/src/__tests__/daemon.test.ts`:
```ts
it("interrupt event calls deps.interrupt and does not spawn", async () => {
  const run = vi.fn();
  const interrupt = vi.fn().mockReturnValue(true);
  const d = new Daemon({ config, queue: new WakeQueue(), mcpConfigPath: "/m", spawn: { run, logger }, logger, interrupt });
  const ret = d.handleEvent(ev({ action: "experiment_interrupt", entityUuid: "exp-1" }));
  expect(ret).toBeNull();
  expect(interrupt).toHaveBeenCalledWith("exp-1");
  expect(run).not.toHaveBeenCalled();
});
it("instruction event resumes (spawns --resume) after a prior turn", async () => {
  const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ session_id: "exp-1" }), stderr: "" });
  const interrupt = vi.fn();
  const d = new Daemon({ config, queue: new WakeQueue(), mcpConfigPath: "/m", spawn: { run, logger }, logger, interrupt });
  await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1" }));        // first turn
  await d.handleEvent(ev({ action: "experiment_instruction", entityUuid: "exp-1", message: "more" })); // resume
  const secondArgv = run.mock.calls[1][0] as string[];
  expect(secondArgv).toContain("--resume");
});
```
(Update the existing `makeDaemon`/`Daemon` constructions in this test file to pass an `interrupt: vi.fn()` in `DaemonDeps`.)

- [ ] **Step 2: Run to verify it fails**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__/daemon.test.ts`
Expected: FAIL — `interrupt` not in deps / not routed.

- [ ] **Step 3: Implement daemon.ts**

Add `interrupt: (experimentUuid: string) => boolean` to `DaemonDeps`. In `handleEvent`, after `const decision = decideWake(event); if (!decision.wake || !decision.experimentUuid) return null;`, add:
```ts
if (decision.kind === "interrupt") {
  const killed = this.deps.interrupt(decision.experimentUuid);
  this.deps.logger.info(`Interrupt for experiment ${decision.experimentUuid}: ${killed ? "killed in-flight turn" : "no in-flight turn"}`);
  return null;
}
```
Leave the resume path (claim `seen`, enqueue, spawn) exactly as is.

- [ ] **Step 4: Implement index.ts (registry wiring)**

Read `index.ts`. Replace the inflight Set with `ChildRegistry`. The runner signature must accept the experiment key. Change `makeChildRunner(inflight)` → `makeChildRunner(registry)`, and have `deps.run` receive the experimentUuid. Concretely:
- `SpawnDeps.run` opts already carry `{ cwd, env }`; ADD `experimentUuid: string` to that opts object. The spawner (`claude-spawner.ts`) passes `params.sessionId` — thread it: in `spawnClaudeTurn`, pass `experimentUuid: params.sessionId` into `deps.run(argv, { cwd, env, experimentUuid })`. (Modify `claude-spawner.ts` SpawnDeps type + call accordingly — this is a small allowed change within the daemon package; note it in the task.)
- In `makeChildRunner`, on spawn: `registry.register(opts.experimentUuid, child)`; in `settle`: `registry.unregister(opts.experimentUuid, child)`.
- Construct `const registry = new ChildRegistry()`; build the Daemon with `interrupt: (uuid) => registry.interrupt(uuid)`; `shutdown` → `registry.killAll()`.

```ts
// index.ts sketch (adapt to the real file)
import { ChildRegistry } from "./child-registry.js";
const registry = new ChildRegistry();
// makeChildRunner(registry) — register on spawn, unregister on settle, keyed by opts.experimentUuid
const daemon = new Daemon({
  config, queue, mcpConfigPath,
  spawn: { run: makeChildRunner(registry), logger: consoleLogger },
  logger: consoleLogger,
  interrupt: (uuid) => registry.interrupt(uuid),
});
// shutdown: registry.killAll();
```

- [ ] **Step 5: Update claude-spawner SpawnDeps to pass experimentUuid**

In `claude-spawner.ts`: `SpawnDeps.run` opts type gains `experimentUuid: string`; `spawnClaudeTurn` passes `experimentUuid: params.sessionId` in the `deps.run(argv, {...})` call. The Task-7 (P2) spawner tests pass `{ cwd, env }` — update those test runner mocks to tolerate the extra opts field (they use `expect.objectContaining`/positional args, so adding a field is non-breaking; verify the existing claude-spawner.test.ts still passes).

- [ ] **Step 6: Run daemon tests + build**

Run: from `packages/synapse-daemon`, `pnpm vitest run src/__tests__` then `pnpm build`
Expected: all daemon tests pass (including the existing spawner/daemon tests), build clean.

- [ ] **Step 7: Commit**

```bash
git add packages/synapse-daemon/src/daemon.ts packages/synapse-daemon/src/index.ts packages/synapse-daemon/src/claude-spawner.ts packages/synapse-daemon/src/__tests__/daemon.test.ts packages/synapse-daemon/src/__tests__/claude-spawner.test.ts
git commit -m "feat(daemon): route interrupt to per-experiment child kill"
```

---

### Task 6: i18n keys for control + takeover

**Files:**
- Modify: `messages/en.json`, `messages/zh.json`

- [ ] **Step 1: Add keys to a `control` section in en.json**

```json
"control": {
  "instructionLabel": "Send instruction to agent",
  "instructionPlaceholder": "Type an instruction and the assigned agent will resume…",
  "send": "Send",
  "interrupt": "Interrupt",
  "interruptConfirm": "Interrupt the running turn for this experiment?",
  "noAgent": "No agent is assigned to this experiment",
  "sent": "Instruction sent",
  "interruptSent": "Interrupt requested",
  "sessionId": "Session ID",
  "copy": "Copy",
  "copied": "Copied",
  "origin": "Origin",
  "liveStatus": "Live status"
}
```

- [ ] **Step 2: Add matching `control` section to zh.json**

```json
"control": {
  "instructionLabel": "向智能体发送指令",
  "instructionPlaceholder": "输入指令，已分配的智能体将继续执行…",
  "send": "发送",
  "interrupt": "中断",
  "interruptConfirm": "中断该实验正在运行的回合？",
  "noAgent": "该实验未分配智能体",
  "sent": "指令已发送",
  "interruptSent": "已请求中断",
  "sessionId": "会话 ID",
  "copy": "复制",
  "copied": "已复制",
  "origin": "来源",
  "liveStatus": "实时状态"
}
```

- [ ] **Step 3: Parity check + commit**

Run: `node -e "const e=require('./messages/en.json'),z=require('./messages/zh.json'); const a=Object.keys(e.control).sort().join(','),b=Object.keys(z.control).sort().join(','); console.log(a===b?'control parity OK':'MISMATCH')"`
Expected: `control parity OK`.

```bash
git add messages/en.json messages/zh.json
git commit -m "i18n(control): add control section (en + zh)"
```

---

### Task 7: ExecutionRow Interrupt button

Add an optional Interrupt control to the P3 `ExecutionRow`.

**Files:**
- Modify: `src/components/presence/execution-row.tsx`

**Interfaces:**
- Produces: `ExecutionRow` gains an optional prop `onInterrupt?: (experimentUuid: string) => void`. When provided, render a small Interrupt button (both variants) that calls `e.preventDefault(); e.stopPropagation(); onInterrupt(execution.experimentUuid)` (so it doesn't trigger the row's Link navigation). When absent, render no button (backward-compatible with P3 callers).

- [ ] **Step 1: Implement**

Read the current `execution-row.tsx`. Add `onInterrupt?: (experimentUuid: string) => void` to the props. In both `inline` and `stacked` branches, when `onInterrupt` is set, add a `<button type="button">` with an interrupt icon (use `lucide-react` `Square` or `CircleStop` — check what's imported elsewhere; if unsure use a text label `t("control.interrupt")` via `useTranslations` already added in P3-fix? execution-row now imports useTranslations from the P3 final fix — reuse it). The button handler must `preventDefault`+`stopPropagation` then call `onInterrupt(execution.experimentUuid)`. Keep it visually small/muted with a destructive hover.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'execution-row' || echo "no type errors"` and `pnpm exec eslint src/components/presence/execution-row.tsx 2>&1 | tail -5`
Expected: no new errors. Confirm P3 callers (ConnectionList) still compile (they pass no `onInterrupt` — fine since optional).

- [ ] **Step 3: Commit**

```bash
git add src/components/presence/execution-row.tsx
git commit -m "feat(control): optional Interrupt button on ExecutionRow"
```

---

### Task 8: Experiment detail panel — live status, instruction box, interrupt, copy session id

The main human-facing surface. One file.

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`

**Interfaces:**
- Consumes: the two new endpoints (`POST .../instruction`, `POST .../interrupt`), `useTranslations`, existing toast/notification mechanism in the file (find how the file surfaces success/error — reuse it).

- [ ] **Step 1: Add a "Live status" line to the detail panel**

In the `{selectedExperiment && (...)}` detail region, near the status badges, render `selectedExperiment.liveStatus` + `selectedExperiment.liveMessage` when `liveStatus` is non-null (label `t("control.liveStatus")`). Match the panel's existing row/label styling.

- [ ] **Step 2: Add the instruction box + interrupt + copy-session-id**

Add a control section (after Active sessions, before comments). Read the file's existing input/button patterns and toast usage; mirror them. Behaviors:
- **Instruction box:** a textarea + Send button. On send, `POST /api/experiments/${selectedExperiment.uuid}/instruction` with `{ message }`. On 200 → clear + success toast `t("control.sent")`. On 409 → toast `t("control.noAgent")`. Disable Send when message empty or no agent assignee (`selectedExperiment.assigneeType !== "agent"`).
- **Interrupt button:** `t("control.interrupt")`, destructive-styled. On click (optionally confirm via existing dialog or window.confirm — prefer the file's existing confirm pattern; `t("control.interruptConfirm")`), `POST /api/experiments/${uuid}/interrupt`. Toast `t("control.interruptSent")`. Show only when `assigneeType === "agent"`.
- **Copy session ID:** show `t("control.sessionId")`: `<code>{selectedExperiment.uuid}</code>` + a Copy button using `navigator.clipboard.writeText(selectedExperiment.uuid)` → toast `t("control.copied")`. (P5: the session id IS the experiment uuid — daemon anchors `--session-id` to it, so a human can `claude --resume <uuid>` in the origin cwd.)

Keep all strings i18n'd. Use the file's existing fetch/error-handling conventions (read them; do not invent a new toast system).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'experiments-board' || echo "no new type errors"` and `pnpm exec eslint "src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx" 2>&1 | tail -5`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx"
git commit -m "feat(control): instruction box, interrupt, copy session id in experiment panel"
```

---

### Task 9: Full-suite verification + manual smoke

**Files:** none.

- [ ] **Step 1: Server + daemon unit tests**

Run: `pnpm test src/services/__tests__/experiment-control.service.test.ts "src/app/api/experiments/[uuid]/instruction" "src/app/api/experiments/[uuid]/interrupt"` and from `packages/synapse-daemon` `pnpm vitest run src/__tests__` + `pnpm build`.
Expected: all pass; daemon build clean.

- [ ] **Step 2: Lint changed files + i18n parity**

Run: `git diff --name-only <P4-base>..HEAD | grep -E '\.(ts|tsx)$' | tr '\n' ' ' | xargs pnpm exec eslint` (0 errors); and the `control` parity check from Task 6.
Expected: clean.

- [ ] **Step 3: Manual smoke (optional — requires running app + daemon + claude)**

With the dev server up, a `claude_code` agent assigned to an experiment, and the daemon running (`synapse daemon`):
- Open the experiment panel → type an instruction → Send → daemon logs `Spawning claude turn ... (resume=true)`; the instruction appears as a comment.
- While a turn runs, click Interrupt → daemon logs `Interrupt for experiment <uuid>: killed in-flight turn`.
- Copy session ID → paste → equals the experiment uuid; `claude --resume <uuid>` in the daemon's cwd resumes the same session.

- [ ] **Step 4: Commit any fixups**

```bash
git add -A && git commit -m "chore(control): lint + test cleanup for P4/P5"
```

---

## Self-Review

**Spec coverage (macro plan P4 + P5):**
- ✅ P4 reverse control channel → reused notification stream (no new channel): `experiment_instruction`/`experiment_interrupt` actions (Tasks 1, 3) + daemon interrupt routing (Tasks 4, 5).
- ✅ P4 instruction injection lands in experiment panel + comment stream (NOT a parallel chat UI) → Task 1 writes a comment, Task 8 panel box.
- ✅ P4 origin-only precise delivery → the notification targets the experiment's assignee agent by `recipientUuid`; the daemon keys on `experimentUuid`; interrupt kills only that experiment's child (Task 4). (Single-instance registry per P1/P2 caveat.)
- ✅ P4 ExecutionRow Interrupt button → Task 7.
- ✅ P4 headless guard loop close → human介入 now flows as an instruction comment + wake, rather than the agent hanging on AskUserQuestion (P2 already uses `--permission-mode dontAsk`).
- ✅ P5 session anchoring → already shipped in P2 (`--session-id = experimentUuid`); Task 8 surfaces "Copy session ID".
- ✅ P5 continuation pinned to origin cwd → the heartbeat already records host/cwd server-side (P1/P2); read-only-if-origin-offline is inherent (a human resumes in that cwd). Task 8 may optionally show origin via the P3 connection data; minimum is Copy session ID.

**Placeholder scan:** No TODO/TBD. The two big integration tasks (8 panel, 5 index wiring) give precise edit recipes against real files with "read X first" instructions, because the exact toast/confirm/runner code must match the surrounding file — the testable seams (service, routes, wake-filter, child-registry) carry full code + tests.

**Type consistency:** `WakeDecision.kind` (Task 3) consumed by daemon (Task 5). `ChildRegistry`/`Killable` (Task 4) consumed by index.ts (Task 5). `SpawnDeps.run` opts gains `experimentUuid` (Task 5) — threaded from `spawnClaudeTurn`. `injectInstruction`/`requestInterrupt`/error classes (Task 1) consumed by routes (Task 2). `onInterrupt(experimentUuid)` (Task 7) called by Task 8 / future callers. i18n `control.*` keys (Task 6) referenced by Tasks 7, 8.

**Known assumptions flagged inline (verify during impl):** exact `notificationService.create` + `commentService.createComment` param names; `errors.conflict`/`errors.notFound` existence (409/404); `UserAuthContext` name field; the experiment object's `projectName` for the notification; the panel file's existing toast/confirm/fetch conventions; `lucide-react` icon availability for the interrupt button.

**Release-surface note (carry to PR):** P4 changes `packages/synapse-daemon/` (wake-filter, child-registry, daemon, index, claude-spawner) → the daemon package must be re-published with the rest of the daemon release (already required by P2). P4/P5 server + frontend are app-only. No OpenClaw plugin change.

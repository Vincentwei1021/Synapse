# Per-Node GPU Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global GPU telemetry poller with per-node toggles — each compute node gets an on/off switch (default off, 30s interval), auto-disables after 3 consecutive failures, and adding a machine triggers an automatic first GPU inventory sync.

**Architecture:** Add `telemetryEnabled` field to `ComputeNode`. Replace the global `setInterval` poller with a per-node `Map<nodeUuid, { timer, failCount }>` managed by `startNodeTelemetry()` / `stopNodeTelemetry()`. On process start, restore timers for all enabled nodes. Remove `SYNAPSE_GPU_TELEMETRY_AUTOSTART` env var and all references.

**Tech Stack:** TypeScript, Prisma, Next.js API routes, React (Switch component)

---

### File Structure

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | **Modify** | Add `telemetryEnabled` field to ComputeNode |
| `src/services/gpu-telemetry.service.ts` | **Create** | Per-node timer management, SSH probe, failure tracking |
| `src/services/compute.service.ts` | **Modify** | Remove old poller, add first-sync-on-create, import new service |
| `src/app/api/compute-nodes/[uuid]/route.ts` | **Modify** | Add PATCH endpoint for telemetry toggle |
| `src/app/(dashboard)/compute/compute-page-client.tsx` | **Modify** | Add Switch per node |
| `src/instrumentation.ts` | **Modify** | Replace autostart with restore-enabled-nodes |
| `messages/en.json` + `messages/zh.json` | **Modify** | Add telemetry i18n keys |
| `CLAUDE.md`, `AGENTS.md`, docs | **Modify** | Remove SYNAPSE_GPU_TELEMETRY_AUTOSTART references |

---

### Task 1: Schema — add telemetryEnabled field

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field to ComputeNode model**

In `prisma/schema.prisma`, find the `ComputeNode` model and add after the `notes` field:

```prisma
  telemetryEnabled  Boolean   @default(false)
```

- [ ] **Step 2: Generate Prisma client**

```bash
pnpm db:generate
```

- [ ] **Step 3: Push schema to dev DB**

```bash
DATABASE_URL="postgresql://synapse:synapse@localhost:5432/synapse" npx prisma db push
```

(Use port 5432 — that's where postgres runs on the synapse machine.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma src/generated/
git commit -m "schema: add telemetryEnabled to ComputeNode"
```

---

### Task 2: Create gpu-telemetry.service.ts

Extract telemetry logic into a dedicated service. This manages per-node timers, SSH probing, failure tracking, and auto-disable.

**Files:**
- Create: `src/services/gpu-telemetry.service.ts`

- [ ] **Step 1: Create the service**

```typescript
// src/services/gpu-telemetry.service.ts
// Per-node GPU telemetry polling via SSH + nvidia-smi

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { syncNodeInventory, updateGpuStatuses } from "./compute.service";

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 30_000;
const SSH_TIMEOUT_MS = 8_000;
const MAX_CONSECUTIVE_FAILURES = 3;

interface NodeTimer {
  timer: NodeJS.Timeout;
  failCount: number;
}

// Process-level timer map
const nodeTimers = new Map<string, NodeTimer>();

interface SshNodeInfo {
  uuid: string;
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyPath: string | null;
}

interface ProbeResult {
  slotIndex: number;
  model: string;
  memoryGb: number | null;
  memoryUsedGb: number | null;
  utilizationPercent: number | null;
  temperatureC: number | null;
}

function parseNvidiaSmiOutput(stdout: string): ProbeResult[] {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [index, name, memTotal, memUsed, util, temp] = line.split(",").map((s) => s.trim());
      return {
        slotIndex: parseInt(index, 10),
        model: name || "Unknown GPU",
        memoryGb: memTotal ? Math.round(parseFloat(memTotal) / 1024) : null,
        memoryUsedGb: memUsed ? parseFloat((parseFloat(memUsed) / 1024).toFixed(1)) : null,
        utilizationPercent: util ? parseInt(util, 10) : null,
        temperatureC: temp ? parseInt(temp, 10) : null,
      };
    })
    .filter((gpu) => !isNaN(gpu.slotIndex));
}

async function probeNodeViaSsh(node: SshNodeInfo): Promise<ProbeResult[]> {
  if (!node.sshHost) return [];

  const destination = `${node.sshUser ?? "ubuntu"}@${node.sshHost}`;
  const args = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=no",
    "-p", String(node.sshPort ?? 22),
  ];

  if (node.sshKeyPath) {
    args.push("-i", node.sshKeyPath);
  }

  args.push(
    destination,
    "nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits"
  );

  const { stdout } = await execFileAsync("ssh", args, {
    timeout: SSH_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });

  return parseNvidiaSmiOutput(stdout);
}

async function pollNode(nodeUuid: string): Promise<void> {
  const node = await prisma.computeNode.findFirst({
    where: { uuid: nodeUuid },
    select: { uuid: true, sshHost: true, sshUser: true, sshPort: true, sshKeyPath: true, telemetryEnabled: true },
  });

  if (!node || !node.telemetryEnabled || !node.sshHost) {
    stopNodeTelemetry(nodeUuid);
    return;
  }

  const entry = nodeTimers.get(nodeUuid);
  if (!entry) return;

  try {
    const gpus = await probeNodeViaSsh(node);
    if (gpus.length === 0) return;

    // Sync inventory (create/update GPU records)
    await syncNodeInventory({
      nodeUuid,
      gpus: gpus.map((g) => ({ slotIndex: g.slotIndex, model: g.model, memoryGb: g.memoryGb ?? undefined })),
    });

    // Update telemetry values
    const existing = await prisma.computeGpu.findMany({
      where: { nodeUuid },
      select: { uuid: true, slotIndex: true },
    });
    const gpuBySlot = new Map(existing.map((g) => [g.slotIndex, g.uuid]));

    await updateGpuStatuses({
      nodeUuid,
      gpus: gpus
        .map((g) => {
          const gpuUuid = gpuBySlot.get(g.slotIndex);
          if (!gpuUuid) return null;
          return {
            gpuUuid,
            utilizationPercent: g.utilizationPercent ?? undefined,
            memoryUsedGb: g.memoryUsedGb ?? undefined,
            temperatureC: g.temperatureC ?? undefined,
          };
        })
        .filter((g): g is NonNullable<typeof g> => Boolean(g)),
    });

    // Success — reset fail count
    entry.failCount = 0;
  } catch {
    // Failure — increment counter
    entry.failCount++;

    if (entry.failCount >= MAX_CONSECUTIVE_FAILURES) {
      // Auto-disable telemetry
      await prisma.computeNode.update({
        where: { uuid: nodeUuid },
        data: { telemetryEnabled: false },
      });
      stopNodeTelemetry(nodeUuid);
    }
  }
}

/**
 * Start polling for a specific node. Idempotent — no-ops if already running.
 */
export function startNodeTelemetry(nodeUuid: string): void {
  if (nodeTimers.has(nodeUuid)) return;

  // Run immediately, then every POLL_INTERVAL_MS
  void pollNode(nodeUuid);
  const timer = setInterval(() => void pollNode(nodeUuid), POLL_INTERVAL_MS);
  nodeTimers.set(nodeUuid, { timer, failCount: 0 });
}

/**
 * Stop polling for a specific node. Idempotent.
 */
export function stopNodeTelemetry(nodeUuid: string): void {
  const entry = nodeTimers.get(nodeUuid);
  if (entry) {
    clearInterval(entry.timer);
    nodeTimers.delete(nodeUuid);
  }
}

/**
 * One-shot probe: SSH to node, run nvidia-smi, sync inventory.
 * Used when adding a machine. Does not start recurring polling.
 */
export async function probeNodeOnce(nodeUuid: string): Promise<void> {
  const node = await prisma.computeNode.findFirst({
    where: { uuid: nodeUuid },
    select: { uuid: true, sshHost: true, sshUser: true, sshPort: true, sshKeyPath: true },
  });
  if (!node?.sshHost) return;

  try {
    const gpus = await probeNodeViaSsh(node);
    if (gpus.length === 0) return;

    await syncNodeInventory({
      nodeUuid,
      gpus: gpus.map((g) => ({ slotIndex: g.slotIndex, model: g.model, memoryGb: g.memoryGb ?? undefined })),
    });
  } catch {
    // First-time probe failure is non-fatal — user can retry or sync manually
  }
}

/**
 * Restore timers for all nodes with telemetryEnabled=true.
 * Called once on process startup.
 */
export async function restoreEnabledTelemetry(): Promise<void> {
  const enabledNodes = await prisma.computeNode.findMany({
    where: { telemetryEnabled: true, sshHost: { not: null } },
    select: { uuid: true },
  });

  for (const node of enabledNodes) {
    startNodeTelemetry(node.uuid);
  }
}
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu-telemetry.service.ts
git commit -m "feat: create per-node GPU telemetry service"
```

---

### Task 3: Remove old poller from compute.service.ts

**Files:**
- Modify: `src/services/compute.service.ts`

- [ ] **Step 1: Remove old poller code**

Remove these from `compute.service.ts`:
- The `GPU_POLL_INTERVAL_MS` constant (line 7)
- The `globalForGpuPoller` object (lines 13-17)
- The `listPollableNodes()` function (lines 244-261)
- The `probeNodeViaSsh()` function (lines 263-300)
- The `parseNvidiaSmiOutput()` function (find it — it's used by probeNodeViaSsh)
- The `runGpuPollCycle()` function (lines 302-354)
- The `ensureGpuTelemetryPollerStarted()` function (lines 356-366)
- The `startGpuTelemetryPoller()` function (lines 368-370)

Keep `syncNodeInventory()` and `updateGpuStatuses()` — the new service imports them.

Also remove the `SSH_TIMEOUT_MS` constant if it's only used by the removed code.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Fix any imports that break.

- [ ] **Step 3: Commit**

```bash
git commit -am "refactor: remove global GPU telemetry poller from compute.service"
```

---

### Task 4: Auto-probe on node creation

**Files:**
- Modify: `src/app/api/compute-nodes/route.ts`

- [ ] **Step 1: Add first-time probe after node creation**

At the end of the POST handler, after `createComputeNode()` succeeds, add:

```typescript
import { probeNodeOnce } from "@/services/gpu-telemetry.service";

// ... after const node = await createComputeNode(...)

// Auto-probe GPU inventory on first add (fire and forget)
probeNodeOnce(node.uuid).catch(() => {});
```

The probe runs async (fire-and-forget) so it doesn't block the API response.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: auto-probe GPU inventory when adding a compute node"
```

---

### Task 5: PATCH endpoint for telemetry toggle

**Files:**
- Modify: `src/app/api/compute-nodes/[uuid]/route.ts`

- [ ] **Step 1: Add PATCH handler**

```typescript
import { z } from "zod";
import { parseBody } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { startNodeTelemetry, stopNodeTelemetry } from "@/services/gpu-telemetry.service";

const patchSchema = z.object({
  telemetryEnabled: z.boolean().optional(),
  lifecycle: z.string().optional(),
  notes: z.string().optional(),
});

export const PATCH = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can update compute nodes");

    const { uuid } = await context.params;
    const body = await parseBody(request);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.flatten().fieldErrors);

    const node = await prisma.computeNode.findFirst({
      where: { uuid, companyUuid: auth.companyUuid },
      select: { uuid: true },
    });
    if (!node) return errors.notFound("Compute node");

    const updated = await prisma.computeNode.update({
      where: { uuid },
      data: parsed.data,
      select: { uuid: true, label: true, telemetryEnabled: true, lifecycle: true },
    });

    // Start or stop telemetry polling
    if (parsed.data.telemetryEnabled === true) {
      startNodeTelemetry(uuid);
    } else if (parsed.data.telemetryEnabled === false) {
      stopNodeTelemetry(uuid);
    }

    return success(updated);
  }
);
```

Add the necessary imports at the top of the file (some already exist from DELETE).

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: add PATCH /api/compute-nodes/[uuid] for telemetry toggle"
```

---

### Task 6: Frontend — telemetry switch per node

**Files:**
- Modify: `src/app/(dashboard)/compute/compute-page-client.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add i18n keys**

In `messages/en.json`, in the `compute` section:
```json
"telemetry": "Auto-refresh",
"telemetryDesc": "Poll GPU status every 30s"
```

In `messages/zh.json`:
```json
"telemetry": "自动刷新",
"telemetryDesc": "每 30 秒轮询 GPU 状态"
```

- [ ] **Step 2: Add Switch to each node card**

In `compute-page-client.tsx`, find where each node is rendered (the node card inside the pool). Add a Switch component in the node card header area:

```tsx
import { Switch } from "@/components/ui/switch";

// Inside the node card, near the node label/actions:
<div className="flex items-center gap-2">
  <Switch
    checked={node.telemetryEnabled}
    onCheckedChange={async (checked) => {
      await fetch(`/api/compute-nodes/${node.uuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telemetryEnabled: checked }),
      });
      router.refresh();
    }}
  />
  <span className="text-xs text-muted-foreground">{t("compute.telemetry")}</span>
</div>
```

The `node.telemetryEnabled` field needs to be included in the data returned by `listComputePools()` — check the select in `compute.service.ts` and add `telemetryEnabled: true` to the node select if missing.

- [ ] **Step 3: Ensure telemetryEnabled is in the pool listing response**

In `compute.service.ts`, find `listComputePools()` and verify the node select includes `telemetryEnabled`. If not, add it.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: add GPU telemetry toggle switch to compute node cards"
```

---

### Task 7: Update instrumentation.ts and restore on startup

**Files:**
- Modify: `src/instrumentation.ts`

- [ ] **Step 1: Replace autostart with restore**

In `src/instrumentation.ts`, replace the `SYNAPSE_GPU_TELEMETRY_AUTOSTART` block:

```typescript
// Old:
if (process.env.SYNAPSE_GPU_TELEMETRY_AUTOSTART === "true") {
  const { startGpuTelemetryPoller } = await import("@/services/compute.service");
  startGpuTelemetryPoller();
}

// New:
const { restoreEnabledTelemetry } = await import("@/services/gpu-telemetry.service");
restoreEnabledTelemetry().catch(() => {});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: restore per-node telemetry timers on process startup"
```

---

### Task 8: Clean up references to SYNAPSE_GPU_TELEMETRY_AUTOSTART

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ARCHITECTURE.zh.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/DOCKER.md`
- Modify: `scripts/preflight.sh`

- [ ] **Step 1: Remove all references**

In each file, find and remove lines mentioning `SYNAPSE_GPU_TELEMETRY_AUTOSTART`. Replace with description of per-node toggle if appropriate:

- `CLAUDE.md` line ~353: Replace "Startup is explicit and currently gated by..." with "GPU telemetry is controlled per-node via a toggle on the compute page (30s polling interval, auto-disables after 3 consecutive SSH failures)."
- `docs/DEPLOYMENT.md`: Remove the env var from the environment variables section
- `docs/DOCKER.md`: Remove mention
- `docs/ARCHITECTURE.md` / `.zh.md`: Update description
- `AGENTS.md`: Update description
- `scripts/preflight.sh`: Remove the telemetry check block

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: replace SYNAPSE_GPU_TELEMETRY_AUTOSTART with per-node toggle docs"
```

---

### Task 9: Sync, deploy, push

**Files:** (no code changes)

- [ ] **Step 1: Sync to remote**

```bash
rsync -avz --delete --exclude node_modules --exclude .next --exclude .git . synapse:/home/ubuntu/Synapse/
```

- [ ] **Step 2: Generate Prisma client and push schema on remote**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm db:generate && DATABASE_URL="postgresql://synapse:synapse@localhost:5432/synapse" npx prisma db push'
```

- [ ] **Step 3: Run tests on remote**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm test'
```

- [ ] **Step 4: Commit and push**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add -A && git commit -m "feat: per-node GPU telemetry toggle (30s polling, auto-disable on failure)" && git push'
```

- [ ] **Step 5: Pull locally**

```bash
git pull
```

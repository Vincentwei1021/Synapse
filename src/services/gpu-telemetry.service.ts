import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { syncNodeInventory, updateGpuStatuses } from "./compute.service";

const execFileAsync = promisify(execFile);

const SSH_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 30_000;
const MAX_FAIL_COUNT = 3;

// ---------------------------------------------------------------------------
// Per-node timer state
// ---------------------------------------------------------------------------

type NodeTimerEntry = {
  timer: NodeJS.Timeout;
  failCount: number;
};

const nodeTimers = new Map<string, NodeTimerEntry>();

// ---------------------------------------------------------------------------
// nvidia-smi parsing (replicated from former compute.service.ts poller)
// ---------------------------------------------------------------------------

type PolledGpuSnapshot = {
  slotIndex: number;
  model: string;
  memoryGb?: number;
  memoryUsedGb?: number;
  utilizationPercent?: number;
  temperatureC?: number;
};

function roundToGb(memoryMb?: number) {
  if (memoryMb === undefined || Number.isNaN(memoryMb)) {
    return undefined;
  }
  return Math.round((memoryMb / 1024) * 10) / 10;
}

function parseNvidiaSmiOutput(stdout: string): PolledGpuSnapshot[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [slotIndex, model, memoryTotalMb, memoryUsedMb, utilizationPercent, temperatureC] = line
        .split(",")
        .map((part) => part.trim());

      return {
        slotIndex: Number(slotIndex),
        model,
        memoryGb: roundToGb(Number(memoryTotalMb)),
        memoryUsedGb: roundToGb(Number(memoryUsedMb)),
        utilizationPercent: Number(utilizationPercent),
        temperatureC: Number(temperatureC),
      };
    })
    .filter((gpu) => Number.isFinite(gpu.slotIndex) && !!gpu.model);
}

// ---------------------------------------------------------------------------
// SSH probe
// ---------------------------------------------------------------------------

export async function probeNodeViaSsh(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyPath: string | null;
}): Promise<PolledGpuSnapshot[]> {
  if (!node.sshHost) {
    return [];
  }

  const destination = `${node.sshUser ?? "ubuntu"}@${node.sshHost}`;
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    "-o",
    "StrictHostKeyChecking=no",
    "-p",
    String(node.sshPort ?? 22),
  ];

  if (node.sshKeyPath) {
    args.push("-i", node.sshKeyPath);
  }

  args.push(
    destination,
    "nvidia-smi --query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits",
  );

  const { stdout } = await execFileAsync("ssh", args, {
    timeout: SSH_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });

  return parseNvidiaSmiOutput(stdout);
}

// ---------------------------------------------------------------------------
// Core poll cycle for a single node
// ---------------------------------------------------------------------------

async function pollNode(nodeUuid: string): Promise<void> {
  const node = await prisma.computeNode.findUnique({
    where: { uuid: nodeUuid },
    select: {
      uuid: true,
      sshHost: true,
      sshUser: true,
      sshPort: true,
      sshKeyPath: true,
    },
  });

  if (!node) {
    stopNodeTelemetry(nodeUuid);
    return;
  }

  const entry = nodeTimers.get(nodeUuid);

  try {
    const gpus = await probeNodeViaSsh(node);

    if (gpus.length === 0) {
      return;
    }

    await syncNodeInventory({
      nodeUuid: node.uuid,
      gpus: gpus.map((gpu) => ({
        slotIndex: gpu.slotIndex,
        model: gpu.model,
        memoryGb: gpu.memoryGb ? Math.round(gpu.memoryGb) : undefined,
      })),
    });

    const existing = await prisma.computeGpu.findMany({
      where: { nodeUuid: node.uuid },
      select: { uuid: true, slotIndex: true },
    });
    const gpuBySlot = new Map(existing.map((gpu) => [gpu.slotIndex, gpu.uuid]));

    await updateGpuStatuses({
      nodeUuid: node.uuid,
      gpus: gpus
        .map((gpu) => {
          const gpuUuid = gpuBySlot.get(gpu.slotIndex);
          if (!gpuUuid) return null;
          return {
            gpuUuid,
            utilizationPercent: gpu.utilizationPercent,
            memoryUsedGb: gpu.memoryUsedGb,
            temperatureC: gpu.temperatureC,
          };
        })
        .filter((gpu): gpu is NonNullable<typeof gpu> => Boolean(gpu)),
    });

    // Reset fail count and clear error on success
    if (entry) {
      entry.failCount = 0;
    }
    await prisma.computeNode.update({
      where: { uuid: nodeUuid },
      data: { telemetryError: null },
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (entry) {
      entry.failCount += 1;

      if (entry.failCount >= MAX_FAIL_COUNT) {
        // Auto-disable telemetry after too many consecutive failures
        await prisma.computeNode.update({
          where: { uuid: nodeUuid },
          data: { telemetryEnabled: false, telemetryError: message },
        }).catch(() => {});
        stopNodeTelemetry(nodeUuid);
      } else {
        await prisma.computeNode.update({
          where: { uuid: nodeUuid },
          data: { telemetryError: message },
        }).catch(() => {});
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Idempotent. Starts recurring telemetry polling for a single node. */
export function startNodeTelemetry(nodeUuid: string): void {
  if (nodeTimers.has(nodeUuid)) {
    return;
  }

  const entry: NodeTimerEntry = {
    timer: setInterval(() => {
      void pollNode(nodeUuid);
    }, POLL_INTERVAL_MS),
    failCount: 0,
  };

  nodeTimers.set(nodeUuid, entry);

  // Run first poll immediately
  void pollNode(nodeUuid);
}

/** Idempotent. Stops recurring telemetry polling for a single node. */
export function stopNodeTelemetry(nodeUuid: string): void {
  const entry = nodeTimers.get(nodeUuid);
  if (!entry) {
    return;
  }

  clearInterval(entry.timer);
  nodeTimers.delete(nodeUuid);
}

/**
 * One-shot probe for a node (e.g. when first adding a machine).
 * SSH + nvidia-smi + syncNodeInventory. No recurring timer. Swallows errors.
 */
export async function probeNodeOnce(nodeUuid: string): Promise<void> {
  try {
    const node = await prisma.computeNode.findUnique({
      where: { uuid: nodeUuid },
      select: {
        uuid: true,
        sshHost: true,
        sshUser: true,
        sshPort: true,
        sshKeyPath: true,
      },
    });

    if (!node) {
      return;
    }

    const gpus = await probeNodeViaSsh(node);

    if (gpus.length === 0) {
      return;
    }

    await syncNodeInventory({
      nodeUuid: node.uuid,
      gpus: gpus.map((gpu) => ({
        slotIndex: gpu.slotIndex,
        model: gpu.model,
        memoryGb: gpu.memoryGb ? Math.round(gpu.memoryGb) : undefined,
      })),
    });
  } catch {
    // Swallow errors — this is a best-effort probe
  }
}

/**
 * Queries all nodes with telemetryEnabled=true and sshHost != null,
 * then starts a recurring timer for each. Called on process startup.
 */
export async function restoreEnabledTelemetry(): Promise<void> {
  const nodes = await prisma.computeNode.findMany({
    where: {
      telemetryEnabled: true,
      sshHost: { not: null },
    },
    select: { uuid: true },
  });

  for (const node of nodes) {
    startNodeTelemetry(node.uuid);
  }
}

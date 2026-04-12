import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { getComputeNodeSnapshot, syncNodeInventory, updateGpuStatuses } from "./compute.service";

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

type ProbedNodeMetadata = {
  ec2InstanceId: string | null;
  instanceType: string | null;
  region: string | null;
};

type ProbedNodeSnapshot = ProbedNodeMetadata & {
  gpus: PolledGpuSnapshot[];
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

async function probeNodeMetadataViaSsh(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyPath: string | null;
}): Promise<ProbedNodeMetadata> {
  if (!node.sshHost) {
    return {
      ec2InstanceId: null,
      instanceType: null,
      region: null,
    };
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

  const metadataScript = [
    "set -u",
    'TOKEN=$(curl -fsS -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)',
    'fetch_meta() { local target=\"$1\"; if [ -n \"$TOKEN\" ]; then curl -fsS -m 2 -H \"X-aws-ec2-metadata-token: $TOKEN\" \"http://169.254.169.254/latest/meta-data/$target\" 2>/dev/null || true; else curl -fsS -m 2 \"http://169.254.169.254/latest/meta-data/$target\" 2>/dev/null || true; fi; }',
    'fetch_doc() { if [ -n \"$TOKEN\" ]; then curl -fsS -m 2 -H \"X-aws-ec2-metadata-token: $TOKEN\" \"http://169.254.169.254/latest/dynamic/instance-identity/document\" 2>/dev/null || true; else curl -fsS -m 2 \"http://169.254.169.254/latest/dynamic/instance-identity/document\" 2>/dev/null || true; fi; }',
    'INSTANCE_ID=$(fetch_meta "instance-id")',
    'INSTANCE_TYPE=$(fetch_meta "instance-type")',
    'REGION=$(fetch_doc | sed -n \'s/.*"region"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p\' | head -n 1)',
    'printf "instanceId=%s\\ninstanceType=%s\\nregion=%s\\n" "$INSTANCE_ID" "$INSTANCE_TYPE" "$REGION"',
  ].join("; ");

  const { stdout } = await execFileAsync("ssh", [...args, destination, "bash", "-lc", metadataScript], {
    timeout: SSH_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });

  const values = new Map(
    stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=")];
      }),
  );

  return {
    ec2InstanceId: values.get("instanceId") || null,
    instanceType: values.get("instanceType") || null,
    region: values.get("region") || null,
  };
}

function formatProbeError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }

  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
  const message = stderr || stdout || error.message;

  if (!message) {
    return new Error("Unable to connect to the machine over SSH.");
  }

  if (/permission denied/i.test(message)) {
    return new Error("SSH authentication failed. Check the username and private key, then try again.");
  }

  if (/timed out|timeout/i.test(message)) {
    return new Error("SSH connection timed out. Verify the host, port, and network access, then try again.");
  }

  if (/could not resolve hostname|name or service not known|temporary failure in name resolution/i.test(message)) {
    return new Error("The SSH hostname could not be resolved. Check the hostname or IP address and try again.");
  }

  if (/nvidia-smi/i.test(message) && /not found|command not found|no such file/i.test(message)) {
    return new Error("SSH connected successfully, but `nvidia-smi` is not available on the machine.");
  }

  return new Error(message);
}

async function probeNodeSnapshotViaSsh(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyPath: string | null;
}): Promise<ProbedNodeSnapshot> {
  try {
    const [metadata, gpus] = await Promise.all([
      probeNodeMetadataViaSsh(node),
      probeNodeViaSsh(node),
    ]);

    if (gpus.length === 0) {
      throw new Error("SSH connected successfully, but no GPUs were detected via `nvidia-smi`.");
    }

    return {
      ...metadata,
      gpus,
    };
  } catch (error) {
    throw formatProbeError(error);
  }
}

async function syncProbedNodeSnapshot(
  nodeUuid: string,
  snapshot: ProbedNodeSnapshot,
): Promise<void> {
  await syncNodeInventory({
    nodeUuid,
    ec2InstanceId: snapshot.ec2InstanceId,
    instanceType: snapshot.instanceType,
    region: snapshot.region,
    gpus: snapshot.gpus.map((gpu) => ({
      slotIndex: gpu.slotIndex,
      model: gpu.model,
      memoryGb: gpu.memoryGb ? Math.round(gpu.memoryGb) : undefined,
    })),
  });

  const existing = await prisma.computeGpu.findMany({
    where: { nodeUuid },
    select: { uuid: true, slotIndex: true },
  });
  const gpuBySlot = new Map(existing.map((gpu) => [gpu.slotIndex, gpu.uuid]));

  await updateGpuStatuses({
    nodeUuid,
    gpus: snapshot.gpus
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
    await probeNodeNow(nodeUuid);
  } catch {
    // Swallow errors — this is a best-effort probe
  }
}

export async function probeNodeNow(nodeUuid: string) {
  const node = await prisma.computeNode.findUnique({
    where: { uuid: nodeUuid },
    select: {
      uuid: true,
      companyUuid: true,
      sshHost: true,
      sshUser: true,
      sshPort: true,
      sshKeyPath: true,
    },
  });

  if (!node) {
    throw new Error("Compute node not found.");
  }

  const snapshot = await probeNodeSnapshotViaSsh(node);
  await syncProbedNodeSnapshot(node.uuid, snapshot);

  const syncedNode = await getComputeNodeSnapshot(node.companyUuid, node.uuid);
  if (!syncedNode) {
    throw new Error("Compute node not found.");
  }

  await prisma.computeNode.update({
    where: { uuid: node.uuid },
    data: { telemetryError: null },
  }).catch(() => {});

  return syncedNode;
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

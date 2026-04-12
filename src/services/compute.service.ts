import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";

const NODE_IDLE = "idle";
const GPU_AVAILABLE = "available";

export interface ComputeGpuSnapshot {
  uuid: string;
  slotIndex: number;
  model: string;
  memoryGb: number | null;
  lifecycle: string;
  utilizationPercent: number | null;
  memoryUsedGb: number | null;
  temperatureC: number | null;
  notes: string | null;
  lastReportedAt: string | null;
  activeReservation: {
    uuid: string;
    kind: "experiment" | "run";
    itemUuid: string;
    itemTitle: string;
    itemStatus: string;
  } | null;
  computedStatus: string;
}

export interface ComputeNodeSnapshot {
  uuid: string;
  label: string;
  ec2InstanceId: string | null;
  instanceType: string | null;
  region: string | null;
  lifecycle: string;
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  // sshKeyPath intentionally omitted — never expose server filesystem paths
  sshKeyName: string | null;
  sshKeySource: string | null;
  managedKeyAvailable: boolean;
  ssmTarget: string | null;
  notes: string | null;
  lastReportedAt: string | null;
  gpuCount: number;
  busyGpuCount: number;
  availableGpuCount: number;
  telemetryEnabled: boolean;
  telemetryError: string | null;
  inventoryPending: boolean;
  gpus: ComputeGpuSnapshot[];
}

export interface ComputePoolSnapshot {
  uuid: string;
  name: string;
  description: string | null;
  nodes: ComputeNodeSnapshot[];
}

export interface ComputeNodeAccessBundle {
  nodeUuid: string;
  label: string;
  ssh: {
    host: string;
    user: string;
    port: number;
    keyName: string | null;
    keyFingerprint: string | null;
    keySource: string | null;
    privateKeyPemBase64: string;
  } | null;
  ssmTarget: string | null;
}

const computeNodeSnapshotInclude = {
  gpus: {
    orderBy: { slotIndex: "asc" as const },
    include: {
      reservations: {
        where: { releasedAt: null },
        include: {
          run: {
            select: {
              uuid: true,
              title: true,
              status: true,
            },
          },
        },
      },
      experimentReservations: {
        where: { releasedAt: null },
        include: {
          experiment: {
            select: {
              uuid: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  },
};

function serializeNode(node: {
  uuid: string;
  label: string;
  ec2InstanceId: string | null;
  instanceType: string | null;
  region: string | null;
  lifecycle: string;
  telemetryEnabled: boolean;
  telemetryError: string | null;
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyPath: string | null;
  sshKeyName: string | null;
  sshKeyFingerprint: string | null;
  sshKeySource: string | null;
  ssmTarget: string | null;
  notes: string | null;
  lastReportedAt: Date | null;
  gpus: Array<{
    uuid: string;
      slotIndex: number;
      model: string;
    memoryGb: number | null;
    lifecycle: string;
    utilizationPercent: number | null;
    memoryUsedGb: number | null;
    temperatureC: number | null;
    notes: string | null;
    lastReportedAt: Date | null;
    reservations: Array<{
      uuid: string;
      runUuid: string;
      run: {
        uuid: string;
        title: string;
        status: string;
      };
    }>;
    experimentReservations: Array<{
      uuid: string;
      experimentUuid: string;
      experiment: {
        uuid: string;
        title: string;
        status: string;
      };
    }>;
  }>;
}): ComputeNodeSnapshot {
  const gpus = node.gpus.map((gpu) => {
    const activeExperimentReservation = gpu.experimentReservations[0] ?? null;
    const activeRunReservation = gpu.reservations[0] ?? null;
    const activeReservation = activeExperimentReservation
      ? {
          uuid: activeExperimentReservation.uuid,
          kind: "experiment" as const,
          itemUuid: activeExperimentReservation.experiment.uuid,
          itemTitle: activeExperimentReservation.experiment.title,
          itemStatus: activeExperimentReservation.experiment.status,
        }
      : activeRunReservation
        ? {
            uuid: activeRunReservation.uuid,
            kind: "run" as const,
            itemUuid: activeRunReservation.run.uuid,
            itemTitle: activeRunReservation.run.title,
            itemStatus: activeRunReservation.run.status,
          }
        : null;
    const computedStatus = activeReservation ? "busy" : gpu.lifecycle;

    return {
      uuid: gpu.uuid,
      slotIndex: gpu.slotIndex,
      model: gpu.model,
      memoryGb: gpu.memoryGb,
      lifecycle: gpu.lifecycle,
      utilizationPercent: gpu.utilizationPercent,
      memoryUsedGb: gpu.memoryUsedGb,
      temperatureC: gpu.temperatureC,
      notes: gpu.notes,
      lastReportedAt: gpu.lastReportedAt?.toISOString() ?? null,
      activeReservation: activeReservation
        ? {
            uuid: activeReservation.uuid,
            kind: activeReservation.kind,
            itemUuid: activeReservation.itemUuid,
            itemTitle: activeReservation.itemTitle,
            itemStatus: activeReservation.itemStatus,
          }
        : null,
      computedStatus,
    };
  });

  return {
    uuid: node.uuid,
    label: node.label,
    ec2InstanceId: node.ec2InstanceId,
    instanceType: node.instanceType,
    region: node.region,
    lifecycle: node.lifecycle,
    sshHost: node.sshHost,
    sshUser: node.sshUser,
    sshPort: node.sshPort,
    // sshKeyPath, sshKeyFingerprint intentionally excluded — server filesystem paths must not leak
    sshKeyName: node.sshKeyName,
    sshKeySource: node.sshKeySource,
    managedKeyAvailable: Boolean(node.sshHost && node.sshKeyPath && node.sshKeySource && node.sshKeySource !== "manual_path"),
    ssmTarget: node.ssmTarget,
    notes: node.notes,
    lastReportedAt: node.lastReportedAt?.toISOString() ?? null,
    telemetryEnabled: node.telemetryEnabled,
    telemetryError: node.telemetryError ?? null,
    gpuCount: gpus.length,
    busyGpuCount: gpus.filter((gpu) => gpu.computedStatus === "busy").length,
    availableGpuCount: gpus.filter((gpu) => gpu.computedStatus === GPU_AVAILABLE).length,
    inventoryPending: gpus.length === 0,
    gpus,
  };
}

export async function listComputePools(companyUuid: string): Promise<ComputePoolSnapshot[]> {
  const pools = await prisma.computePool.findMany({
    where: { companyUuid },
    orderBy: { createdAt: "asc" },
    include: {
      nodes: {
        orderBy: { label: "asc" },
        include: computeNodeSnapshotInclude,
      },
    },
  });

  return pools.map((pool) => ({
    uuid: pool.uuid,
    name: pool.name,
    description: pool.description,
    nodes: pool.nodes.map((node) => serializeNode(node)),
  }));
}

export async function getComputeNodeSnapshot(
  companyUuid: string,
  nodeUuid: string,
): Promise<ComputeNodeSnapshot | null> {
  const node = await prisma.computeNode.findFirst({
    where: {
      companyUuid,
      uuid: nodeUuid,
    },
    include: computeNodeSnapshotInclude,
  });

  return node ? serializeNode(node) : null;
}

export async function listAvailableComputeGpus(companyUuid: string) {
  return prisma.computeGpu.findMany({
    where: {
      companyUuid,
      lifecycle: GPU_AVAILABLE,
      node: {
        lifecycle: NODE_IDLE,
      },
      reservations: {
        none: { releasedAt: null },
      },
      experimentReservations: {
        none: { releasedAt: null },
      },
    },
    orderBy: [{ nodeUuid: "asc" }, { slotIndex: "asc" }],
    include: {
      node: {
        include: {
          pool: true,
        },
      },
    },
  });
}

export async function createComputePool(input: {
  companyUuid: string;
  name: string;
  description?: string;
}) {
  return prisma.computePool.create({
    data: {
      companyUuid: input.companyUuid,
      name: input.name,
      description: input.description || null,
    },
  });
}

export async function createComputeNode(input: {
  companyUuid: string;
  poolUuid: string;
  label: string;
  ec2InstanceId?: string;
  instanceType?: string;
  region?: string;
  lifecycle?: string;
  sshHost?: string;
  sshUser?: string;
  sshPort?: number;
  sshKeyPath?: string;
  sshKeyName?: string;
  sshKeyFingerprint?: string;
  sshKeySource?: string;
  ssmTarget?: string;
  notes?: string;
}) {
  return prisma.computeNode.create({
    data: {
      companyUuid: input.companyUuid,
      poolUuid: input.poolUuid,
      label: input.label,
      ec2InstanceId: input.ec2InstanceId || null,
      instanceType: input.instanceType || null,
      region: input.region || null,
      lifecycle: input.lifecycle || NODE_IDLE,
      sshHost: input.sshHost || null,
      sshUser: input.sshUser || null,
      sshPort: input.sshPort || null,
      sshKeyPath: input.sshKeyPath || null,
      sshKeyName: input.sshKeyName || null,
      sshKeyFingerprint: input.sshKeyFingerprint || null,
      sshKeySource: input.sshKeySource || null,
      ssmTarget: input.ssmTarget || null,
      notes: input.notes || null,
    },
  });
}

export async function deleteComputePool(companyUuid: string, poolUuid: string) {
  const existing = await prisma.computePool.findFirst({
    where: {
      uuid: poolUuid,
      companyUuid,
    },
    select: { uuid: true },
  });

  if (!existing) {
    return false;
  }

  await prisma.computePool.delete({
    where: { uuid: poolUuid },
  });

  return true;
}

export async function deleteComputeNode(companyUuid: string, nodeUuid: string) {
  const existing = await prisma.computeNode.findFirst({
    where: {
      uuid: nodeUuid,
      companyUuid,
    },
    select: { uuid: true },
  });

  if (!existing) {
    return false;
  }

  await prisma.computeNode.delete({
    where: { uuid: nodeUuid },
  });

  return true;
}

export async function syncNodeInventory(input: {
  companyUuid?: string;
  nodeUuid: string;
  ec2InstanceId?: string | null;
  instanceType?: string | null;
  region?: string | null;
  gpus: Array<{
    slotIndex: number;
    model: string;
    memoryGb?: number;
  }>;
}) {
  const node = await prisma.computeNode.findUnique({
    where: { uuid: input.nodeUuid },
    select: { uuid: true, companyUuid: true },
  });

  if (!node) {
    throw new Error("Compute node not found");
  }

  if (input.companyUuid && node.companyUuid !== input.companyUuid) {
    throw new Error("Compute node not found");
  }

  await prisma.computeNode.update({
    where: { uuid: input.nodeUuid },
    data: {
      ec2InstanceId: input.ec2InstanceId ?? undefined,
      instanceType: input.instanceType ?? undefined,
      region: input.region ?? undefined,
      lastReportedAt: new Date(),
    },
  });

  for (const gpu of input.gpus) {
    await prisma.computeGpu.upsert({
      where: {
        nodeUuid_slotIndex: {
          nodeUuid: input.nodeUuid,
          slotIndex: gpu.slotIndex,
        },
      },
      create: {
        companyUuid: node.companyUuid,
        nodeUuid: input.nodeUuid,
        slotIndex: gpu.slotIndex,
        model: gpu.model,
        memoryGb: gpu.memoryGb ?? null,
        lifecycle: GPU_AVAILABLE,
        lastReportedAt: new Date(),
      },
      update: {
        model: gpu.model,
        memoryGb: gpu.memoryGb ?? null,
        lastReportedAt: new Date(),
      },
    });
  }

  return prisma.computeNode.findUniqueOrThrow({
    where: { uuid: input.nodeUuid },
    include: {
      gpus: {
        orderBy: { slotIndex: "asc" },
      },
    },
  });
}

export async function updateGpuStatuses(input: {
  nodeUuid: string;
  gpus: Array<{
    gpuUuid: string;
    lifecycle?: string;
    utilizationPercent?: number;
    memoryUsedGb?: number;
    temperatureC?: number;
    notes?: string | null;
  }>;
}) {
  const now = new Date();

  for (const gpu of input.gpus) {
    await prisma.computeGpu.update({
      where: { uuid: gpu.gpuUuid },
      data: {
        lifecycle: gpu.lifecycle ?? undefined,
        utilizationPercent: gpu.utilizationPercent ?? undefined,
        memoryUsedGb: gpu.memoryUsedGb ?? undefined,
        temperatureC: gpu.temperatureC ?? undefined,
        notes: gpu.notes ?? undefined,
        lastReportedAt: now,
      },
    });
  }

  await prisma.computeNode.update({
    where: { uuid: input.nodeUuid },
    data: { lastReportedAt: now },
  });
}

async function validatePoolBinding(companyUuid: string, researchProjectUuid: string, gpuUuids: string[]) {
  if (gpuUuids.length === 0) return;

  const project = await prisma.researchProject.findFirst({
    where: { uuid: researchProjectUuid, companyUuid },
    select: { computePoolUuid: true },
  });

  if (!project?.computePoolUuid) return; // no constraint

  const gpus = await prisma.computeGpu.findMany({
    where: { uuid: { in: gpuUuids } },
    include: { node: { select: { poolUuid: true } } },
  });

  const invalidGpu = gpus.find(gpu => gpu.node.poolUuid !== project.computePoolUuid);
  if (invalidGpu) {
    throw new Error("GPU does not belong to the compute pool bound to this project");
  }
}

export async function reserveGpusForRun(input: {
  companyUuid: string;
  runUuid: string;
  gpuUuids: string[];
}) {
  if (input.gpuUuids.length === 0) {
    return [];
  }

  // Validate pool binding
  const run = await prisma.experimentRun.findFirst({
    where: { uuid: input.runUuid, companyUuid: input.companyUuid },
    select: { researchProjectUuid: true },
  });
  if (run) {
    await validatePoolBinding(input.companyUuid, run.researchProjectUuid, input.gpuUuids);
  }

  return prisma.$transaction(async (tx) => {
    const gpus = await tx.computeGpu.findMany({
      where: {
        companyUuid: input.companyUuid,
        uuid: { in: input.gpuUuids },
      },
      include: {
        reservations: {
          where: { releasedAt: null },
          select: { uuid: true },
        },
        experimentReservations: {
          where: { releasedAt: null },
          select: { uuid: true },
        },
      },
    });

    if (gpus.length !== input.gpuUuids.length) {
      throw new Error("Some GPUs could not be found");
    }

    const unavailable = gpus.find(
      (gpu) =>
        gpu.lifecycle !== GPU_AVAILABLE ||
        gpu.reservations.length > 0 ||
        gpu.experimentReservations.length > 0,
    );
    if (unavailable) {
      throw new Error(`GPU ${unavailable.slotIndex} on node ${unavailable.nodeUuid} is not available`);
    }

    return Promise.all(
      input.gpuUuids.map((gpuUuid) =>
        tx.runGpuReservation.create({
          data: {
            companyUuid: input.companyUuid,
            runUuid: input.runUuid,
            gpuUuid,
          },
        })
      )
    );
  });
}

export async function releaseGpuReservationsForRun(companyUuid: string, runUuid: string) {
  await prisma.runGpuReservation.updateMany({
    where: {
      companyUuid,
      runUuid,
      releasedAt: null,
    },
    data: {
      releasedAt: new Date(),
    },
  });
}

export async function reserveGpusForExperiment(input: {
  companyUuid: string;
  experimentUuid: string;
  gpuUuids: string[];
}) {
  if (input.gpuUuids.length === 0) {
    return [];
  }

  // Validate pool binding
  const experiment = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid, companyUuid: input.companyUuid },
    select: { researchProjectUuid: true },
  });
  if (experiment) {
    await validatePoolBinding(input.companyUuid, experiment.researchProjectUuid, input.gpuUuids);
  }

  return prisma.$transaction(async (tx) => {
    const gpus = await tx.computeGpu.findMany({
      where: {
        companyUuid: input.companyUuid,
        uuid: { in: input.gpuUuids },
      },
      include: {
        reservations: {
          where: { releasedAt: null },
          select: { uuid: true },
        },
        experimentReservations: {
          where: { releasedAt: null },
          select: { uuid: true },
        },
      },
    });

    if (gpus.length !== input.gpuUuids.length) {
      throw new Error("Some GPUs could not be found");
    }

    const unavailable = gpus.find(
      (gpu) =>
        gpu.lifecycle !== GPU_AVAILABLE ||
        gpu.reservations.length > 0 ||
        gpu.experimentReservations.length > 0,
    );
    if (unavailable) {
      throw new Error(`GPU ${unavailable.slotIndex} on node ${unavailable.nodeUuid} is not available`);
    }

    return Promise.all(
      input.gpuUuids.map((gpuUuid) =>
        tx.experimentGpuReservation.create({
          data: {
            companyUuid: input.companyUuid,
            experimentUuid: input.experimentUuid,
            gpuUuid,
          },
        }),
      ),
    );
  });
}

export async function releaseGpuReservationsForExperiment(companyUuid: string, experimentUuid: string) {
  await prisma.experimentGpuReservation.updateMany({
    where: {
      companyUuid,
      experimentUuid,
      releasedAt: null,
    },
    data: {
      releasedAt: new Date(),
    },
  });
}

export async function getNodeAccessBundle(input: {
  companyUuid: string;
  experimentUuid: string;
  nodeUuid: string;
  agentUuid: string;
}) {
  const experiment = await prisma.experiment.findFirst({
    where: {
      companyUuid: input.companyUuid,
      uuid: input.experimentUuid,
      assigneeType: "agent",
      assigneeUuid: input.agentUuid,
    },
    select: {
      uuid: true,
      status: true,
    },
  });

  if (!experiment) {
    throw new Error("Experiment is not assigned to this agent");
  }

  if (experiment.status !== "pending_start" && experiment.status !== "in_progress") {
    throw new Error(`Experiment must be pending_start or in_progress, current status: ${experiment.status}`);
  }

  const node = await prisma.computeNode.findFirst({
    where: {
      companyUuid: input.companyUuid,
      uuid: input.nodeUuid,
    },
    select: {
      uuid: true,
      label: true,
      sshHost: true,
      sshUser: true,
      sshPort: true,
      sshKeyPath: true,
      sshKeyName: true,
      sshKeyFingerprint: true,
      sshKeySource: true,
      ssmTarget: true,
    },
  });

  if (!node) {
    throw new Error("Compute node not found");
  }

  if (!node.sshHost || !node.sshKeyPath) {
    throw new Error("This compute node does not have a managed SSH key bundle");
  }

  const privateKeyPem = await readFile(node.sshKeyPath, "utf8");

  return {
    nodeUuid: node.uuid,
    label: node.label,
    ssh: {
      host: node.sshHost,
      user: node.sshUser ?? "ubuntu",
      port: node.sshPort ?? 22,
      keyName: node.sshKeyName,
      keyFingerprint: node.sshKeyFingerprint,
      keySource: node.sshKeySource,
      privateKeyPemBase64: Buffer.from(privateKeyPem, "utf8").toString("base64"),
    },
    ssmTarget: node.ssmTarget,
  } satisfies ComputeNodeAccessBundle;
}

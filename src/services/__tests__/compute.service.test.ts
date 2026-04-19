import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  computePool: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { listComputePools } from "@/services/compute.service";

describe("listComputePools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores orphaned experiment reservations instead of crashing", async () => {
    mockPrisma.computePool.findMany.mockResolvedValue([
      {
        uuid: "pool-1",
        name: "Pool 1",
        description: null,
        nodes: [
          {
            uuid: "node-1",
            label: "Node 1",
            ec2InstanceId: null,
            instanceType: null,
            region: null,
            lifecycle: "idle",
            telemetryEnabled: true,
            telemetryError: null,
            sshHost: null,
            sshUser: null,
            sshPort: null,
            sshKeyPath: null,
            sshKeyName: null,
            sshKeyFingerprint: null,
            sshKeySource: null,
            ssmTarget: null,
            notes: null,
            lastReportedAt: null,
            gpus: [
              {
                uuid: "gpu-1",
                slotIndex: 0,
                model: "A100",
                memoryGb: 80,
                lifecycle: "available",
                utilizationPercent: null,
                memoryUsedGb: null,
                temperatureC: null,
                notes: null,
                lastReportedAt: null,
                reservations: [],
                experimentReservations: [
                  {
                    uuid: "reservation-1",
                    experimentUuid: "exp-missing",
                    experiment: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const pools = await listComputePools("company-1");

    expect(pools[0].nodes[0].gpus[0].activeReservation).toBeNull();
    expect(pools[0].nodes[0].availableGpuCount).toBe(1);
  });

  it("falls back to a valid run reservation when an orphaned run record exists", async () => {
    mockPrisma.computePool.findMany.mockResolvedValue([
      {
        uuid: "pool-1",
        name: "Pool 1",
        description: null,
        nodes: [
          {
            uuid: "node-1",
            label: "Node 1",
            ec2InstanceId: null,
            instanceType: null,
            region: null,
            lifecycle: "idle",
            telemetryEnabled: true,
            telemetryError: null,
            sshHost: null,
            sshUser: null,
            sshPort: null,
            sshKeyPath: "/tmp/key.pem",
            sshKeyName: "key",
            sshKeyFingerprint: null,
            sshKeySource: "generated",
            ssmTarget: null,
            notes: null,
            lastReportedAt: null,
            gpus: [
              {
                uuid: "gpu-1",
                slotIndex: 0,
                model: "A100",
                memoryGb: 80,
                lifecycle: "available",
                utilizationPercent: null,
                memoryUsedGb: null,
                temperatureC: null,
                notes: null,
                lastReportedAt: null,
                reservations: [
                  {
                    uuid: "run-orphan",
                    runUuid: "run-missing",
                    run: null,
                  },
                  {
                    uuid: "run-live",
                    runUuid: "run-1",
                    run: {
                      uuid: "run-1",
                      title: "Legacy run",
                      status: "in_progress",
                    },
                  },
                ],
                experimentReservations: [],
              },
            ],
          },
        ],
      },
    ]);

    const pools = await listComputePools("company-1");

    expect(pools[0].nodes[0].gpus[0].activeReservation).toEqual({
      uuid: "run-live",
      kind: "run",
      itemUuid: "run-1",
      itemTitle: "Legacy run",
      itemStatus: "in_progress",
    });
    expect(pools[0].nodes[0].busyGpuCount).toBe(1);
  });
});

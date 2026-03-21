import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => {
  const txProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockPrisma as Record<string, unknown>)[prop as string];
      },
    },
  );

  return {
    baseline: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txProxy)),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  createBaseline,
  listBaselines,
  getActiveBaseline,
  setActiveBaseline,
  deleteBaseline,
} from "@/services/baseline.service";

// ===== Helpers =====
const now = new Date("2026-03-22T00:00:00Z");
const companyUuid = "company-0000-0000-0000-000000000001";
const researchProjectUuid = "project-0000-0000-0000-000000000001";
const baselineUuid = "baseline-0000-0000-0000-000000000001";
const experimentUuid = "experiment-0000-0000-0000-000000000001";

function makeBaselineRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uuid: baselineUuid,
    companyUuid,
    researchProjectUuid,
    name: "Q1 Baseline",
    metrics: { nps: 42, csat: 85 },
    experimentUuid: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== createBaseline =====
describe("createBaseline", () => {
  it("should create a baseline and return it", async () => {
    const record = makeBaselineRecord();
    mockPrisma.baseline.create.mockResolvedValue(record);

    const result = await createBaseline(companyUuid, {
      researchProjectUuid,
      name: "Q1 Baseline",
      metrics: { nps: 42, csat: 85 },
    });

    expect(result).toEqual(record);
    expect(mockPrisma.baseline.create).toHaveBeenCalledWith({
      data: {
        companyUuid,
        researchProjectUuid,
        name: "Q1 Baseline",
        metrics: { nps: 42, csat: 85 },
        experimentUuid: undefined,
      },
    });
  });

  it("should pass experimentUuid when provided", async () => {
    const record = makeBaselineRecord({ experimentUuid });
    mockPrisma.baseline.create.mockResolvedValue(record);

    const result = await createBaseline(companyUuid, {
      researchProjectUuid,
      name: "Q1 Baseline",
      metrics: { nps: 42, csat: 85 },
      experimentUuid,
    });

    expect(result.experimentUuid).toBe(experimentUuid);
    expect(mockPrisma.baseline.create).toHaveBeenCalledWith({
      data: {
        companyUuid,
        researchProjectUuid,
        name: "Q1 Baseline",
        metrics: { nps: 42, csat: 85 },
        experimentUuid,
      },
    });
  });

  it("should default isActive to true (via Prisma schema default)", async () => {
    const record = makeBaselineRecord({ isActive: true });
    mockPrisma.baseline.create.mockResolvedValue(record);

    const result = await createBaseline(companyUuid, {
      researchProjectUuid,
      name: "Q1 Baseline",
      metrics: { nps: 42 },
    });

    expect(result.isActive).toBe(true);
  });
});

// ===== listBaselines =====
describe("listBaselines", () => {
  it("should return all baselines for a project ordered by createdAt desc", async () => {
    const records = [
      makeBaselineRecord({ uuid: "baseline-2", name: "Newer" }),
      makeBaselineRecord({ uuid: "baseline-1", name: "Older" }),
    ];
    mockPrisma.baseline.findMany.mockResolvedValue(records);

    const result = await listBaselines(companyUuid, researchProjectUuid);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Newer");
    expect(result[1].name).toBe("Older");
    expect(mockPrisma.baseline.findMany).toHaveBeenCalledWith({
      where: { companyUuid, researchProjectUuid },
      orderBy: { createdAt: "desc" },
    });
  });

  it("should return empty array when no baselines exist", async () => {
    mockPrisma.baseline.findMany.mockResolvedValue([]);

    const result = await listBaselines(companyUuid, researchProjectUuid);

    expect(result).toEqual([]);
  });
});

// ===== getActiveBaseline =====
describe("getActiveBaseline", () => {
  it("should return the active baseline for a project", async () => {
    const record = makeBaselineRecord({ isActive: true });
    mockPrisma.baseline.findFirst.mockResolvedValue(record);

    const result = await getActiveBaseline(companyUuid, researchProjectUuid);

    expect(result).toEqual(record);
    expect(result!.isActive).toBe(true);
    expect(mockPrisma.baseline.findFirst).toHaveBeenCalledWith({
      where: { companyUuid, researchProjectUuid, isActive: true },
    });
  });

  it("should return null when no active baseline exists", async () => {
    mockPrisma.baseline.findFirst.mockResolvedValue(null);

    const result = await getActiveBaseline(companyUuid, researchProjectUuid);

    expect(result).toBeNull();
  });
});

// ===== setActiveBaseline =====
describe("setActiveBaseline", () => {
  it("should deactivate all baselines in the project and activate the target", async () => {
    const record = makeBaselineRecord({ isActive: true });
    // findFirst returns the baseline to get its researchProjectUuid
    mockPrisma.baseline.findFirst.mockResolvedValue(record);
    // updateMany deactivates all baselines in the project
    mockPrisma.baseline.updateMany.mockResolvedValue({ count: 2 });
    // update activates the target baseline
    mockPrisma.baseline.update.mockResolvedValue({ ...record, isActive: true });

    const result = await setActiveBaseline(companyUuid, baselineUuid);

    expect(result.isActive).toBe(true);
    expect(mockPrisma.baseline.findFirst).toHaveBeenCalledWith({
      where: { uuid: baselineUuid, companyUuid },
    });
    expect(mockPrisma.baseline.updateMany).toHaveBeenCalledWith({
      where: { companyUuid, researchProjectUuid },
      data: { isActive: false },
    });
    expect(mockPrisma.baseline.update).toHaveBeenCalledWith({
      where: { uuid: baselineUuid },
      data: { isActive: true },
    });
  });

  it("should throw error when baseline not found", async () => {
    mockPrisma.baseline.findFirst.mockResolvedValue(null);

    await expect(
      setActiveBaseline(companyUuid, "nonexistent-uuid")
    ).rejects.toThrow("Baseline not found");
  });

  it("should use a transaction to ensure atomicity", async () => {
    const record = makeBaselineRecord();
    mockPrisma.baseline.findFirst.mockResolvedValue(record);
    mockPrisma.baseline.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.baseline.update.mockResolvedValue({ ...record, isActive: true });

    await setActiveBaseline(companyUuid, baselineUuid);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ===== deleteBaseline =====
describe("deleteBaseline", () => {
  it("should delete baseline by uuid and companyUuid", async () => {
    mockPrisma.baseline.findFirst.mockResolvedValue(makeBaselineRecord());
    mockPrisma.baseline.delete.mockResolvedValue(makeBaselineRecord());

    await deleteBaseline(companyUuid, baselineUuid);

    expect(mockPrisma.baseline.findFirst).toHaveBeenCalledWith({
      where: { uuid: baselineUuid, companyUuid },
    });
    expect(mockPrisma.baseline.delete).toHaveBeenCalledWith({
      where: { uuid: baselineUuid },
    });
  });

  it("should throw error when baseline not found", async () => {
    mockPrisma.baseline.findFirst.mockResolvedValue(null);

    await expect(
      deleteBaseline(companyUuid, "nonexistent-uuid")
    ).rejects.toThrow("Baseline not found");
  });

  it("should return void on success", async () => {
    mockPrisma.baseline.findFirst.mockResolvedValue(makeBaselineRecord());
    mockPrisma.baseline.delete.mockResolvedValue(makeBaselineRecord());

    const result = await deleteBaseline(companyUuid, baselineUuid);

    expect(result).toBeUndefined();
  });
});

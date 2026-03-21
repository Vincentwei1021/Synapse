import { vi, describe, it, expect, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  experimentRegistry: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// ===== Import under test (after mocks) =====
import {
  registerExperiment,
  completeExperiment,
  getByRun,
  markReproducible,
  listByProject,
} from "@/services/experiment-registry.service";

// ===== Helpers =====
const COMPANY_UUID = "company-0000-0000-0000-000000000001";
const PROJECT_UUID = "project-0000-0000-0000-000000000001";
const RUN_UUID = "run-0000-0000-0000-000000000001";
const REGISTRY_UUID = "registry-0000-0000-0000-000000000001";

const now = new Date("2026-03-22T00:00:00Z");
const later = new Date("2026-03-22T01:00:00Z");

function makeRegistry(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    uuid: REGISTRY_UUID,
    companyUuid: COMPANY_UUID,
    researchProjectUuid: PROJECT_UUID,
    runUuid: RUN_UUID,
    config: { model: "gpt-4", temperature: 0.7 },
    environment: { python: "3.11", gpu: "A100" },
    seed: null,
    startedAt: now,
    completedAt: null,
    metrics: null,
    artifacts: null,
    reproducible: false,
    createdAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== registerExperiment =====
describe("registerExperiment", () => {
  it("creates a new experiment registry entry", async () => {
    const created = makeRegistry();
    mockPrisma.experimentRegistry.create.mockResolvedValue(created);

    const result = await registerExperiment(COMPANY_UUID, {
      researchProjectUuid: PROJECT_UUID,
      runUuid: RUN_UUID,
      config: { model: "gpt-4", temperature: 0.7 },
      environment: { python: "3.11", gpu: "A100" },
      startedAt: now,
    });

    expect(result.uuid).toBe(REGISTRY_UUID);
    expect(result.companyUuid).toBe(COMPANY_UUID);
    expect(mockPrisma.experimentRegistry.create).toHaveBeenCalledOnce();

    const createData = mockPrisma.experimentRegistry.create.mock.calls[0][0].data;
    expect(createData.companyUuid).toBe(COMPANY_UUID);
    expect(createData.researchProjectUuid).toBe(PROJECT_UUID);
    expect(createData.runUuid).toBe(RUN_UUID);
    expect(createData.config).toEqual({ model: "gpt-4", temperature: 0.7 });
    expect(createData.environment).toEqual({ python: "3.11", gpu: "A100" });
    expect(createData.startedAt).toBe(now);
  });

  it("passes optional seed when provided", async () => {
    const created = makeRegistry({ seed: 42 });
    mockPrisma.experimentRegistry.create.mockResolvedValue(created);

    const result = await registerExperiment(COMPANY_UUID, {
      researchProjectUuid: PROJECT_UUID,
      runUuid: RUN_UUID,
      config: { model: "gpt-4" },
      environment: { python: "3.11" },
      seed: 42,
      startedAt: now,
    });

    expect(result.seed).toBe(42);
    const createData = mockPrisma.experimentRegistry.create.mock.calls[0][0].data;
    expect(createData.seed).toBe(42);
  });

  it("does not include seed when not provided", async () => {
    mockPrisma.experimentRegistry.create.mockResolvedValue(makeRegistry());

    await registerExperiment(COMPANY_UUID, {
      researchProjectUuid: PROJECT_UUID,
      runUuid: RUN_UUID,
      config: {},
      environment: {},
      startedAt: now,
    });

    const createData = mockPrisma.experimentRegistry.create.mock.calls[0][0].data;
    expect(createData.seed).toBeUndefined();
  });
});

// ===== completeExperiment =====
describe("completeExperiment", () => {
  it("updates experiment with completedAt, metrics, and artifacts", async () => {
    const completed = makeRegistry({
      completedAt: later,
      metrics: { accuracy: 0.95, loss: 0.05 },
      artifacts: { model: "s3://bucket/model.bin" },
    });
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(makeRegistry());
    mockPrisma.experimentRegistry.update.mockResolvedValue(completed);

    const result = await completeExperiment(COMPANY_UUID, REGISTRY_UUID, {
      metrics: { accuracy: 0.95, loss: 0.05 },
      artifacts: { model: "s3://bucket/model.bin" },
      completedAt: later,
    });

    expect(result.completedAt).toEqual(later);
    expect(result.metrics).toEqual({ accuracy: 0.95, loss: 0.05 });
    expect(result.artifacts).toEqual({ model: "s3://bucket/model.bin" });

    expect(mockPrisma.experimentRegistry.update).toHaveBeenCalledWith({
      where: { uuid: REGISTRY_UUID },
      data: {
        completedAt: later,
        metrics: { accuracy: 0.95, loss: 0.05 },
        artifacts: { model: "s3://bucket/model.bin" },
      },
    });
  });

  it("allows completing without metrics or artifacts", async () => {
    const completed = makeRegistry({ completedAt: later });
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(makeRegistry());
    mockPrisma.experimentRegistry.update.mockResolvedValue(completed);

    const result = await completeExperiment(COMPANY_UUID, REGISTRY_UUID, {
      completedAt: later,
    });

    expect(result.completedAt).toEqual(later);

    const updateData = mockPrisma.experimentRegistry.update.mock.calls[0][0].data;
    expect(updateData.metrics).toBeUndefined();
    expect(updateData.artifacts).toBeUndefined();
  });

  it("throws when registry entry not found", async () => {
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(null);

    await expect(
      completeExperiment(COMPANY_UUID, REGISTRY_UUID, { completedAt: later }),
    ).rejects.toThrow("ExperimentRegistry not found");
  });

  it("scopes lookup by companyUuid", async () => {
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(null);

    await expect(
      completeExperiment(COMPANY_UUID, REGISTRY_UUID, { completedAt: later }),
    ).rejects.toThrow();

    expect(mockPrisma.experimentRegistry.findFirst).toHaveBeenCalledWith({
      where: { uuid: REGISTRY_UUID, companyUuid: COMPANY_UUID },
    });
  });
});

// ===== getByRun =====
describe("getByRun", () => {
  it("returns registry entry when found", async () => {
    const entry = makeRegistry();
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(entry);

    const result = await getByRun(COMPANY_UUID, RUN_UUID);

    expect(result).not.toBeNull();
    expect(result!.uuid).toBe(REGISTRY_UUID);
    expect(result!.runUuid).toBe(RUN_UUID);
  });

  it("returns null when not found", async () => {
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(null);

    const result = await getByRun(COMPANY_UUID, "nonexistent");
    expect(result).toBeNull();
  });

  it("scopes query by companyUuid and runUuid", async () => {
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(null);

    await getByRun(COMPANY_UUID, RUN_UUID);

    expect(mockPrisma.experimentRegistry.findFirst).toHaveBeenCalledWith({
      where: { runUuid: RUN_UUID, companyUuid: COMPANY_UUID },
    });
  });
});

// ===== markReproducible =====
describe("markReproducible", () => {
  it("sets reproducible to true", async () => {
    const updated = makeRegistry({ reproducible: true });
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(makeRegistry());
    mockPrisma.experimentRegistry.update.mockResolvedValue(updated);

    const result = await markReproducible(COMPANY_UUID, REGISTRY_UUID);

    expect(result.reproducible).toBe(true);
    expect(mockPrisma.experimentRegistry.update).toHaveBeenCalledWith({
      where: { uuid: REGISTRY_UUID },
      data: { reproducible: true },
    });
  });

  it("throws when registry entry not found", async () => {
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(null);

    await expect(
      markReproducible(COMPANY_UUID, REGISTRY_UUID),
    ).rejects.toThrow("ExperimentRegistry not found");
  });

  it("scopes lookup by companyUuid", async () => {
    mockPrisma.experimentRegistry.findFirst.mockResolvedValue(null);

    await expect(
      markReproducible(COMPANY_UUID, REGISTRY_UUID),
    ).rejects.toThrow();

    expect(mockPrisma.experimentRegistry.findFirst).toHaveBeenCalledWith({
      where: { uuid: REGISTRY_UUID, companyUuid: COMPANY_UUID },
    });
  });
});

// ===== listByProject =====
describe("listByProject", () => {
  it("returns all experiments for a project", async () => {
    const entries = [
      makeRegistry({ uuid: "reg-1" }),
      makeRegistry({ uuid: "reg-2" }),
    ];
    mockPrisma.experimentRegistry.findMany.mockResolvedValue(entries);

    const result = await listByProject(COMPANY_UUID, PROJECT_UUID);

    expect(result).toHaveLength(2);
    expect(result[0].uuid).toBe("reg-1");
    expect(result[1].uuid).toBe("reg-2");
  });

  it("returns empty array when no experiments exist", async () => {
    mockPrisma.experimentRegistry.findMany.mockResolvedValue([]);

    const result = await listByProject(COMPANY_UUID, PROJECT_UUID);

    expect(result).toEqual([]);
  });

  it("scopes query by companyUuid and researchProjectUuid", async () => {
    mockPrisma.experimentRegistry.findMany.mockResolvedValue([]);

    await listByProject(COMPANY_UUID, PROJECT_UUID);

    expect(mockPrisma.experimentRegistry.findMany).toHaveBeenCalledWith({
      where: {
        companyUuid: COMPANY_UUID,
        researchProjectUuid: PROJECT_UUID,
      },
      orderBy: { createdAt: "desc" },
    });
  });
});

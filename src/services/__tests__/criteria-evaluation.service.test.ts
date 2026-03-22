import { vi, describe, it, expect, beforeEach } from "vitest";

// ===== Module mocks (hoisted) =====

const mockPrisma = vi.hoisted(() => ({
  acceptanceCriterion: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  experimentRun: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// ===== Import under test (after mocks) =====

import { evaluateCriteria, evaluateOperator } from "@/services/criteria-evaluation.service";

// ===== Helpers =====

const COMPANY_UUID = "00000000-0000-0000-0000-000000000001";
const RUN_UUID = "00000000-0000-0000-0000-000000000099";

function makeCriterion(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "crit-001",
    runUuid: RUN_UUID,
    description: "Test criterion",
    required: true,
    metricName: "accuracy",
    operator: ">=",
    threshold: 0.9,
    isEarlyStop: false,
    actualValue: null,
    devStatus: "pending",
    devEvidence: null,
    status: "pending",
    evidence: null,
    sortOrder: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ===== Tests =====

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------- evaluateOperator (pure function) ----------

describe("evaluateOperator", () => {
  it("evaluates >= correctly", () => {
    expect(evaluateOperator(0.95, ">=", 0.9)).toBe(true);
    expect(evaluateOperator(0.9, ">=", 0.9)).toBe(true);
    expect(evaluateOperator(0.89, ">=", 0.9)).toBe(false);
  });

  it("evaluates <= correctly", () => {
    expect(evaluateOperator(0.5, "<=", 0.6)).toBe(true);
    expect(evaluateOperator(0.6, "<=", 0.6)).toBe(true);
    expect(evaluateOperator(0.7, "<=", 0.6)).toBe(false);
  });

  it("evaluates > correctly", () => {
    expect(evaluateOperator(0.91, ">", 0.9)).toBe(true);
    expect(evaluateOperator(0.9, ">", 0.9)).toBe(false);
  });

  it("evaluates < correctly", () => {
    expect(evaluateOperator(0.89, "<", 0.9)).toBe(true);
    expect(evaluateOperator(0.9, "<", 0.9)).toBe(false);
  });

  it("evaluates == correctly", () => {
    expect(evaluateOperator(0.9, "==", 0.9)).toBe(true);
    expect(evaluateOperator(0.91, "==", 0.9)).toBe(false);
  });

  it("returns false for unknown operator", () => {
    expect(evaluateOperator(0.9, "!!", 0.9)).toBe(false);
  });
});

// ---------- evaluateCriteria ----------

describe("evaluateCriteria", () => {
  it("all criteria pass -> allPassed=true, suggestedOutcome='accepted'", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
      makeCriterion({ uuid: "c2", metricName: "loss", operator: "<=", threshold: 0.1, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, {
      accuracy: 0.95,
      loss: 0.05,
    });

    expect(result.allPassed).toBe(true);
    expect(result.anyFailed).toBe(false);
    expect(result.shouldStop).toBe(false);
    expect(result.suggestedOutcome).toBe("accepted");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(true);

    // Verify DB updates for both criteria
    expect(mockPrisma.acceptanceCriterion.update).toHaveBeenCalledTimes(2);
  });

  it("one required criterion fails -> anyFailed=true, suggestedOutcome='rejected'", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
      makeCriterion({ uuid: "c2", metricName: "loss", operator: "<=", threshold: 0.1, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, {
      accuracy: 0.95,
      loss: 0.5, // fails: 0.5 is NOT <= 0.1
    });

    expect(result.allPassed).toBe(false);
    expect(result.anyFailed).toBe(true);
    expect(result.suggestedOutcome).toBe("rejected");

    const failedResult = result.results.find((r) => r.uuid === "c2");
    expect(failedResult!.passed).toBe(false);
    expect(failedResult!.actualValue).toBe(0.5);
  });

  it("early stop criterion fails -> shouldStop=true", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true, isEarlyStop: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, {
      accuracy: 0.5, // fails the early-stop criterion
    });

    expect(result.shouldStop).toBe(true);
    expect(result.anyFailed).toBe(true);
    expect(result.suggestedOutcome).toBe("rejected");
  });

  it("missing metric -> left as pending, suggestedOutcome='inconclusive'", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, {
      // accuracy is not reported
    });

    expect(result.allPassed).toBe(false);
    expect(result.anyFailed).toBe(false);
    expect(result.suggestedOutcome).toBe("inconclusive");
    expect(result.results[0].passed).toBeNull();
    expect(result.results[0].actualValue).toBeNull();

    // No DB update when metric is not reported
    expect(mockPrisma.acceptanceCriterion.update).not.toHaveBeenCalled();
  });

  it("mixed results (some pass, some pending, none fail) -> 'inconclusive'", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
      makeCriterion({ uuid: "c2", metricName: "f1_score", operator: ">=", threshold: 0.85, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, {
      accuracy: 0.95, // passes
      // f1_score is not reported -> pending
    });

    expect(result.allPassed).toBe(false);
    expect(result.anyFailed).toBe(false);
    expect(result.suggestedOutcome).toBe("inconclusive");

    const passedResult = result.results.find((r) => r.uuid === "c1");
    expect(passedResult!.passed).toBe(true);

    const pendingResult = result.results.find((r) => r.uuid === "c2");
    expect(pendingResult!.passed).toBeNull();
  });

  it("non-required criterion fails -> does not affect suggestedOutcome", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
      makeCriterion({ uuid: "c2", metricName: "bonus_metric", operator: ">=", threshold: 0.99, required: false }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, {
      accuracy: 0.95,     // required passes
      bonus_metric: 0.5,  // non-required fails
    });

    // allPassed considers only required criteria with reported metrics
    expect(result.allPassed).toBe(true);
    expect(result.anyFailed).toBe(false);
    expect(result.suggestedOutcome).toBe("accepted");

    const failedOptional = result.results.find((r) => r.uuid === "c2");
    expect(failedOptional!.passed).toBe(false);
  });

  it("updates actualValue and devStatus in DB for reported metrics", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.95 });

    expect(mockPrisma.acceptanceCriterion.update).toHaveBeenCalledWith({
      where: { uuid: "c1" },
      data: {
        actualValue: 0.95,
        devStatus: "passed",
      },
    });
  });

  it("sets devStatus to 'failed' in DB when criterion fails", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.5 });

    expect(mockPrisma.acceptanceCriterion.update).toHaveBeenCalledWith({
      where: { uuid: "c1" },
      data: {
        actualValue: 0.5,
        devStatus: "failed",
      },
    });
  });

  it("skips criteria without metricName/operator/threshold", async () => {
    const criteria = [
      // Complete metric criterion
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true }),
      // Legacy criterion without metric fields
      makeCriterion({ uuid: "c2", metricName: null, operator: null, threshold: null, required: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.95 });

    // Only the metric criterion should be in results
    expect(result.results).toHaveLength(1);
    expect(result.results[0].uuid).toBe("c1");
  });

  it("early stop criterion that passes does not set shouldStop", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true, isEarlyStop: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    const result = await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.95 });

    expect(result.shouldStop).toBe(false);
    expect(result.allPassed).toBe(true);
  });

  it("scopes findMany query by runUuid and companyUuid via the run relation", async () => {
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue([]);

    await evaluateCriteria(COMPANY_UUID, RUN_UUID, {});

    expect(mockPrisma.acceptanceCriterion.findMany).toHaveBeenCalledWith({
      where: {
        runUuid: RUN_UUID,
        run: { companyUuid: COMPANY_UUID },
      },
    });
  });

  it("should set earlyStopTriggered when shouldStop is true", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true, isEarlyStop: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});
    mockPrisma.experimentRun.update.mockResolvedValue({});
    mockPrisma.experimentRun.findUnique.mockResolvedValue(null);

    await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.5 });

    expect(mockPrisma.experimentRun.update).toHaveBeenCalledWith({
      where: { uuid: RUN_UUID },
      data: { earlyStopTriggered: true },
    });
  });

  it("should create notification when early stop triggers", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true, isEarlyStop: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});
    mockPrisma.experimentRun.update.mockResolvedValue({});
    mockPrisma.experimentRun.findUnique.mockResolvedValue({
      title: "Test Run",
      researchProjectUuid: "project-001",
      assigneeUuid: "assignee-001",
      assigneeType: "agent",
    });
    mockPrisma.notification.create.mockResolvedValue({});

    await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.5 });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyUuid: COMPANY_UUID,
        entityType: "experiment_run",
        entityUuid: RUN_UUID,
        action: "early_stop_triggered",
        recipientUuid: "assignee-001",
      }),
    });
  });

  it("should not set earlyStopTriggered when early stop criteria pass", async () => {
    const criteria = [
      makeCriterion({ uuid: "c1", metricName: "accuracy", operator: ">=", threshold: 0.9, required: true, isEarlyStop: true }),
    ];
    mockPrisma.acceptanceCriterion.findMany.mockResolvedValue(criteria);
    mockPrisma.acceptanceCriterion.update.mockResolvedValue({});

    await evaluateCriteria(COMPANY_UUID, RUN_UUID, { accuracy: 0.95 });

    expect(mockPrisma.experimentRun.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { earlyStopTriggered: true },
      }),
    );
  });
});

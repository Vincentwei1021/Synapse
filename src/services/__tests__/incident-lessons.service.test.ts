import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  experiment: {
    findFirst: vi.fn(),
  },
  experimentIncidentLesson: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  document: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  researchProject: {
    findFirst: vi.fn(),
  },
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/event-bus", () => ({
  eventBus: { emitChange: vi.fn() },
}));

import {
  getExperimentIncidentLessons,
  recordExperimentIncidentLesson,
  searchIncidentLessons,
} from "@/services/incident-lessons.service";

const now = new Date("2026-05-14T08:00:00Z");
const companyUuid = "company-1";
const projectUuid = "project-1";
const experimentUuid = "experiment-1";
const lessonUuid = "lesson-1";

function makeExperiment(overrides: Record<string, unknown> = {}) {
  return {
    uuid: experimentUuid,
    companyUuid,
    researchProjectUuid: projectUuid,
    title: "Reward model run",
    ...overrides,
  };
}

function makeLesson(overrides: Record<string, unknown> = {}) {
  return {
    uuid: lessonUuid,
    companyUuid,
    researchProjectUuid: projectUuid,
    experimentUuid,
    phase: "training",
    severity: "high",
    status: "resolved_in_run",
    failureType: "compute_issue",
    title: "CUDA OOM during training",
    symptom: "Training crashed with CUDA OOM.",
    rootCause: "Batch size exceeded memory.",
    resolution: "Reduced batch size and enabled gradient accumulation.",
    prevention: "Run a smoke test before full training.",
    evidenceSummary: "Redacted traceback summary.",
    experimentOutcomeImpact: "changed_config",
    tags: ["cuda", "oom"],
    createdByUuid: "agent-1",
    createdByType: "agent",
    createdAt: now,
    updatedAt: now,
    experiment: { uuid: experimentUuid, title: "Reward model run" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.experiment.findFirst.mockResolvedValue(makeExperiment());
  mockPrisma.experimentIncidentLesson.create.mockResolvedValue(makeLesson());
  mockPrisma.experimentIncidentLesson.findMany.mockResolvedValue([makeLesson()]);
  mockPrisma.experimentIncidentLesson.count.mockResolvedValue(1);
  mockPrisma.document.findFirst.mockResolvedValue(null);
  mockPrisma.researchProject.findFirst.mockResolvedValue({ name: "Project One" });
  mockPrisma.document.create.mockResolvedValue({ uuid: "doc-1" });
  mockPrisma.$queryRawUnsafe.mockResolvedValue([makeLesson({ rank: 0.9 })]);
});

describe("recordExperimentIncidentLesson", () => {
  it("creates a scoped incident lesson and creates the project lessons document", async () => {
    const lesson = await recordExperimentIncidentLesson({
      companyUuid,
      experimentUuid,
      title: "CUDA OOM during training",
      failureType: "compute_issue",
      status: "resolved_in_run",
      severity: "high",
      phase: "training",
      symptom: "Training crashed with CUDA OOM.",
      rootCause: "Batch size exceeded memory.",
      resolution: "Reduced batch size and enabled gradient accumulation.",
      prevention: "Run a smoke test before full training.",
      evidenceSummary: "Redacted traceback summary.",
      experimentOutcomeImpact: "changed_config",
      tags: ["cuda", "oom"],
      createdByUuid: "agent-1",
      createdByType: "agent",
    });

    expect(lesson.uuid).toBe(lessonUuid);
    expect(mockPrisma.experiment.findFirst).toHaveBeenCalledWith({
      where: { uuid: experimentUuid, companyUuid },
      select: {
        uuid: true,
        title: true,
        researchProjectUuid: true,
        companyUuid: true,
      },
    });
    expect(mockPrisma.experimentIncidentLesson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyUuid,
          researchProjectUuid: projectUuid,
          experimentUuid,
          status: "resolved_in_run",
          failureType: "compute_issue",
          tags: ["cuda", "oom"],
        }),
      }),
    );
    expect(mockPrisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "execution_incident_lessons",
          title: "Project One - Execution Incident Lessons",
          content: expect.stringContaining("CUDA OOM during training"),
        }),
      }),
    );
  });

  it("rejects lessons for experiments outside the current company", async () => {
    mockPrisma.experiment.findFirst.mockResolvedValue(null);

    await expect(
      recordExperimentIncidentLesson({
        companyUuid,
        experimentUuid,
        title: "Auth failure",
        failureType: "auth_issue",
        status: "caused_failure",
        symptom: "SSH auth failed.",
        createdByUuid: "agent-1",
        createdByType: "agent",
      }),
    ).rejects.toThrow("Experiment not found");

    expect(mockPrisma.experimentIncidentLesson.create).not.toHaveBeenCalled();
  });
});

describe("searchIncidentLessons", () => {
  it("uses Postgres full-text search when a query is provided", async () => {
    const result = await searchIncidentLessons({
      companyUuid,
      researchProjectUuid: projectUuid,
      query: "cuda oom batch",
      failureType: "compute_issue",
      status: "resolved_in_run",
      tags: ["cuda"],
      limit: 10,
    });

    expect(result.lessons).toHaveLength(1);
    expect(result.mode).toBe("keyword");
    expect(result.lessons[0].rank).toBe(0.9);
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("websearch_to_tsquery"),
      companyUuid,
      projectUuid,
      "compute_issue",
      "resolved_in_run",
      null,
      null,
      ["cuda"],
      "cuda oom batch",
      10,
    );
  });

  it("accepts bm25 mode for ranked keyword retrieval", async () => {
    const result = await searchIncidentLessons({
      companyUuid,
      researchProjectUuid: projectUuid,
      query: "cuda oom batch",
      mode: "bm25",
    });

    expect(result.mode).toBe("bm25");
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("ts_rank_cd"),
      companyUuid,
      projectUuid,
      null,
      null,
      null,
      null,
      null,
      "cuda oom batch",
      20,
    );
  });

  it("falls back to structured filters when query is blank", async () => {
    const result = await searchIncidentLessons({
      companyUuid,
      researchProjectUuid: projectUuid,
      phase: "training",
      severity: "high",
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.lessons[0].uuid).toBe(lessonUuid);
    expect(mockPrisma.experimentIncidentLesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid,
          researchProjectUuid: projectUuid,
          phase: "training",
          severity: "high",
        }),
      }),
    );
  });
});

describe("getExperimentIncidentLessons", () => {
  it("lists lessons for one experiment within the current company", async () => {
    await getExperimentIncidentLessons({ companyUuid, experimentUuid });

    expect(mockPrisma.experiment.findFirst).toHaveBeenCalledWith({
      where: { uuid: experimentUuid, companyUuid },
      select: {
        uuid: true,
        title: true,
        researchProjectUuid: true,
        companyUuid: true,
      },
    });
    expect(mockPrisma.experimentIncidentLesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyUuid, experimentUuid },
      }),
    );
  });
});

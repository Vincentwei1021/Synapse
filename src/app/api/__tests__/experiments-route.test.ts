import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockResearchProjectExists = vi.fn();
const mockCreateExperiment = vi.fn();
const mockUpdateExperiment = vi.fn();
const mockAssignExperiment = vi.fn();
const mockGetExperiment = vi.fn();
const mockStartExperiment = vi.fn();
const mockCompleteExperiment = vi.fn();
const mockResetExperimentToPendingStart = vi.fn();
const mockReserveGpusForExperiment = vi.fn();
const mockReleaseGpuReservationsForExperiment = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: (auth: { type: string }) => auth.type === "user",
  isAgent: (auth: { type: string }) => auth.type === "agent",
  isAssignee: (
    auth: { type: string; actorUuid: string; ownerUuid?: string },
    assigneeType: string | null,
    assigneeUuid: string | null,
  ) => {
    if (!assigneeType || !assigneeUuid) {
      return false;
    }

    if (auth.type === "user") {
      return assigneeType === "user" && assigneeUuid === auth.actorUuid;
    }

    return (
      (assigneeType === "agent" && assigneeUuid === auth.actorUuid) ||
      (assigneeType === "user" && assigneeUuid === auth.ownerUuid)
    );
  },
}));

vi.mock("@/services/research-project.service", () => ({
  researchProjectExists: (...args: unknown[]) => mockResearchProjectExists(...args),
}));

vi.mock("@/services/experiment.service", () => ({
  createExperiment: (...args: unknown[]) => mockCreateExperiment(...args),
  updateExperiment: (...args: unknown[]) => mockUpdateExperiment(...args),
  assignExperiment: (...args: unknown[]) => mockAssignExperiment(...args),
  getExperiment: (...args: unknown[]) => mockGetExperiment(...args),
  startExperiment: (...args: unknown[]) => mockStartExperiment(...args),
  completeExperiment: (...args: unknown[]) => mockCompleteExperiment(...args),
  resetExperimentToPendingStart: (...args: unknown[]) => mockResetExperimentToPendingStart(...args),
}));

vi.mock("@/services/compute.service", () => ({
  reserveGpusForExperiment: (...args: unknown[]) => mockReserveGpusForExperiment(...args),
  releaseGpuReservationsForExperiment: (...args: unknown[]) => mockReleaseGpuReservationsForExperiment(...args),
}));

import { POST as createExperimentRoute } from "@/app/api/research-projects/[uuid]/experiments/route";
import { PATCH as patchExperimentRoute } from "@/app/api/experiments/[uuid]/route";
import { POST as startExperimentRoute } from "@/app/api/experiments/[uuid]/start/route";
import { POST as completeExperimentRoute } from "@/app/api/experiments/[uuid]/complete/route";
import { POST as resetExperimentRoute } from "@/app/api/experiments/[uuid]/reset/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const projectUuid = "project-0000-0000-0000-000000000001";
const experimentUuid = "experiment-0000-0000-0000-000000000001";

function makeContext(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe("experiment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid, actorUuid: "user-uuid-1" });
    mockResearchProjectExists.mockResolvedValue(true);
    mockCreateExperiment.mockResolvedValue({ uuid: experimentUuid });
    mockUpdateExperiment.mockResolvedValue({ uuid: experimentUuid });
    mockAssignExperiment.mockResolvedValue({ uuid: experimentUuid });
    mockGetExperiment.mockResolvedValue({
      uuid: experimentUuid,
      status: "pending_start",
      assignee: null,
    });
    mockStartExperiment.mockResolvedValue({ uuid: experimentUuid, status: "in_progress" });
    mockCompleteExperiment.mockResolvedValue({ uuid: experimentUuid, status: "completed" });
    mockResetExperimentToPendingStart.mockResolvedValue({ uuid: experimentUuid, status: "pending_start" });
  });

  it("creates experiments with an unlimited compute budget when the field is blank", async () => {
    const formData = new FormData();
    formData.set("title", "Budget-free experiment");
    formData.set("description", "");
    formData.set("priority", "medium");
    formData.set("researchQuestionUuid", "");

    const response = await createExperimentRoute(
      new NextRequest(new URL(`/api/research-projects/${projectUuid}/experiments`, "http://localhost:3000"), {
        method: "POST",
        body: formData,
      }),
      makeContext(projectUuid),
    );

    expect(response.status).toBe(200);
    expect(mockCreateExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        researchProjectUuid: projectUuid,
        computeBudgetHours: null,
      }),
    );
  });

  it("creates experiments in the user-selected column", async () => {
    const formData = new FormData();
    formData.set("title", "Review-first experiment");
    formData.set("description", "Needs review");
    formData.set("status", "pending_review");
    formData.set("priority", "high");
    formData.set("researchQuestionUuid", "rq-1");

    const response = await createExperimentRoute(
      new NextRequest(new URL(`/api/research-projects/${projectUuid}/experiments`, "http://localhost:3000"), {
        method: "POST",
        body: formData,
      }),
      makeContext(projectUuid),
    );

    expect(response.status).toBe(200);
    expect(mockCreateExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        researchProjectUuid: projectUuid,
        status: "pending_review",
        researchQuestionUuid: "rq-1",
      }),
    );
  });

  it("blocks start when the current actor is not the assignee", async () => {
    mockGetExperiment.mockResolvedValueOnce({
      uuid: experimentUuid,
      status: "pending_start",
      assignee: { type: "agent", uuid: "agent-uuid-2" },
    });

    const response = await startExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}/start`, "http://localhost:3000"), {
        method: "POST",
        body: JSON.stringify({ gpuUuids: ["gpu-1"] }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(403);
    expect(mockStartExperiment).not.toHaveBeenCalled();
    expect(mockReserveGpusForExperiment).not.toHaveBeenCalled();
  });

  it("starts before reserving GPUs once authorization and status checks pass", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      type: "agent",
      companyUuid,
      actorUuid: "agent-uuid-1",
      ownerUuid: "user-uuid-1",
    });
    mockGetExperiment.mockResolvedValueOnce({
      uuid: experimentUuid,
      status: "pending_start",
      assignee: { type: "agent", uuid: "agent-uuid-1" },
    });

    const response = await startExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}/start`, "http://localhost:3000"), {
        method: "POST",
        body: JSON.stringify({ gpuUuids: ["gpu-1"] }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(200);
    expect(mockStartExperiment).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        experimentUuid,
        actorType: "agent",
        actorUuid: "agent-uuid-1",
        ownerUuid: "user-uuid-1",
      }),
    );
    expect(mockReserveGpusForExperiment).toHaveBeenCalledWith({
      companyUuid,
      experimentUuid,
      gpuUuids: ["gpu-1"],
    });
    expect(mockStartExperiment.mock.invocationCallOrder[0]).toBeLessThan(
      mockReserveGpusForExperiment.mock.invocationCallOrder[0],
    );
  });

  it("blocks completion when the current actor is not the assignee", async () => {
    mockGetExperiment.mockResolvedValueOnce({
      uuid: experimentUuid,
      status: "in_progress",
      assignee: { type: "agent", uuid: "agent-uuid-2" },
    });

    const response = await completeExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}/complete`, "http://localhost:3000"), {
        method: "POST",
        body: JSON.stringify({ outcome: "done" }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(403);
    expect(mockCompleteExperiment).not.toHaveBeenCalled();
    expect(mockReleaseGpuReservationsForExperiment).not.toHaveBeenCalled();
  });

  it("lets users reset a stuck experiment back to pending_start and releases GPUs first", async () => {
    mockGetExperiment.mockResolvedValueOnce({
      uuid: experimentUuid,
      status: "in_progress",
      assignee: { type: "agent", uuid: "agent-uuid-2" },
    });

    const response = await resetExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}/reset`, "http://localhost:3000"), {
        method: "POST",
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(200);
    expect(mockReleaseGpuReservationsForExperiment).toHaveBeenCalledWith(companyUuid, experimentUuid);
    expect(mockResetExperimentToPendingStart).toHaveBeenCalledWith({
      companyUuid,
      experimentUuid,
      actorUuid: "user-uuid-1",
    });
    expect(mockReleaseGpuReservationsForExperiment.mock.invocationCallOrder[0]).toBeLessThan(
      mockResetExperimentToPendingStart.mock.invocationCallOrder[0],
    );
  });

  it("blocks agents from using the reset route", async () => {
    mockGetAuthContext.mockResolvedValueOnce({
      type: "agent",
      companyUuid,
      actorUuid: "agent-uuid-1",
      ownerUuid: "user-uuid-1",
    });

    const response = await resetExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}/reset`, "http://localhost:3000"), {
        method: "POST",
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(403);
    expect(mockResetExperimentToPendingStart).not.toHaveBeenCalled();
  });

  it("rejects generic PATCH requests that only contain non-updatable fields", async () => {
    const response = await patchExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}`, "http://localhost:3000"), {
        method: "PATCH",
        body: JSON.stringify({
          outcome: "should fail",
          results: { passed: false },
        }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain("No updatable fields provided");
    expect(mockAssignExperiment).not.toHaveBeenCalled();
    expect(mockUpdateExperiment).not.toHaveBeenCalled();
  });

  it("allows draft to pending_review updates through generic PATCH", async () => {
    const response = await patchExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}`, "http://localhost:3000"), {
        method: "PATCH",
        body: JSON.stringify({
          status: "pending_review",
          title: "Reviewed Experiment",
        }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateExperiment).toHaveBeenCalledWith(
      companyUuid,
      experimentUuid,
      expect.objectContaining({
        status: "pending_review",
        title: "Reviewed Experiment",
      }),
      { actorType: "user", actorUuid: "user-uuid-1" },
    );
  });

  it("allows editing draft metadata including linked question and pending_start status", async () => {
    const response = await patchExperimentRoute(
      new NextRequest(new URL(`/api/experiments/${experimentUuid}`, "http://localhost:3000"), {
        method: "PATCH",
        body: JSON.stringify({
          title: "Ready to run",
          description: "Updated draft description",
          researchQuestionUuid: "rq-updated",
          status: "pending_start",
          priority: "high",
          computeBudgetHours: 6,
        }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(experimentUuid),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateExperiment).toHaveBeenCalledWith(
      companyUuid,
      experimentUuid,
      expect.objectContaining({
        title: "Ready to run",
        description: "Updated draft description",
        researchQuestionUuid: "rq-updated",
        status: "pending_start",
        priority: "high",
        computeBudgetHours: 6,
      }),
      { actorType: "user", actorUuid: "user-uuid-1" },
    );
  });
});

import { vi, describe, it, expect, beforeEach } from "vitest";

// ===== Module mocks (hoisted) =====

const mockResearchProjectService = vi.hoisted(() => ({
  getProjectByUuid: vi.fn(),
}));

const mockExperimentRunService = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getUnblockedTasks: vi.fn(),
}));

const mockAssignmentService = vi.hoisted(() => ({
  getAvailableItems: vi.fn(),
}));

vi.mock("@/services/research-project.service", () => mockResearchProjectService);
vi.mock("@/services/experiment-run.service", () => mockExperimentRunService);
vi.mock("@/services/assignment.service", () => mockAssignmentService);

// Mock remaining imports used by public.ts to avoid import errors
vi.mock("@/services/research-question.service", () => ({}));
vi.mock("@/services/document.service", () => ({}));
vi.mock("@/services/experiment-design.service", () => ({}));
vi.mock("@/services/activity.service", () => ({}));
vi.mock("@/services/comment.service", () => ({}));
vi.mock("@/services/notification.service", () => ({}));
vi.mock("@/services/hypothesis-formulation.service", () => ({}));
vi.mock("@/services/project-group.service", () => ({}));
vi.mock("@/services/mention.service", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

// Capture tool handlers via a fake McpServer
type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;
const toolHandlers: Record<string, ToolHandler> = {};

const fakeMcpServer = {
  registerTool: (name: string, _meta: unknown, handler: ToolHandler) => {
    toolHandlers[name] = handler;
  },
};

import type { AgentAuthContext } from "@/types/auth";
import { registerPublicTools } from "@/mcp/tools/public";

const AUTH: AgentAuthContext = {
  type: "agent",
  companyUuid: "company-1",
  actorUuid: "agent-1",
  ownerUuid: "owner-1",
  roles: ["researcher"],
  agentName: "Test Agent",
};

const PROJECT = { uuid: "project-1", name: "Test Project" };

// ===== Setup =====

beforeEach(() => {
  vi.clearAllMocks();
  // Re-register tools so handlers are fresh
  Object.keys(toolHandlers).forEach((k) => delete toolHandlers[k]);
  registerPublicTools(fakeMcpServer as never, AUTH);
});

// ===== synapse_list_experiment_runs =====

describe("synapse_list_experiment_runs — experimentDesignUuids", () => {
  it("passes experimentDesignUuids to experimentRunService.listTasks when provided", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(PROJECT);
    mockExperimentRunService.listTasks.mockResolvedValue({ tasks: [], total: 0 });

    await toolHandlers["synapse_list_experiment_runs"]({
      researchProjectUuid: "project-1",
      experimentDesignUuids: ["design-a", "design-b"],
      page: 1,
      pageSize: 20,
    });

    expect(mockExperimentRunService.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalUuids: ["design-a", "design-b"],
      }),
    );
  });

  it("works without experimentDesignUuids (backward compat)", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(PROJECT);
    mockExperimentRunService.listTasks.mockResolvedValue({ tasks: [], total: 0 });

    await toolHandlers["synapse_list_experiment_runs"]({
      researchProjectUuid: "project-1",
      page: 1,
      pageSize: 20,
    });

    expect(mockExperimentRunService.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: "company-1",
        projectUuid: "project-1",
      }),
    );
    // proposalUuids should be undefined (not present or undefined)
    const callArg = mockExperimentRunService.listTasks.mock.calls[0][0];
    expect(callArg.proposalUuids).toBeUndefined();
  });

  it("still checks project existence", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(null);

    const result = await toolHandlers["synapse_list_experiment_runs"]({
      researchProjectUuid: "nonexistent",
      experimentDesignUuids: ["design-a"],
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual(
      expect.objectContaining({ isError: true }),
    );
    expect(mockExperimentRunService.listTasks).not.toHaveBeenCalled();
  });
});

// ===== synapse_get_available_experiment_runs =====

describe("synapse_get_available_experiment_runs — experimentDesignUuids", () => {
  it("passes experimentDesignUuids to assignmentService.getAvailableItems when provided", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(PROJECT);
    mockAssignmentService.getAvailableItems.mockResolvedValue({ ideas: [], tasks: [] });

    await toolHandlers["synapse_get_available_experiment_runs"]({
      researchProjectUuid: "project-1",
      experimentDesignUuids: ["design-x"],
    });

    expect(mockAssignmentService.getAvailableItems).toHaveBeenCalledWith(
      "company-1",
      "project-1",
      false,
      true,
      ["design-x"],
    );
  });

  it("works without experimentDesignUuids (backward compat)", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(PROJECT);
    mockAssignmentService.getAvailableItems.mockResolvedValue({ ideas: [], tasks: [] });

    await toolHandlers["synapse_get_available_experiment_runs"]({
      researchProjectUuid: "project-1",
    });

    expect(mockAssignmentService.getAvailableItems).toHaveBeenCalledWith(
      "company-1",
      "project-1",
      false,
      true,
      undefined,
    );
  });

  it("still checks project existence", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(null);

    const result = await toolHandlers["synapse_get_available_experiment_runs"]({
      researchProjectUuid: "nonexistent",
      experimentDesignUuids: ["design-x"],
    });

    expect(result).toEqual(
      expect.objectContaining({ isError: true }),
    );
    expect(mockAssignmentService.getAvailableItems).not.toHaveBeenCalled();
  });
});

// ===== synapse_get_unblocked_experiment_runs =====

describe("synapse_get_unblocked_experiment_runs — experimentDesignUuids", () => {
  it("passes experimentDesignUuids to experimentRunService.getUnblockedTasks when provided", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(PROJECT);
    mockExperimentRunService.getUnblockedTasks.mockResolvedValue({ tasks: [], total: 0 });

    await toolHandlers["synapse_get_unblocked_experiment_runs"]({
      researchProjectUuid: "project-1",
      experimentDesignUuids: ["design-1", "design-2"],
    });

    expect(mockExperimentRunService.getUnblockedTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalUuids: ["design-1", "design-2"],
      }),
    );
  });

  it("works without experimentDesignUuids (backward compat)", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(PROJECT);
    mockExperimentRunService.getUnblockedTasks.mockResolvedValue({ tasks: [], total: 0 });

    await toolHandlers["synapse_get_unblocked_experiment_runs"]({
      researchProjectUuid: "project-1",
    });

    expect(mockExperimentRunService.getUnblockedTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: "company-1",
        projectUuid: "project-1",
      }),
    );
    const callArg = mockExperimentRunService.getUnblockedTasks.mock.calls[0][0];
    expect(callArg.proposalUuids).toBeUndefined();
  });

  it("still checks project existence", async () => {
    mockResearchProjectService.getProjectByUuid.mockResolvedValue(null);

    const result = await toolHandlers["synapse_get_unblocked_experiment_runs"]({
      researchProjectUuid: "nonexistent",
      experimentDesignUuids: ["design-1"],
    });

    expect(result).toEqual(
      expect.objectContaining({ isError: true }),
    );
    expect(mockExperimentRunService.getUnblockedTasks).not.toHaveBeenCalled();
  });
});

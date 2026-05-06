import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  researchProject: {
    findFirst: vi.fn(),
  },
  experiment: {
    findMany: vi.fn(),
  },
  relatedWork: {
    findFirst: vi.fn(),
  },
  agent: {
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { getProjectAgentActivity } from "@/services/agent-activity.service";

const COMPANY = "test-company-activity";
const PROJECT = "proj-activity-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.researchProject.findFirst.mockResolvedValue({
    uuid: PROJECT,
    autoSearchActiveAgentUuid: null,
    deepResearchActiveAgentUuid: null,
    synthesisActiveAgentUuid: null,
  });
  mockPrisma.experiment.findMany.mockResolvedValue([]);
  mockPrisma.relatedWork.findFirst.mockResolvedValue(null);
  mockPrisma.agent.findMany.mockResolvedValue([]);
});

describe("getProjectAgentActivity", () => {
  it("returns empty activity sections when nothing is active", async () => {
    const result = await getProjectAgentActivity({
      companyUuid: COMPANY,
      projectUuid: PROJECT,
    });

    expect(result).toEqual({
      relatedWorks: [],
      experiments: [],
      researchQuestions: [],
      insights: [],
      documents: [],
    });
    expect(mockPrisma.agent.findMany).not.toHaveBeenCalled();
  });

  it("returns empty when the project is not found", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue(null);
    const result = await getProjectAgentActivity({
      companyUuid: COMPANY,
      projectUuid: PROJECT,
    });
    expect(result.experiments).toEqual([]);
    expect(result.relatedWorks).toEqual([]);
    expect(mockPrisma.experiment.findMany).not.toHaveBeenCalled();
  });

  it("lists assignee agents for experiments with a live status", async () => {
    mockPrisma.experiment.findMany.mockResolvedValue([
      { assigneeUuid: "agent-exp-1" },
      { assigneeUuid: "agent-exp-1" }, // duplicate
      { assigneeUuid: "agent-exp-2" },
    ]);
    mockPrisma.agent.findMany.mockResolvedValue([
      { uuid: "agent-exp-1", name: "Alice", color: "orange", type: "openclaw" },
      { uuid: "agent-exp-2", name: "Bob", color: null, type: "claude_code" },
    ]);

    const result = await getProjectAgentActivity({
      companyUuid: COMPANY,
      projectUuid: PROJECT,
    });

    // Experiment findMany uses liveStatus in the set and assigneeType=agent
    expect(mockPrisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          assigneeType: "agent",
          OR: expect.arrayContaining([
            expect.objectContaining({ status: "in_progress" }),
            expect.objectContaining({
              liveStatus: expect.objectContaining({
                in: expect.arrayContaining([
                  "sent",
                  "ack",
                  "checking_resources",
                  "queuing",
                  "running",
                ]),
              }),
            }),
          ]),
        }),
      })
    );

    expect(result.experiments).toEqual([
      { uuid: "agent-exp-1", name: "Alice", color: "orange", type: "openclaw" },
      { uuid: "agent-exp-2", name: "Bob", color: null, type: "claude_code" },
    ]);
    expect(result.relatedWorks).toEqual([]);
  });

  it("lists the auto-search agent while auto-search is active", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({
      uuid: PROJECT,
      autoSearchActiveAgentUuid: "agent-search-1",
      deepResearchActiveAgentUuid: null,
      synthesisActiveAgentUuid: null,
    });
    mockPrisma.agent.findMany.mockResolvedValue([
      { uuid: "agent-search-1", name: "Searcher", color: "violet", type: "openclaw" },
    ]);

    const result = await getProjectAgentActivity({
      companyUuid: COMPANY,
      projectUuid: PROJECT,
    });

    expect(mockPrisma.relatedWork.findFirst).not.toHaveBeenCalled();

    expect(result.relatedWorks).toEqual([
      { uuid: "agent-search-1", name: "Searcher", color: "violet", type: "openclaw" },
    ]);
    expect(result.experiments).toEqual([]);
  });

  it("does not list the auto-search agent when auto-search is disabled", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({
      uuid: PROJECT,
      autoSearchActiveAgentUuid: null,
      deepResearchActiveAgentUuid: null,
      synthesisActiveAgentUuid: null,
    });

    const result = await getProjectAgentActivity({
      companyUuid: COMPANY,
      projectUuid: PROJECT,
    });

    expect(mockPrisma.relatedWork.findFirst).not.toHaveBeenCalled();
    expect(result.relatedWorks).toEqual([]);
  });

  it("does not list the auto-search agent when no recent related work exists", async () => {
    mockPrisma.researchProject.findFirst.mockResolvedValue({
      uuid: PROJECT,
      autoSearchActiveAgentUuid: null,
      deepResearchActiveAgentUuid: null,
      synthesisActiveAgentUuid: null,
    });

    const result = await getProjectAgentActivity({
      companyUuid: COMPANY,
      projectUuid: PROJECT,
    });

    expect(result.relatedWorks).toEqual([]);
  });
});

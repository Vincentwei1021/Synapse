import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockPrisma = vi.hoisted(() => ({
  paperFeedRun: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockRecordPaperFeedItems = vi.hoisted(() => vi.fn());
const mockCompletePaperFeedRun = vi.hoisted(() => vi.fn());
vi.mock("@/services/paper-feed.service", () => ({
  recordPaperFeedItems: mockRecordPaperFeedItems,
  completePaperFeedRun: mockCompletePaperFeedRun,
}));

const mockFetchDailyPapers = vi.hoisted(() => vi.fn());
vi.mock("@/services/huggingface-papers.service", () => ({
  fetchDailyPapers: mockFetchDailyPapers,
}));

import { registerPaperFeedTools } from "@/mcp/tools/paper-feeds";

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

function makeServer() {
  const tools = new Map<string, ToolHandler>();
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    }),
  } as unknown as McpServer;

  return { server, tools };
}

const auth = {
  type: "agent" as const,
  companyUuid: "co-1",
  actorUuid: "agent-1",
  roles: [],
  agentName: "Test Agent",
};

describe("paper feed MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("synapse_get_huggingface_daily_papers", () => {
    it("calls fetchDailyPapers and returns mapped result", async () => {
      mockFetchDailyPapers.mockResolvedValueOnce([
        {
          id: "x",
          title: "T",
          authors: "",
          summary: "abs",
          arxivId: "x",
          publishedAt: null,
          paperUrl: "url",
        },
      ]);

      const { server, tools } = makeServer();
      registerPaperFeedTools(server, auth);
      const handler = tools.get("synapse_get_huggingface_daily_papers")!;
      expect(handler).toBeDefined();

      const result = await handler({ date: "2026-05-26" });

      expect(mockFetchDailyPapers).toHaveBeenCalledWith("2026-05-26");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.papers[0].title).toBe("T");
    });
  });

  describe("synapse_record_paper_feed_items", () => {
    it("happy path — persists items via service", async () => {
      mockPrisma.paperFeedRun.findFirst.mockResolvedValueOnce({
        researchProjectUuid: "proj-1",
      });
      mockRecordPaperFeedItems.mockResolvedValueOnce({ inserted: 2, skipped: 1 });

      const { server, tools } = makeServer();
      registerPaperFeedTools(server, auth);
      const handler = tools.get("synapse_record_paper_feed_items")!;

      const items = [
        {
          paperId: "p1",
          title: "Title 1",
          authors: "A",
          abstract: "abs",
          paperUrl: "url1",
          summary: "sum1",
          relevanceNote: "note1",
        },
        {
          paperId: "p2",
          title: "Title 2",
          authors: "B",
          abstract: "abs2",
          paperUrl: "url2",
          summary: "sum2",
          relevanceNote: "note2",
        },
      ];

      const result = await handler({ feedRunUuid: "run-1", items });

      expect(mockRecordPaperFeedItems).toHaveBeenCalledWith({
        companyUuid: "co-1",
        researchProjectUuid: "proj-1",
        feedRunUuid: "run-1",
        items,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.inserted).toBe(2);
      expect(parsed.skipped).toBe(1);
    });

    it("run not found returns isError", async () => {
      mockPrisma.paperFeedRun.findFirst.mockResolvedValueOnce(null);

      const { server, tools } = makeServer();
      registerPaperFeedTools(server, auth);
      const handler = tools.get("synapse_record_paper_feed_items")!;

      const result = await handler({ feedRunUuid: "missing", items: [] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Paper feed run not found");
      expect(mockRecordPaperFeedItems).not.toHaveBeenCalled();
    });
  });

  describe("synapse_complete_paper_feed_run", () => {
    it("happy path — terminates run", async () => {
      mockPrisma.paperFeedRun.findFirst.mockResolvedValueOnce({ uuid: "run-1" });
      mockCompletePaperFeedRun.mockResolvedValueOnce(undefined);

      const { server, tools } = makeServer();
      registerPaperFeedTools(server, auth);
      const handler = tools.get("synapse_complete_paper_feed_run")!;

      const result = await handler({ feedRunUuid: "run-1", status: "completed" });

      expect(mockCompletePaperFeedRun).toHaveBeenCalledWith({
        feedRunUuid: "run-1",
        status: "completed",
        errorMessage: undefined,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.ok).toBe(true);
    });
  });

  describe("synapse_get_paper_feed_run", () => {
    it("happy path — returns project + feedDate context", async () => {
      mockPrisma.paperFeedRun.findFirst.mockResolvedValueOnce({
        uuid: "run-1",
        status: "running",
        feedDate: new Date("2026-05-26T00:00:00.000Z"),
        researchProject: { uuid: "proj-1", name: "Demo" },
      });

      const { server, tools } = makeServer();
      registerPaperFeedTools(server, auth);
      const handler = tools.get("synapse_get_paper_feed_run")!;

      const result = await handler({ feedRunUuid: "run-1" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.run.feedDate).toBe("2026-05-26");
      expect(parsed.run.project.name).toBe("Demo");
    });
  });
});

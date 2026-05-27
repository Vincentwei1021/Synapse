import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  researchProject: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  paperFeedRun: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  paperFeedItem: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  relatedWork: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// ===== Service mocks =====
const mockNotificationCreate = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/services/notification.service", () => ({
  create: mockNotificationCreate,
}));

import {
  enablePaperFeed,
  disablePaperFeed,
  triggerPaperFeedRun,
  recordPaperFeedItems,
  completePaperFeedRun,
  reapStalePaperFeedRuns,
  listPaperFeedItems,
  promoteFeedItemToRelatedWork,
} from "@/services/paper-feed.service";

const COMPANY = "company-1";
const PROJECT = "project-1";
const AGENT = "agent-1";

describe("paper-feed.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enablePaperFeed", () => {
    it("enables feed when agent is openclaw and has paper_feeds role", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        type: "openclaw",
        roles: ["researcher", "paper_feeds"],
      });
      mockPrisma.researchProject.update.mockResolvedValue({});

      await enablePaperFeed({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        agentUuid: AGENT,
      });

      expect(mockPrisma.agent.findFirst).toHaveBeenCalledWith({
        where: { uuid: AGENT, companyUuid: COMPANY },
        select: { type: true, roles: true },
      });
      expect(mockPrisma.researchProject.update).toHaveBeenCalledWith({
        where: { uuid: PROJECT },
        data: { paperFeedEnabled: true, paperFeedAgentUuid: AGENT },
      });
    });

    it("rejects claude_code (non-realtime) agent", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        type: "claude_code",
        roles: ["paper_feeds"],
      });

      await expect(
        enablePaperFeed({
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          agentUuid: AGENT,
        })
      ).rejects.toThrow(/realtime/i);

      expect(mockPrisma.researchProject.update).not.toHaveBeenCalled();
    });

    it("rejects openclaw agent missing paper_feeds role", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({
        type: "openclaw",
        roles: ["researcher", "experiment"],
      });

      await expect(
        enablePaperFeed({
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          agentUuid: AGENT,
        })
      ).rejects.toThrow(/paper_feeds/);

      expect(mockPrisma.researchProject.update).not.toHaveBeenCalled();
    });
  });

  describe("disablePaperFeed", () => {
    it("clears paperFeedEnabled flag", async () => {
      mockPrisma.researchProject.update.mockResolvedValue({});

      await disablePaperFeed({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
      });

      expect(mockPrisma.researchProject.update).toHaveBeenCalledWith({
        where: { uuid: PROJECT },
        data: { paperFeedEnabled: false },
      });
    });
  });

  describe("triggerPaperFeedRun", () => {
    const FEED_DATE = "2026-05-26";
    const FEED_DATE_OBJ = new Date("2026-05-26T00:00:00.000Z");

    function projectFixture() {
      return {
        uuid: PROJECT,
        name: "Test Project",
        paperFeedAgentUuid: AGENT,
      };
    }

    it("creates a new pending run, sets active flags, and notifies (no existing run)", async () => {
      mockPrisma.researchProject.findFirst.mockResolvedValue(projectFixture());
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue(null);
      mockPrisma.paperFeedRun.create.mockResolvedValue({ uuid: "run-new" });
      mockPrisma.researchProject.update.mockResolvedValue({});

      const result = await triggerPaperFeedRun({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        triggeredBy: "cron",
        feedDate: FEED_DATE,
      });

      expect(result).toEqual({ runUuid: "run-new", reused: false });

      expect(mockPrisma.paperFeedRun.findUnique).toHaveBeenCalledWith({
        where: {
          researchProjectUuid_feedDate: {
            researchProjectUuid: PROJECT,
            feedDate: FEED_DATE_OBJ,
          },
        },
      });

      expect(mockPrisma.paperFeedRun.create).toHaveBeenCalledWith({
        data: {
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          agentUuid: AGENT,
          feedDate: FEED_DATE_OBJ,
          status: "pending",
          triggeredBy: "cron",
        },
      });

      expect(mockPrisma.researchProject.update).toHaveBeenCalledWith({
        where: { uuid: PROJECT },
        data: {
          paperFeedActiveAgentUuid: AGENT,
          paperFeedStartedAt: expect.any(Date),
        },
      });

      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationCreate).toHaveBeenCalledWith({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        recipientType: "agent",
        recipientUuid: AGENT,
        entityType: "paper_feed_run",
        entityUuid: "run-new",
        entityTitle: "Test Project",
        projectName: "Test Project",
        action: "paper_feed_triggered",
        message: FEED_DATE,
        actorType: "user",
        actorUuid: "system",
        actorName: "Synapse cron",
      });
    });

    it("returns reused for completed run and does not notify", async () => {
      mockPrisma.researchProject.findFirst.mockResolvedValue(projectFixture());
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        uuid: "run-completed",
        status: "completed",
      });

      const result = await triggerPaperFeedRun({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        triggeredBy: "manual",
        feedDate: FEED_DATE,
      });

      expect(result).toEqual({ runUuid: "run-completed", reused: true });
      expect(mockPrisma.paperFeedRun.create).not.toHaveBeenCalled();
      expect(mockPrisma.paperFeedRun.update).not.toHaveBeenCalled();
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });

    it("retries failed run by resetting to pending and re-notifies", async () => {
      mockPrisma.researchProject.findFirst.mockResolvedValue(projectFixture());
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        uuid: "run-failed",
        status: "failed",
      });
      mockPrisma.paperFeedRun.update.mockResolvedValue({});
      mockPrisma.researchProject.update.mockResolvedValue({});

      const result = await triggerPaperFeedRun({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        triggeredBy: "manual",
        feedDate: FEED_DATE,
      });

      expect(result).toEqual({ runUuid: "run-failed", reused: false });

      expect(mockPrisma.paperFeedRun.update).toHaveBeenCalledWith({
        where: { uuid: "run-failed" },
        data: {
          status: "pending",
          errorMessage: null,
          startedAt: expect.any(Date),
          completedAt: null,
          triggeredBy: "manual",
          paperCount: 0,
        },
      });

      expect(mockPrisma.paperFeedRun.create).not.toHaveBeenCalled();

      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "paper_feed_triggered",
          entityUuid: "run-failed",
          message: FEED_DATE,
          actorType: "user",
          actorUuid: "system",
          actorName: "User",
        })
      );
    });

    it("returns reused for running run without notifying", async () => {
      mockPrisma.researchProject.findFirst.mockResolvedValue(projectFixture());
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        uuid: "run-running",
        status: "running",
      });

      const result = await triggerPaperFeedRun({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        triggeredBy: "cron",
        feedDate: FEED_DATE,
      });

      expect(result).toEqual({ runUuid: "run-running", reused: true });
      expect(mockPrisma.paperFeedRun.create).not.toHaveBeenCalled();
      expect(mockPrisma.paperFeedRun.update).not.toHaveBeenCalled();
      expect(mockNotificationCreate).not.toHaveBeenCalled();
    });
  });

  describe("recordPaperFeedItems", () => {
    const FEED_RUN = "run-1";
    const FEED_DATE_OBJ = new Date("2026-05-26T00:00:00.000Z");

    it("dedups by paperId and transitions pending → running", async () => {
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        feedDate: FEED_DATE_OBJ,
        status: "pending",
      });
      // 1st item: not found, 2nd: found (dup), 3rd: not found
      mockPrisma.paperFeedItem.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ uuid: "existing" })
        .mockResolvedValueOnce(null);
      mockPrisma.paperFeedItem.create.mockResolvedValue({});
      mockPrisma.paperFeedRun.update.mockResolvedValue({});

      const result = await recordPaperFeedItems({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        feedRunUuid: FEED_RUN,
        items: [
          {
            paperId: "p1",
            title: "Paper One",
            authors: "Alice",
            abstract: "Abs 1",
            paperUrl: "https://example.com/p1",
            summary: "Sum 1",
            relevanceNote: "Rel 1",
          },
          {
            paperId: "p2",
            title: "Paper Two",
            authors: "Bob",
            abstract: "Abs 2",
            paperUrl: "https://example.com/p2",
            summary: "Sum 2",
            relevanceNote: "Rel 2",
            arxivId: "2501.0002",
          },
          {
            paperId: "p3",
            title: "Paper Three",
            authors: "Carol",
            abstract: "Abs 3",
            paperUrl: "https://example.com/p3",
            summary: "Sum 3",
            relevanceNote: "Rel 3",
          },
        ],
      });

      expect(result).toEqual({ inserted: 2, skipped: 1 });

      expect(mockPrisma.paperFeedItem.findUnique).toHaveBeenCalledTimes(3);
      expect(mockPrisma.paperFeedItem.findUnique).toHaveBeenNthCalledWith(1, {
        where: {
          researchProjectUuid_paperId: {
            researchProjectUuid: PROJECT,
            paperId: "p1",
          },
        },
      });

      expect(mockPrisma.paperFeedItem.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.paperFeedItem.create).toHaveBeenNthCalledWith(1, {
        data: {
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          feedRunUuid: FEED_RUN,
          feedDate: FEED_DATE_OBJ,
          paperId: "p1",
          arxivId: "p1",
          title: "Paper One",
          authors: "Alice",
          abstract: "Abs 1",
          paperUrl: "https://example.com/p1",
          summary: "Sum 1",
          relevanceNote: "Rel 1",
        },
      });
      // 3rd item — note arxivId fallback to paperId since arxivId is undefined
      expect(mockPrisma.paperFeedItem.create).toHaveBeenNthCalledWith(2, {
        data: {
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          feedRunUuid: FEED_RUN,
          feedDate: FEED_DATE_OBJ,
          paperId: "p3",
          arxivId: "p3",
          title: "Paper Three",
          authors: "Carol",
          abstract: "Abs 3",
          paperUrl: "https://example.com/p3",
          summary: "Sum 3",
          relevanceNote: "Rel 3",
        },
      });

      // pending → running transition
      expect(mockPrisma.paperFeedRun.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.paperFeedRun.update).toHaveBeenCalledWith({
        where: { uuid: FEED_RUN },
        data: { status: "running" },
      });
    });

    it("does NOT update status when run is already running", async () => {
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        feedDate: FEED_DATE_OBJ,
        status: "running",
      });
      mockPrisma.paperFeedItem.findUnique.mockResolvedValueOnce(null);
      mockPrisma.paperFeedItem.create.mockResolvedValue({});

      const result = await recordPaperFeedItems({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        feedRunUuid: FEED_RUN,
        items: [
          {
            paperId: "p1",
            title: "Paper One",
            authors: "Alice",
            abstract: "Abs 1",
            paperUrl: "https://example.com/p1",
            summary: "Sum 1",
            relevanceNote: "Rel 1",
          },
        ],
      });

      expect(result).toEqual({ inserted: 1, skipped: 0 });
      expect(mockPrisma.paperFeedItem.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.paperFeedRun.update).not.toHaveBeenCalled();
    });
  });

  describe("completePaperFeedRun", () => {
    const FEED_RUN = "run-1";
    const FEED_DATE_OBJ = new Date("2026-05-26T00:00:00.000Z");

    it("marks status=completed, clears active flags, and notifies owner", async () => {
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        uuid: FEED_RUN,
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        agentUuid: AGENT,
        feedDate: FEED_DATE_OBJ,
      });
      mockPrisma.paperFeedItem.count.mockResolvedValue(7);
      mockPrisma.paperFeedRun.update.mockResolvedValue({});
      mockPrisma.researchProject.update.mockResolvedValue({});
      mockPrisma.researchProject.findUnique.mockResolvedValue({
        name: "Test Project",
      });
      mockPrisma.agent.findUnique.mockResolvedValue({
        ownerUuid: "owner-1",
        name: "Paper Bot",
      });

      await completePaperFeedRun({
        feedRunUuid: FEED_RUN,
        status: "completed",
      });

      expect(mockPrisma.paperFeedRun.update).toHaveBeenCalledWith({
        where: { uuid: FEED_RUN },
        data: {
          status: "completed",
          completedAt: expect.any(Date),
          paperCount: 7,
          errorMessage: null,
        },
      });

      expect(mockPrisma.researchProject.update).toHaveBeenCalledWith({
        where: { uuid: PROJECT },
        data: {
          paperFeedActiveAgentUuid: null,
          paperFeedStartedAt: null,
          paperFeedLastRunAt: expect.any(Date),
        },
      });

      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationCreate).toHaveBeenCalledWith({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        recipientType: "user",
        recipientUuid: "owner-1",
        entityType: "paper_feed_run",
        entityUuid: FEED_RUN,
        entityTitle: "Test Project",
        projectName: "Test Project",
        action: "paper_feed_completed",
        message: "Paper Feed for 2026-05-26 ready: 7 relevant papers.",
        actorType: "agent",
        actorUuid: AGENT,
        actorName: "Paper Bot",
      });
    });

    it("marks status=failed with errorMessage and notifies owner", async () => {
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        uuid: FEED_RUN,
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        agentUuid: AGENT,
        feedDate: FEED_DATE_OBJ,
      });
      mockPrisma.paperFeedItem.count.mockResolvedValue(0);
      mockPrisma.paperFeedRun.update.mockResolvedValue({});
      mockPrisma.researchProject.update.mockResolvedValue({});
      mockPrisma.researchProject.findUnique.mockResolvedValue({
        name: "Test Project",
      });
      mockPrisma.agent.findUnique.mockResolvedValue({
        ownerUuid: "owner-1",
        name: "Paper Bot",
      });

      await completePaperFeedRun({
        feedRunUuid: FEED_RUN,
        status: "failed",
        errorMessage: "boom",
      });

      expect(mockPrisma.paperFeedRun.update).toHaveBeenCalledWith({
        where: { uuid: FEED_RUN },
        data: {
          status: "failed",
          completedAt: expect.any(Date),
          paperCount: 0,
          errorMessage: "boom",
        },
      });

      expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "paper_feed_failed",
          message: "Paper Feed for 2026-05-26 failed: boom",
          actorType: "agent",
          actorUuid: AGENT,
          actorName: "Paper Bot",
        })
      );
    });
  });

  describe("reapStalePaperFeedRuns", () => {
    const FEED_DATE_OBJ = new Date("2026-05-26T00:00:00.000Z");

    it("finds stale running rows and marks them failed via completePaperFeedRun", async () => {
      mockPrisma.paperFeedRun.findMany.mockResolvedValue([
        { uuid: "stale-1" },
        { uuid: "stale-2" },
      ]);
      // completePaperFeedRun is invoked once per stale row.
      mockPrisma.paperFeedRun.findUnique.mockResolvedValue({
        uuid: "stale-x",
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        agentUuid: AGENT,
        feedDate: FEED_DATE_OBJ,
      });
      mockPrisma.paperFeedItem.count.mockResolvedValue(0);
      mockPrisma.paperFeedRun.update.mockResolvedValue({});
      mockPrisma.researchProject.update.mockResolvedValue({});
      mockPrisma.researchProject.findUnique.mockResolvedValue({
        name: "Test Project",
      });
      mockPrisma.agent.findUnique.mockResolvedValue({
        ownerUuid: "owner-1",
        name: "Paper Bot",
      });

      const reaped = await reapStalePaperFeedRuns();

      expect(reaped).toBe(2);

      expect(mockPrisma.paperFeedRun.findMany).toHaveBeenCalledWith({
        where: {
          status: "running",
          startedAt: { lt: expect.any(Date) },
        },
        select: { uuid: true },
      });

      // completePaperFeedRun → paperFeedRun.update with status=failed twice.
      expect(mockPrisma.paperFeedRun.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.paperFeedRun.update).toHaveBeenNthCalledWith(1, {
        where: { uuid: "stale-x" },
        data: {
          status: "failed",
          completedAt: expect.any(Date),
          paperCount: 0,
          errorMessage: "timeout",
        },
      });
      expect(mockPrisma.paperFeedRun.update).toHaveBeenNthCalledWith(2, {
        where: { uuid: "stale-x" },
        data: {
          status: "failed",
          completedAt: expect.any(Date),
          paperCount: 0,
          errorMessage: "timeout",
        },
      });
    });
  });

  describe("listPaperFeedItems", () => {
    it("groups items by feedDate in descending order", async () => {
      const date26 = new Date("2026-05-26T00:00:00.000Z");
      const date25 = new Date("2026-05-25T00:00:00.000Z");
      mockPrisma.paperFeedItem.findMany.mockResolvedValue([
        {
          uuid: "item-1",
          feedDate: date26,
          paperId: "p1",
          arxivId: "2401.A",
          title: "Paper One",
          authors: "Alice",
          abstract: "Abs 1",
          paperUrl: "https://example.com/p1",
          summary: "Sum 1",
          relevanceNote: "Rel 1",
          relatedWorkUuid: null,
        },
        {
          uuid: "item-2",
          feedDate: date26,
          paperId: "p2",
          arxivId: null,
          title: "Paper Two",
          authors: "Bob",
          abstract: "Abs 2",
          paperUrl: "https://example.com/p2",
          summary: "Sum 2",
          relevanceNote: "Rel 2",
          relatedWorkUuid: "rw-2",
        },
        {
          uuid: "item-3",
          feedDate: date25,
          paperId: "p3",
          arxivId: "2401.B",
          title: "Paper Three",
          authors: "Carol",
          abstract: "Abs 3",
          paperUrl: "https://example.com/p3",
          summary: "Sum 3",
          relevanceNote: "Rel 3",
          relatedWorkUuid: null,
        },
      ]);

      const result = await listPaperFeedItems({
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
      });

      expect(result).toHaveLength(2);
      expect(result[0].feedDate).toBe("2026-05-26");
      expect(result[0].items).toHaveLength(2);
      expect(result[0].items[0].uuid).toBe("item-1");
      expect(result[0].items[1].uuid).toBe("item-2");
      expect(result[1].feedDate).toBe("2026-05-25");
      expect(result[1].items).toHaveLength(1);
      expect(result[1].items[0].uuid).toBe("item-3");

      expect(mockPrisma.paperFeedItem.findMany).toHaveBeenCalledWith({
        where: { companyUuid: COMPANY, researchProjectUuid: PROJECT },
        orderBy: [{ feedDate: "desc" }, { createdAt: "asc" }],
      });
    });
  });

  describe("promoteFeedItemToRelatedWork", () => {
    it("creates a RelatedWork from the feed item and back-links", async () => {
      mockPrisma.paperFeedItem.findFirst.mockResolvedValue({
        uuid: "item-1",
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        title: "Paper One",
        authors: "Alice",
        abstract: "Abs 1",
        paperUrl: "https://hf/p",
        arxivId: "2401.A",
        relevanceNote: "matches dataset Y",
        relatedWorkUuid: null,
      });
      mockPrisma.relatedWork.create.mockResolvedValue({
        uuid: "rw-1",
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        title: "Paper One",
        authors: "Alice",
        abstract: "Abs 1",
        url: "https://hf/p",
        arxivId: "2401.A",
        source: "paper_feeds",
        addedBy: "user",
        addedNote: "matches dataset Y",
      });
      mockPrisma.paperFeedItem.update.mockResolvedValue({});

      const result = await promoteFeedItemToRelatedWork({
        companyUuid: COMPANY,
        paperFeedItemUuid: "item-1",
      });

      expect(mockPrisma.relatedWork.create).toHaveBeenCalledWith({
        data: {
          companyUuid: COMPANY,
          researchProjectUuid: PROJECT,
          title: "Paper One",
          authors: "Alice",
          abstract: "Abs 1",
          url: "https://hf/p",
          arxivId: "2401.A",
          source: "paper_feeds",
          addedBy: "user",
          addedNote: "matches dataset Y",
        },
      });

      expect(mockPrisma.paperFeedItem.update).toHaveBeenCalledWith({
        where: { uuid: "item-1" },
        data: { relatedWorkUuid: "rw-1" },
      });

      expect(result).toEqual(
        expect.objectContaining({
          uuid: "rw-1",
          source: "paper_feeds",
          addedNote: "matches dataset Y",
          arxivId: "2401.A",
          addedBy: "user",
        })
      );
    });

    it("is idempotent when item is already promoted", async () => {
      mockPrisma.paperFeedItem.findFirst.mockResolvedValue({
        uuid: "item-1",
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        title: "Paper One",
        authors: "Alice",
        abstract: "Abs 1",
        paperUrl: "https://hf/p",
        arxivId: "2401.A",
        relevanceNote: "matches dataset Y",
        relatedWorkUuid: "rw-existing",
      });
      const existingRw = {
        uuid: "rw-existing",
        companyUuid: COMPANY,
        researchProjectUuid: PROJECT,
        title: "Paper One",
        source: "paper_feeds",
        addedNote: "matches dataset Y",
      };
      mockPrisma.relatedWork.findUnique.mockResolvedValue(existingRw);

      const result = await promoteFeedItemToRelatedWork({
        companyUuid: COMPANY,
        paperFeedItemUuid: "item-1",
      });

      expect(mockPrisma.relatedWork.findUnique).toHaveBeenCalledWith({
        where: { uuid: "rw-existing" },
      });
      expect(mockPrisma.relatedWork.create).not.toHaveBeenCalled();
      expect(mockPrisma.paperFeedItem.update).not.toHaveBeenCalled();
      expect(result).toBe(existingRw);
    });
  });
});

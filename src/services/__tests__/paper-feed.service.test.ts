import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findFirst: vi.fn(),
  },
  researchProject: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  paperFeedRun: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
});

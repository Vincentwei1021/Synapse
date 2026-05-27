import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import {
  recordPaperFeedItems,
  completePaperFeedRun,
} from "@/services/paper-feed.service";
import { fetchDailyPapers } from "@/services/huggingface-papers.service";
import { prisma } from "@/lib/prisma";

export function registerPaperFeedTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_get_huggingface_daily_papers",
    {
      description:
        "Fetch HuggingFace Daily Papers for a specific date. Returns the day's curated arXiv papers with abstracts. Use as the input list for a Paper Feeds run.",
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD (UTC)"),
      }),
    },
    async ({ date }) => {
      const papers = await fetchDailyPapers(date);
      return { content: [{ type: "text" as const, text: JSON.stringify({ papers }, null, 2) }] };
    },
  );

  server.registerTool(
    "synapse_record_paper_feed_items",
    {
      description:
        "Bulk-persist relevant papers for a Paper Feeds run. Server dedupes by (project, paperId).",
      inputSchema: z.object({
        feedRunUuid: z.string(),
        items: z.array(z.object({
          paperId: z.string(),
          title: z.string(),
          authors: z.string(),
          abstract: z.string(),
          paperUrl: z.string(),
          summary: z.string(),
          relevanceNote: z.string(),
          arxivId: z.string().optional(),
        })),
      }),
    },
    async ({ feedRunUuid, items }) => {
      const run = await prisma.paperFeedRun.findFirst({
        where: { uuid: feedRunUuid, companyUuid: auth.companyUuid },
        select: { researchProjectUuid: true },
      });
      if (!run) {
        return { content: [{ type: "text" as const, text: "Paper feed run not found" }], isError: true };
      }
      const result = await recordPaperFeedItems({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        feedRunUuid,
        items,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "synapse_complete_paper_feed_run",
    {
      description:
        "Terminate a Paper Feeds run. Use status='completed' when finished, 'failed' on unrecoverable error.",
      inputSchema: z.object({
        feedRunUuid: z.string(),
        status: z.enum(["completed", "failed"]),
        errorMessage: z.string().optional(),
      }),
    },
    async ({ feedRunUuid, status, errorMessage }) => {
      const run = await prisma.paperFeedRun.findFirst({
        where: { uuid: feedRunUuid, companyUuid: auth.companyUuid },
        select: { uuid: true },
      });
      if (!run) {
        return { content: [{ type: "text" as const, text: "Paper feed run not found" }], isError: true };
      }
      await completePaperFeedRun({ feedRunUuid, status, errorMessage });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }] };
    },
  );

  server.registerTool(
    "synapse_get_paper_feed_run",
    {
      description: "Read a Paper Feeds run's project + feedDate context. Use if the agent restarts mid-run.",
      inputSchema: z.object({ feedRunUuid: z.string() }),
    },
    async ({ feedRunUuid }) => {
      const run = await prisma.paperFeedRun.findFirst({
        where: { uuid: feedRunUuid, companyUuid: auth.companyUuid },
        include: { researchProject: { select: { uuid: true, name: true } } },
      });
      if (!run) {
        return { content: [{ type: "text" as const, text: "Paper feed run not found" }], isError: true };
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            run: {
              uuid: run.uuid,
              status: run.status,
              feedDate: run.feedDate.toISOString().slice(0, 10),
              project: run.researchProject,
            },
          }),
        }],
      };
    },
  );
}

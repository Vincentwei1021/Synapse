import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { createRelatedWork, listRelatedWorks } from "@/services/related-work.service";
import { prisma } from "@/lib/prisma";
import * as documentService from "@/services/document.service";
import * as notificationService from "@/services/notification.service";
import { updateResearchProject } from "@/services/research-project.service";
import { eventBus } from "@/lib/event-bus";

const TASK_TYPE_FIELDS = {
  auto_search: { activeField: "autoSearchActiveAgentUuid", notificationAction: "auto_search_completed" },
  deep_research: { activeField: "deepResearchActiveAgentUuid", notificationAction: "deep_research_completed" },
} as const;

const TASK_COMPLETION_MESSAGES = {
  auto_search: "Auto-search for related papers has completed.",
  deep_research: "Deep research literature review has completed.",
} as const;

export function registerLiteratureTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_search_papers",
    {
      description: "Search for academic papers. Uses DeepXiv hybrid search (BM25 + vector) over arXiv, with arXiv API as fallback. Returns titles, abstracts, authors, and URLs.",
      inputSchema: z.object({
        query: z.string().describe("Search query, e.g. 'speech recognition Chinese accent'"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    },
    async ({ query, limit }) => {
      try {
        const { searchPapers } = await import("@/services/paper-search.service");
        const papers = await searchPapers(query, limit);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ papers }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Paper search failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "synapse_read_paper_brief",
    {
      description: "Get a brief summary of an arXiv paper: TLDR, keywords, citation count, GitHub URL. ~500 tokens.",
      inputSchema: z.object({
        arxivId: z.string().describe("arXiv paper ID, e.g. '2301.07041'"),
      }),
    },
    async ({ arxivId }) => {
      try {
        const { readPaperBrief } = await import("@/services/paper-search.service");
        const result = await readPaperBrief(arxivId);
        if (!result) {
          return { content: [{ type: "text" as const, text: `Paper not found: ${arxivId}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "synapse_read_paper_head",
    {
      description: "Get paper structure with section names, per-section TLDRs, and token counts. Use to plan which sections to read. ~1-2k tokens.",
      inputSchema: z.object({
        arxivId: z.string().describe("arXiv paper ID, e.g. '2301.07041'"),
      }),
    },
    async ({ arxivId }) => {
      try {
        const { readPaperHead } = await import("@/services/paper-search.service");
        const result = await readPaperHead(arxivId);
        if (!result) {
          return { content: [{ type: "text" as const, text: `Paper not found: ${arxivId}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "synapse_read_paper_section",
    {
      description: "Read the full text of a specific section from an arXiv paper. Use synapse_read_paper_head first to discover section names. ~1-5k tokens.",
      inputSchema: z.object({
        arxivId: z.string().describe("arXiv paper ID, e.g. '2301.07041'"),
        sectionName: z.string().describe("Exact section name from the paper head"),
      }),
    },
    async ({ arxivId, sectionName }) => {
      try {
        const { readPaperSection } = await import("@/services/paper-search.service");
        const result = await readPaperSection(arxivId, sectionName);
        if (!result) {
          return { content: [{ type: "text" as const, text: `Section not found: "${sectionName}" in paper ${arxivId}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: result.content }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "synapse_read_paper_full",
    {
      description: "Get the complete paper as raw Markdown. ~10-50k tokens, CAUTION: High token cost. Prefer synapse_read_paper_section for targeted reading.",
      inputSchema: z.object({
        arxivId: z.string().describe("arXiv paper ID, e.g. '2301.07041'"),
      }),
    },
    async ({ arxivId }) => {
      try {
        const { readPaperFull } = await import("@/services/paper-search.service");
        const result = await readPaperFull(arxivId);
        if (!result) {
          return { content: [{ type: "text" as const, text: `Paper not found: ${arxivId}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "synapse_add_related_work",
    {
      description: "Add a paper to a research project's Related Works collection. Returns isNew=true if newly added, isNew=false if already exists (duplicate by URL or arXiv ID).",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string(),
        url: z.string(),
        authors: z.string().optional(),
        abstract: z.string().optional(),
        arxivId: z.string().optional(),
        year: z.number().int().optional().describe("Publication year"),
        source: z.enum(["arxiv", "deepxiv", "semantic_scholar", "openalex"]).default("deepxiv"),
      }),
    },
    async ({ researchProjectUuid, title, url, authors, abstract, arxivId, year, source }) => {
      const rw = await createRelatedWork({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        title,
        url,
        authors,
        abstract,
        arxivId,
        source,
        addedBy: "auto",
        addedByAgentUuid: auth.actorUuid,
        publishedYear: year,
      });

      if (rw.isNew) {
        try {
          const [totalCount, project, agent] = await Promise.all([
            prisma.relatedWork.count({ where: { companyUuid: auth.companyUuid, researchProjectUuid } }),
            prisma.researchProject.findFirst({ where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid }, select: { name: true } }),
            prisma.agent.findUnique({ where: { uuid: auth.actorUuid }, select: { ownerUuid: true, name: true } }),
          ]);
          if (agent?.ownerUuid && project) {
            await notificationService.create({
              companyUuid: auth.companyUuid,
              researchProjectUuid,
              recipientType: "user",
              recipientUuid: agent.ownerUuid,
              entityType: "related_work",
              entityUuid: rw.uuid,
              entityTitle: rw.title,
              projectName: project.name,
              action: "related_work_added",
              message: `New paper collected: "${rw.title}" (${totalCount} total)`,
              actorType: "agent",
              actorUuid: auth.actorUuid,
              actorName: agent.name ?? "Agent",
            });
          }
        } catch { /* ignore notification errors */ }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ relatedWork: rw }) }],
      };
    }
  );

  server.registerTool(
    "synapse_get_related_works",
    {
      description: "Get all related works (papers) collected for a research project.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
      }),
    },
    async ({ researchProjectUuid }) => {
      const works = await listRelatedWorks(auth.companyUuid, researchProjectUuid);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ relatedWorks: works }, null, 2) }],
      };
    }
  );

  // Deep research report — upsert with versioning
  server.registerTool(
    "synapse_get_deep_research_report",
    {
      description: "Get the deep research literature review document for a project. Returns null if none exists yet.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
      }),
    },
    async ({ researchProjectUuid }) => {
      const project = await prisma.researchProject.findFirst({
        where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
        select: { deepResearchDocUuid: true },
      });
      if (!project?.deepResearchDocUuid) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ document: null }) }] };
      }
      const doc = await documentService.getDocument(auth.companyUuid, project.deepResearchDocUuid);
      return { content: [{ type: "text" as const, text: JSON.stringify({ document: doc }, null, 2) }] };
    }
  );

  server.registerTool(
    "synapse_save_deep_research_report",
    {
      description: "Create or update the deep research literature review for a project. If a report already exists, updates it and increments the version (v1 → v2 → v3...). If none exists, creates a new one.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string().describe("Report title"),
        content: z.string().describe("Full report content (Markdown)"),
      }),
    },
    async ({ researchProjectUuid, title, content }) => {
      const project = await prisma.researchProject.findFirst({
        where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
        select: { uuid: true, deepResearchDocUuid: true },
      });
      if (!project) {
        return { content: [{ type: "text" as const, text: "Research Project not found" }], isError: true };
      }

      let doc;
      if (project.deepResearchDocUuid) {
        // Update existing — increment version
        doc = await documentService.updateDocument(project.deepResearchDocUuid, {
          title,
          content,
          incrementVersion: true,
        });
      } else {
        // Create new
        doc = await documentService.createDocument({
          companyUuid: auth.companyUuid,
          researchProjectUuid,
          type: "literature_review",
          title,
          content,
          experimentDesignUuid: null,
          createdByUuid: auth.actorUuid,
        });
        // Link to project
        await updateResearchProject(project.uuid, { deepResearchDocUuid: doc.uuid });
      }

      // Notify the agent's owner that deep research is complete
      try {
        const projectForNotif = await prisma.researchProject.findFirst({
          where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
          select: { name: true },
        });
        const agent = await prisma.agent.findUnique({
          where: { uuid: auth.actorUuid },
          select: { ownerUuid: true, name: true },
        });
        if (agent?.ownerUuid && projectForNotif) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "user",
            recipientUuid: agent.ownerUuid,
            entityType: "research_project",
            entityUuid: researchProjectUuid,
            entityTitle: projectForNotif.name,
            projectName: projectForNotif.name,
            action: "deep_research_completed",
            message: `Deep research literature review "${title}" (v${doc.version}) is ready.`,
            actorType: "agent",
            actorUuid: auth.actorUuid,
            actorName: agent.name ?? "Agent",
          });
        }
      } catch { /* ignore notification errors */ }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ document: { uuid: doc.uuid, title: doc.title, version: doc.version } }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_complete_task",
    {
      description: "Signal that an agent task (auto_search or deep_research) has finished. Clears the active indicator on the project and notifies the owner.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        taskType: z.enum(["auto_search", "deep_research"]),
      }),
    },
    async ({ researchProjectUuid, taskType }) => {
      const config = TASK_TYPE_FIELDS[taskType];
      const project = await prisma.researchProject.findFirst({
        where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
        select: { uuid: true, name: true, autoSearchActiveAgentUuid: true, deepResearchActiveAgentUuid: true },
      });
      if (!project) {
        return { content: [{ type: "text" as const, text: "Research Project not found" }], isError: true };
      }
      const activeAgentUuid = taskType === "auto_search" ? project.autoSearchActiveAgentUuid : project.deepResearchActiveAgentUuid;
      if (!activeAgentUuid) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ cleared: false, reason: "no active task" }) }] };
      }

      await prisma.researchProject.update({
        where: { uuid: researchProjectUuid },
        data: { [config.activeField]: null },
      });

      eventBus.emitChange({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        entityType: "research_project",
        entityUuid: researchProjectUuid,
        action: "updated",
      });

      try {
        const agent = await prisma.agent.findUnique({
          where: { uuid: activeAgentUuid },
          select: { ownerUuid: true, name: true },
        });
        if (agent?.ownerUuid) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "user",
            recipientUuid: agent.ownerUuid,
            entityType: "research_project",
            entityUuid: researchProjectUuid,
            entityTitle: project.name,
            projectName: project.name,
            action: config.notificationAction,
            message: TASK_COMPLETION_MESSAGES[taskType],
            actorType: "agent",
            actorUuid: activeAgentUuid,
            actorName: agent.name ?? "Agent",
          });
        }
      } catch { /* ignore notification errors */ }

      return { content: [{ type: "text" as const, text: JSON.stringify({ cleared: true }) }] };
    }
  );
}

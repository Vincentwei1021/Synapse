import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { createRelatedWork, listRelatedWorks } from "@/services/related-work.service";
import { prisma } from "@/lib/prisma";
import * as documentService from "@/services/document.service";
import { updateResearchProject } from "@/services/research-project.service";

export function registerLiteratureTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_search_papers",
    {
      description: "Search for academic papers across Semantic Scholar, OpenAlex, and arXiv. Returns titles, abstracts, authors, and URLs.",
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
        source: z.enum(["arxiv", "semantic_scholar", "openalex"]).default("arxiv"),
      }),
    },
    async ({ researchProjectUuid, title, url, authors, abstract, arxivId, source }) => {
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
      });
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

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ document: { uuid: doc.uuid, title: doc.title, version: doc.version } }, null, 2) }],
      };
    }
  );
}

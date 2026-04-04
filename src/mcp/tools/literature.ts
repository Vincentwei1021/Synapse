import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { createRelatedWork, listRelatedWorks } from "@/services/related-work.service";

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
      description: "Add a paper to a research project's Related Works collection.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string(),
        url: z.string(),
        authors: z.string().optional(),
        abstract: z.string().optional(),
        arxivId: z.string().optional(),
        source: z.enum(["arxiv", "semantic_scholar"]).default("arxiv"),
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
}

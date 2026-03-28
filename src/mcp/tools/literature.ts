import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { createRelatedWork, listRelatedWorks } from "@/services/related-work.service";

export function registerLiteratureTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_search_papers",
    {
      description: "Search for academic papers using Semantic Scholar. Returns titles, abstracts, authors, and URLs.",
      inputSchema: z.object({
        query: z.string().describe("Search query, e.g. 'speech recognition Chinese accent'"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    },
    async ({ query, limit }) => {
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,authors,externalIds,url`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        return { content: [{ type: "text" as const, text: `Semantic Scholar API error: ${resp.status}` }], isError: true };
      }
      const data = await resp.json() as {
        data?: Array<{
          paperId: string;
          title: string;
          abstract: string | null;
          authors: Array<{ name: string }>;
          externalIds: { ArXiv?: string } | null;
          url: string;
        }>;
      };

      const papers = (data.data ?? []).map(p => ({
        title: p.title,
        abstract: p.abstract,
        authors: p.authors.map(a => a.name).join(", "),
        url: p.externalIds?.ArXiv
          ? `https://arxiv.org/abs/${p.externalIds.ArXiv}`
          : p.url,
        arxivId: p.externalIds?.ArXiv ?? null,
        source: p.externalIds?.ArXiv ? "arxiv" : "semantic_scholar",
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ papers }, null, 2) }],
      };
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

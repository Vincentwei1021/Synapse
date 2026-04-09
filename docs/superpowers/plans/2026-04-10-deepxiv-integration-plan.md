# DeepXiv Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Semantic Scholar + OpenAlex with DeepXiv as the primary paper search and full-text reading source, enabling agents to read actual paper content for literature reviews.

**Architecture:** DeepXiv HTTP API (`https://data.rag.ac.cn/arxiv/`) becomes the primary search and reading backend. arXiv API stays as search fallback. Four new MCP tools expose progressive reading (brief/head/section/full). Agent prompts updated to leverage full-text reading.

**Tech Stack:** TypeScript, Next.js API routes, MCP SDK, DeepXiv REST API

**Spec:** `docs/superpowers/specs/2026-04-10-deepxiv-integration-design.md`

---

### Task 1: Refactor paper-search.service.ts — Replace Search Sources

**Files:**
- Modify: `src/services/paper-search.service.ts`

- [ ] **Step 1: Write failing test for searchDeepXiv**

Create `src/services/__tests__/paper-search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll test the exported functions by mocking global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("searchDeepXiv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns papers from DeepXiv API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          arxiv_id: "2401.12345",
          title: "Test Paper",
          authors: "Alice, Bob",
          abstract: "A test abstract",
          url: "https://arxiv.org/abs/2401.12345",
          year: 2024,
          citation_count: 10,
        },
      ],
    });

    const { searchDeepXiv } = await import("@/services/paper-search.service");
    const results = await searchDeepXiv("test query", 10);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Test Paper",
      arxivId: "2401.12345",
      source: "deepxiv",
    });

    // Verify correct URL was called
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("data.rag.ac.cn/arxiv/");
    expect(calledUrl).toContain("type=retrieve");
    expect(calledUrl).toContain("query=test+query");
  });

  it("returns empty array on API failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    // Retries will also fail
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { searchDeepXiv } = await import("@/services/paper-search.service");
    const results = await searchDeepXiv("test query", 10);

    expect(results).toEqual([]);
  });
});

describe("searchPapers", () => {
  it("uses DeepXiv as primary, arXiv as fallback when DeepXiv returns empty", async () => {
    // DeepXiv returns empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // arXiv returns results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<feed><entry>
        <id>http://arxiv.org/abs/2401.99999v1</id>
        <title>Fallback Paper</title>
        <summary>Fallback abstract</summary>
        <author><name>Charlie</name></author>
      </entry></feed>`,
    });

    const { searchPapers } = await import("@/services/paper-search.service");
    const results = await searchPapers("test query", 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe("arxiv");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/services/__tests__/paper-search.test.ts`
Expected: FAIL — `searchDeepXiv` does not exist yet.

- [ ] **Step 3: Implement searchDeepXiv and refactor searchPapers**

Replace the contents of `src/services/paper-search.service.ts`:

```typescript
/**
 * Paper search service.
 *
 * Primary: DeepXiv hybrid search (BM25 + vector) over arXiv papers.
 * Fallback: arXiv API (keyword search).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperResult {
  title: string;
  abstract: string | null;
  authors: string;
  url: string;
  arxivId: string | null;
  doi: string | null;
  year: number | null;
  source: "arxiv" | "deepxiv" | "semantic_scholar" | "openalex";
}

/** Response shape from DeepXiv brief endpoint */
export interface DeepXivBrief {
  arxiv_id: string;
  title: string;
  authors: string;
  abstract: string | null;
  tldr: string | null;
  keywords: string[] | null;
  citation_count: number | null;
  github_url: string | null;
  url: string | null;
}

/** Section summary from DeepXiv head endpoint */
export interface DeepXivSectionSummary {
  name: string;
  tldr: string | null;
  token_count: number | null;
}

/** Response shape from DeepXiv head endpoint */
export interface DeepXivHead {
  arxiv_id: string;
  title: string;
  authors: string;
  abstract: string | null;
  sections: DeepXivSectionSummary[];
}

// ---------------------------------------------------------------------------
// DeepXiv config
// ---------------------------------------------------------------------------

const DEEPXIV_BASE = "https://data.rag.ac.cn/arxiv/";

function deepxivHeaders(): Record<string, string> {
  const token = process.env.DEEPXIV_TOKEN;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Fetch with retry (429 / 5xx)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1500;

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15_000), ...init });
      if (resp.ok) return resp;

      const status = resp.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === MAX_RETRIES) return null;

      const retryAfter = resp.headers.get("Retry-After");
      const delayMs = retryAfter
        ? Number(retryAfter) * 1000
        : BACKOFF_BASE_MS * Math.pow(2, attempt);

      await new Promise((r) => setTimeout(r, delayMs));
    } catch {
      if (attempt === MAX_RETRIES) return null;
      await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DeepXiv search adapter
// ---------------------------------------------------------------------------

export async function searchDeepXiv(
  query: string,
  limit: number,
): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    type: "retrieve",
    query,
    size: String(Math.min(limit, 100)),
    search_mode: "hybrid",
  });
  const url = `${DEEPXIV_BASE}?${params}`;
  const resp = await fetchWithRetry(url, { headers: deepxivHeaders() });
  if (!resp) return [];

  const data = (await resp.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];

  return data.map((p) => ({
    title: String(p.title ?? ""),
    abstract: p.abstract ? String(p.abstract) : null,
    authors: String(p.authors ?? ""),
    url: p.arxiv_id ? `https://arxiv.org/abs/${p.arxiv_id}` : String(p.url ?? ""),
    arxivId: p.arxiv_id ? String(p.arxiv_id) : null,
    doi: null,
    year: typeof p.year === "number" ? p.year : null,
    source: "deepxiv" as const,
  }));
}

// ---------------------------------------------------------------------------
// DeepXiv paper reading
// ---------------------------------------------------------------------------

export async function readPaperBrief(arxivId: string): Promise<DeepXivBrief | null> {
  const params = new URLSearchParams({ type: "brief", arxiv_id: arxivId });
  const resp = await fetchWithRetry(`${DEEPXIV_BASE}?${params}`, { headers: deepxivHeaders() });
  if (!resp) return null;
  const data = await resp.json();
  if (!data || typeof data !== "object") return null;
  return data as DeepXivBrief;
}

export async function readPaperHead(arxivId: string): Promise<DeepXivHead | null> {
  const params = new URLSearchParams({ type: "head", arxiv_id: arxivId });
  const resp = await fetchWithRetry(`${DEEPXIV_BASE}?${params}`, { headers: deepxivHeaders() });
  if (!resp) return null;
  const data = await resp.json();
  if (!data || typeof data !== "object") return null;
  return data as DeepXivHead;
}

export async function readPaperSection(arxivId: string, sectionName: string): Promise<string | null> {
  const params = new URLSearchParams({ type: "section", arxiv_id: arxivId, section: sectionName });
  const resp = await fetchWithRetry(`${DEEPXIV_BASE}?${params}`, { headers: deepxivHeaders() });
  if (!resp) return null;
  const data = await resp.json();
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "content" in data) return String((data as { content: unknown }).content);
  // Some responses may return the section text directly
  return JSON.stringify(data);
}

export async function readPaperFull(arxivId: string): Promise<string | null> {
  const params = new URLSearchParams({ type: "raw", arxiv_id: arxivId });
  const resp = await fetchWithRetry(`${DEEPXIV_BASE}?${params}`, { headers: deepxivHeaders() });
  if (!resp) return null;
  const text = await resp.text();
  return text || null;
}

// ---------------------------------------------------------------------------
// arXiv adapter (fallback, Atom XML, regex parsing)
// ---------------------------------------------------------------------------

export async function searchArxiv(
  query: string,
  limit: number,
): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: "0",
    max_results: String(limit),
  });
  const url = `https://export.arxiv.org/api/query?${params}`;
  const resp = await fetchWithRetry(url);
  if (!resp) return [];

  const xml = await resp.text();
  const entries = xml.split("<entry>").slice(1);

  return entries.map((entry) => {
    const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) ?? [])[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "";
    const summary = (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) ?? [])[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? null;
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)]
      .map((m) => m[1].trim())
      .join(", ");
    const idRaw = (entry.match(/<id>([\s\S]*?)<\/id>/) ?? [])[1]?.trim() ?? "";
    const arxivId = idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "") || null;
    const doi = (entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) ?? [])[1]?.trim() ?? null;
    const published = (entry.match(/<published>([\s\S]*?)<\/published>/) ?? [])[1]?.trim() ?? null;
    const year = published ? new Date(published).getFullYear() : null;

    return {
      title,
      abstract: summary,
      authors,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : idRaw,
      arxivId,
      doi,
      year: (year && !isNaN(year)) ? year : null,
      source: "arxiv" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

export function deduplicatePapers(papers: PaperResult[]): PaperResult[] {
  const seen = new Set<string>();
  const results: PaperResult[] = [];

  for (const paper of papers) {
    if (paper.doi) {
      const key = `doi:${paper.doi.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(paper);
      continue;
    }
    if (paper.arxivId) {
      const key = `arxiv:${paper.arxivId.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(paper);
      continue;
    }
    const key = `title:${paper.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(paper);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function searchPapers(
  query: string,
  limit: number = 10,
): Promise<PaperResult[]> {
  // Primary: DeepXiv
  const deepxivResults = await searchDeepXiv(query, limit);
  if (deepxivResults.length > 0) {
    return deduplicatePapers(deepxivResults).slice(0, limit);
  }

  // Fallback: arXiv API
  const arxivResults = await searchArxiv(query, limit);
  return deduplicatePapers(arxivResults).slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/services/__tests__/paper-search.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `pnpm test`
Expected: No failures in other test files that import from paper-search.service.

- [ ] **Step 6: Commit**

```bash
git add src/services/paper-search.service.ts src/services/__tests__/paper-search.test.ts
git commit -m "feat: replace Semantic Scholar + OpenAlex with DeepXiv as primary paper search source"
```

---

### Task 2: Register New MCP Tools for Paper Reading

**Files:**
- Modify: `src/mcp/tools/literature.ts`

- [ ] **Step 1: Update synapse_search_papers description and add 4 new reading tools**

In `src/mcp/tools/literature.ts`, update the `synapse_search_papers` tool description and add 4 new tools after it:

```typescript
// Update existing synapse_search_papers registration — change description only:
// OLD: "Search for academic papers across Semantic Scholar, OpenAlex, and arXiv..."
// NEW:
"Search for academic papers. Uses DeepXiv hybrid search (BM25 + vector) over arXiv, with arXiv API as fallback. Returns titles, abstracts, authors, and URLs."

// Add after synapse_search_papers registration, before synapse_add_related_work:

server.registerTool(
  "synapse_read_paper_brief",
  {
    description: "Get a quick summary of an arXiv paper: TLDR, keywords, citation count, and GitHub URL (if any). Low token cost (~500 tokens). Use this to decide if a paper is worth reading in depth.",
    inputSchema: z.object({
      arxivId: z.string().describe("arXiv paper ID, e.g. '2401.12345'"),
    }),
  },
  async ({ arxivId }) => {
    try {
      const { readPaperBrief } = await import("@/services/paper-search.service");
      const brief = await readPaperBrief(arxivId);
      if (!brief) {
        return { content: [{ type: "text" as const, text: `Paper not found: ${arxivId}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(brief, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Failed to read paper brief: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "synapse_read_paper_head",
  {
    description: "Get paper structure: metadata and all sections with AI-generated TLDRs and per-section token counts. Use this to understand what a paper covers and decide which sections to read (~1-2k tokens).",
    inputSchema: z.object({
      arxivId: z.string().describe("arXiv paper ID, e.g. '2401.12345'"),
    }),
  },
  async ({ arxivId }) => {
    try {
      const { readPaperHead } = await import("@/services/paper-search.service");
      const head = await readPaperHead(arxivId);
      if (!head) {
        return { content: [{ type: "text" as const, text: `Paper not found: ${arxivId}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(head, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Failed to read paper head: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "synapse_read_paper_section",
  {
    description: "Read one specific section of an arXiv paper in full (~1-5k tokens). Section name matching is case-insensitive and supports partial match (e.g. 'introduction', 'related work', 'experiments'). Use synapse_read_paper_head first to see available sections.",
    inputSchema: z.object({
      arxivId: z.string().describe("arXiv paper ID, e.g. '2401.12345'"),
      sectionName: z.string().describe("Section name to read, e.g. 'Introduction', 'Related Work', 'Experiments'"),
    }),
  },
  async ({ arxivId, sectionName }) => {
    try {
      const { readPaperSection } = await import("@/services/paper-search.service");
      const content = await readPaperSection(arxivId, sectionName);
      if (!content) {
        return { content: [{ type: "text" as const, text: `Section "${sectionName}" not found in paper ${arxivId}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: content }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Failed to read paper section: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  }
);

server.registerTool(
  "synapse_read_paper_full",
  {
    description: "Read the complete paper as Markdown (~10-50k tokens). CAUTION: High token cost. Prefer synapse_read_paper_section for targeted reading. Only use this when you need the entire paper.",
    inputSchema: z.object({
      arxivId: z.string().describe("arXiv paper ID, e.g. '2401.12345'"),
    }),
  },
  async ({ arxivId }) => {
    try {
      const { readPaperFull } = await import("@/services/paper-search.service");
      const content = await readPaperFull(arxivId);
      if (!content) {
        return { content: [{ type: "text" as const, text: `Paper not found or no full text available: ${arxivId}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: content }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Failed to read full paper: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  }
);
```

- [ ] **Step 2: Update synapse_add_related_work source enum**

In the same file, update the `source` field in `synapse_add_related_work`:

```typescript
// OLD:
source: z.enum(["arxiv", "semantic_scholar", "openalex"]).default("arxiv"),
// NEW:
source: z.enum(["arxiv", "deepxiv", "semantic_scholar", "openalex"]).default("deepxiv"),
```

- [ ] **Step 3: Verify build compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/literature.ts
git commit -m "feat: add MCP tools for DeepXiv paper reading (brief/head/section/full)"
```

---

### Task 3: Register OpenClaw Passthrough Tools

**Files:**
- Modify: `packages/openclaw-plugin/src/tools/common-tool-definitions.ts`

- [ ] **Step 1: Update synapse_search_papers description**

In the Literature / Related Works section, update the description:

```typescript
// OLD:
description: "Search for academic papers using Semantic Scholar.",
// NEW:
description: "Search for academic papers. Uses DeepXiv hybrid search (BM25 + vector) over arXiv, with arXiv API as fallback.",
```

- [ ] **Step 2: Update synapse_add_related_work source enum**

```typescript
// OLD:
source: { type: "string", description: "Source: arxiv | semantic_scholar | openalex" },
// NEW:
source: { type: "string", description: "Source: deepxiv | arxiv | semantic_scholar | openalex (default: deepxiv)" },
```

- [ ] **Step 3: Add 4 new passthrough tools for paper reading**

Add after the `synapse_get_related_works` tool definition, before the Deep Research Reports section:

```typescript
  // Paper Reading (DeepXiv progressive reading)
  createPassthroughTool<{ arxivId: string }>({
    name: "synapse_read_paper_brief",
    description: "Get a quick summary of an arXiv paper: TLDR, keywords, citation count, GitHub URL. Low token cost (~500 tokens). Use to decide if a paper is worth reading.",
    parameters: {
      type: "object",
      properties: {
        arxivId: { type: "string", description: "arXiv paper ID, e.g. '2401.12345'" },
      },
      required: ["arxivId"],
      additionalProperties: false,
    },
    targetToolName: "synapse_read_paper_brief",
  }),
  createPassthroughTool<{ arxivId: string }>({
    name: "synapse_read_paper_head",
    description: "Get paper structure: all sections with AI-generated TLDRs and token counts. Use to understand paper coverage and decide which sections to read (~1-2k tokens).",
    parameters: {
      type: "object",
      properties: {
        arxivId: { type: "string", description: "arXiv paper ID, e.g. '2401.12345'" },
      },
      required: ["arxivId"],
      additionalProperties: false,
    },
    targetToolName: "synapse_read_paper_head",
  }),
  createPassthroughTool<{ arxivId: string; sectionName: string }>({
    name: "synapse_read_paper_section",
    description: "Read one section of an arXiv paper in full (~1-5k tokens). Case-insensitive partial match. Use synapse_read_paper_head first to see available sections.",
    parameters: {
      type: "object",
      properties: {
        arxivId: { type: "string", description: "arXiv paper ID, e.g. '2401.12345'" },
        sectionName: { type: "string", description: "Section name, e.g. 'Introduction', 'Related Work', 'Experiments'" },
      },
      required: ["arxivId", "sectionName"],
      additionalProperties: false,
    },
    targetToolName: "synapse_read_paper_section",
  }),
  createPassthroughTool<{ arxivId: string }>({
    name: "synapse_read_paper_full",
    description: "Read the complete paper as Markdown (~10-50k tokens). CAUTION: High token cost. Prefer synapse_read_paper_section for targeted reading.",
    parameters: {
      type: "object",
      properties: {
        arxivId: { type: "string", description: "arXiv paper ID, e.g. '2401.12345'" },
      },
      required: ["arxivId"],
      additionalProperties: false,
    },
    targetToolName: "synapse_read_paper_full",
  }),
```

- [ ] **Step 3: Verify plugin compiles**

Run: `cd packages/openclaw-plugin && npx tsc --noEmit && cd ../..`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/openclaw-plugin/src/tools/common-tool-definitions.ts
git commit -m "feat: register DeepXiv reading tools in OpenClaw plugin"
```

---

### Task 4: Update Agent Prompts in Event Router

**Files:**
- Modify: `packages/openclaw-plugin/src/event-router.ts`

- [ ] **Step 1: Update handleAutoSearchTriggered prompt**

Replace the `handleAutoSearchTriggered` method body. The key changes: add reading tools to allowed list, instruct agent to use `brief` for relevance assessment before adding papers.

```typescript
private handleAutoSearchTriggered(n: NotificationDetail): void {
  const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
  const hasCustomPrompt = n.message !== SynapseEventRouter.DEFAULT_AUTO_SEARCH_MSG;

  const basePrompt = `[Synapse] Paper search requested for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

You may ONLY use these Synapse tools for this task:
- synapse_get_related_works
- synapse_get_research_project
- synapse_search_papers
- synapse_read_paper_brief
- synapse_add_related_work

Steps:
1. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to see what papers are already collected — avoid searching for topics already well-covered
2. Use synapse_get_research_project with researchProjectUuid "${projectUuid}" to understand the research objectives, datasets, and methods
3. Based on the project context and gaps in existing papers, use synapse_search_papers to find new relevant academic papers
4. For each candidate paper with an arxivId, use synapse_read_paper_brief to check its TLDR and keywords — only add papers that are genuinely relevant to the project
5. For each relevant paper, use synapse_add_related_work with researchProjectUuid "${projectUuid}" to add it (duplicates are automatically skipped — if isNew=false, the paper already existed)
6. Search with multiple query variations to maximize coverage, but call synapse_search_papers sequentially (one at a time) to avoid rate limits
7. Focus on papers that fill gaps not covered by existing related works`;

  const prompt = hasCustomPrompt
    ? `${basePrompt}\n\nAdditional instructions from the user:\n${n.message}`
    : basePrompt;

  this.triggerAgent(prompt, { notificationUuid: n.uuid, action: "auto_search_triggered", entityUuid: n.entityUuid, projectUuid, timeoutSeconds: 600 });
}
```

- [ ] **Step 2: Update handleDeepResearchRequested prompt**

Replace the `handleDeepResearchRequested` method body. The key change: add all reading tools, instruct agent to use progressive reading (head → section → full) when writing the literature review.

```typescript
private handleDeepResearchRequested(n: NotificationDetail): void {
  const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";
  const hasCustomPrompt = n.message !== SynapseEventRouter.DEFAULT_DEEP_RESEARCH_MSG;

  const basePrompt = `[Synapse] Deep research literature review requested for project (projectUuid: ${projectUuid}).

IMPORTANT: You MUST save the report back to Synapse using synapse_save_deep_research_report. Do NOT just output text — the report must be saved via the tool call.

You may ONLY use these Synapse tools for this task:
- synapse_get_deep_research_report
- synapse_get_related_works
- synapse_get_research_project
- synapse_read_paper_brief
- synapse_read_paper_head
- synapse_read_paper_section
- synapse_read_paper_full
- synapse_save_deep_research_report

Steps:
1. Use synapse_get_deep_research_report with researchProjectUuid "${projectUuid}" to check if a previous report exists — if so, read it to understand what was covered before
2. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to get the full list of collected papers
3. Use synapse_get_research_project with researchProjectUuid "${projectUuid}" to understand the research objectives, datasets, and evaluation methods
4. For each paper with an arxivId, use progressive reading to understand its content:
   a. synapse_read_paper_head — get the paper structure and section TLDRs
   b. synapse_read_paper_section — read key sections relevant to the project (e.g. Introduction, Methods, Results, Conclusion)
   c. synapse_read_paper_full — only if needed for papers central to the research
5. Analyze how each paper relates to the project's goals — identify key methods, findings, and gaps in the literature
6. REQUIRED: Use synapse_save_deep_research_report with researchProjectUuid "${projectUuid}", title, and content (Markdown) to save the report. This creates v1 or updates to v2/v3 automatically.

Writing guidelines:
- Base your review on actual paper content, not just abstracts
- Cite specific methods, results, and findings from the papers
- Identify research gaps and how they relate to the project objectives
- Organize thematically, not just paper-by-paper`;

  const prompt = hasCustomPrompt
    ? `${basePrompt}\n\nAdditional instructions from the user:\n${n.message}`
    : basePrompt;

  this.triggerAgent(prompt, { notificationUuid: n.uuid, action: "deep_research_requested", entityUuid: n.entityUuid, projectUuid, timeoutSeconds: 1800 });
}
```

- [ ] **Step 3: Verify plugin compiles**

Run: `cd packages/openclaw-plugin && npx tsc --noEmit && cd ../..`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/openclaw-plugin/src/event-router.ts
git commit -m "feat: update agent prompts to use DeepXiv progressive reading for literature review"
```

---

### Task 5: Update CLAUDE.md and Environment Config

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.env.example` (if exists, otherwise note for user)

- [ ] **Step 1: Update CLAUDE.md — MCP tools section**

Add the new tools to the "Primary research MCP flow" list:

```markdown
- `synapse_read_paper_brief` — quick paper summary (TLDR, keywords, citations)
- `synapse_read_paper_head` — paper structure with section TLDRs
- `synapse_read_paper_section` — read one section in full
- `synapse_read_paper_full` — read complete paper as Markdown
```

Update the `synapse_search_papers` description to mention DeepXiv.

- [ ] **Step 2: Update CLAUDE.md — Related Works section**

Update the Related Works section to reflect DeepXiv as the search and reading backend:

```markdown
- Literature tools: `synapse_search_papers` (DeepXiv hybrid search, arXiv API fallback), `synapse_read_paper_brief/head/section/full` (progressive full-text reading via DeepXiv), `synapse_add_related_work`, `synapse_get_related_works`
```

- [ ] **Step 3: Add DEEPXIV_TOKEN to env documentation**

Check if `.env.example` exists. If so, add:

```
# DeepXiv paper search & reading (optional, anonymous gets 1000 req/day)
DEEPXIV_TOKEN=
```

Remove `SEMANTIC_SCHOLAR_API_KEY` and `OPENALEX_EMAIL` references if present (they are no longer used).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for DeepXiv integration and new paper reading tools"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: No lint errors.

- [ ] **Step 3: Build check**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Grep for stale references**

Search for remaining references to Semantic Scholar / OpenAlex in active code (not test fixtures or comments about backward compat):

```bash
grep -rn "searchSemanticScholar\|searchOpenAlex\|reconstructAbstract" src/ packages/ --include="*.ts" --include="*.tsx"
```

Expected: No matches (these functions should be fully removed).

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: clean up stale Semantic Scholar / OpenAlex references"
```

# Multi-Source Paper Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-source Semantic Scholar paper search with a multi-source (Semantic Scholar + OpenAlex + arXiv) parallel search with retry/backoff and deduplication.

**Architecture:** Extract paper search logic into a dedicated `src/services/paper-search.service.ts` with three source adapters, a rate limiter, and a deduplication layer. The MCP tool in `literature.ts` becomes a thin wrapper that calls the service. Each source runs in parallel via `Promise.allSettled`, with per-source retry on 429/5xx.

**Tech Stack:** TypeScript, Node.js fetch API, Vitest for testing.

---

### File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/services/paper-search.service.ts` | **Create** | Three source adapters, rate limiter, retry, dedup, `searchPapers()` entry point |
| `src/services/paper-search.service.test.ts` | **Create** | Unit tests with mocked fetch |
| `src/mcp/tools/literature.ts` | **Modify** | Replace inline Semantic Scholar call with `searchPapers()` import |

---

### Task 1: Paper search service — types and rate limiter

**Files:**
- Create: `src/services/paper-search.service.ts`
- Create: `src/services/paper-search.service.test.ts`

- [ ] **Step 1: Write failing tests for rate limiter and types**

In `src/services/paper-search.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("paper-search.service", () => {
  describe("RateLimiter", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("allows first call immediately", async () => {
      const { RateLimiter } = await import("./paper-search.service");
      const limiter = new RateLimiter(1000);
      const start = Date.now();
      await limiter.acquire("source-a");
      expect(Date.now() - start).toBeLessThan(100);
    });

    it("delays second call to same source by minInterval", async () => {
      const { RateLimiter } = await import("./paper-search.service");
      const limiter = new RateLimiter(1000);
      await limiter.acquire("source-a");
      const waitPromise = limiter.acquire("source-a");
      vi.advanceTimersByTime(1000);
      await waitPromise;
      // Should not throw — just needs to resolve after delay
    });

    it("allows concurrent calls to different sources", async () => {
      const { RateLimiter } = await import("./paper-search.service");
      const limiter = new RateLimiter(1000);
      await limiter.acquire("source-a");
      const start = Date.now();
      await limiter.acquire("source-b");
      expect(Date.now() - start).toBeLessThan(100);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement types and rate limiter**

Create `src/services/paper-search.service.ts`:

```typescript
// ---------- Types ----------

export interface PaperResult {
  title: string;
  abstract: string | null;
  authors: string;
  url: string;
  arxivId: string | null;
  doi: string | null;
  source: "arxiv" | "semantic_scholar" | "openalex";
}

// ---------- Rate limiter ----------

export class RateLimiter {
  private lastCall = new Map<string, number>();

  constructor(private minIntervalMs: number) {}

  async acquire(source: string): Promise<void> {
    const now = Date.now();
    const last = this.lastCall.get(source) ?? 0;
    const wait = Math.max(0, this.minIntervalMs - (now - last));
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastCall.set(source, Date.now());
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/paper-search.service.ts src/services/paper-search.service.test.ts
git commit -m "feat(paper-search): add types and rate limiter"
```

---

### Task 2: Semantic Scholar adapter with retry

**Files:**
- Modify: `src/services/paper-search.service.ts`
- Modify: `src/services/paper-search.service.test.ts`

- [ ] **Step 1: Write failing tests for Semantic Scholar adapter**

Append to the test file:

```typescript
import type { PaperResult } from "./paper-search.service";

// Mock global fetch for source adapter tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("searchSemanticScholar", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  it("returns papers on success", async () => {
    const { searchSemanticScholar } = await import("./paper-search.service");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            paperId: "abc",
            title: "Test Paper",
            abstract: "Abstract text",
            authors: [{ name: "Alice" }, { name: "Bob" }],
            externalIds: { ArXiv: "2401.00001", DOI: "10.1234/test" },
            url: "https://semanticscholar.org/paper/abc",
          },
        ],
      }),
    });

    const results = await searchSemanticScholar("test query", 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Test Paper");
    expect(results[0].authors).toBe("Alice, Bob");
    expect(results[0].arxivId).toBe("2401.00001");
    expect(results[0].doi).toBe("10.1234/test");
    expect(results[0].source).toBe("semantic_scholar");
  });

  it("retries on 429 and succeeds", async () => {
    const { searchSemanticScholar } = await import("./paper-search.service");
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    const results = await searchSemanticScholar("test", 5);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty after max retries", async () => {
    const { searchSemanticScholar } = await import("./paper-search.service");
    mockFetch.mockResolvedValue({ ok: false, status: 429, headers: new Headers() });

    const results = await searchSemanticScholar("test", 5);
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: FAIL — `searchSemanticScholar` not exported

- [ ] **Step 3: Implement Semantic Scholar adapter**

Add to `src/services/paper-search.service.ts`:

```typescript
// ---------- Retry helper ----------

async function fetchWithRetry(
  url: string,
  options: RequestInit & { signal?: AbortSignal },
  maxRetries = 2,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt === maxRetries) return null;
        const retryAfter = resp.headers.get("Retry-After");
        const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 1500;
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return null; // 4xx (non-429) — don't retry
    } catch {
      if (attempt === maxRetries) return null;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
    }
  }
  return null;
}

// ---------- Semantic Scholar ----------

const SS_API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;

export async function searchSemanticScholar(query: string, limit: number): Promise<PaperResult[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,authors,externalIds,url`;
  const headers: Record<string, string> = {};
  if (SS_API_KEY) headers["x-api-key"] = SS_API_KEY;

  const resp = await fetchWithRetry(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp) return [];

  const data = await resp.json() as {
    data?: Array<{
      paperId: string;
      title: string;
      abstract: string | null;
      authors: Array<{ name: string }>;
      externalIds: { ArXiv?: string; DOI?: string } | null;
      url: string;
    }>;
  };

  return (data.data ?? []).map((p) => ({
    title: p.title,
    abstract: p.abstract,
    authors: p.authors.map((a) => a.name).join(", "),
    url: p.externalIds?.ArXiv ? `https://arxiv.org/abs/${p.externalIds.ArXiv}` : p.url,
    arxivId: p.externalIds?.ArXiv ?? null,
    doi: p.externalIds?.DOI ?? null,
    source: "semantic_scholar" as const,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/paper-search.service.ts src/services/paper-search.service.test.ts
git commit -m "feat(paper-search): add Semantic Scholar adapter with retry"
```

---

### Task 3: OpenAlex adapter

**Files:**
- Modify: `src/services/paper-search.service.ts`
- Modify: `src/services/paper-search.service.test.ts`

- [ ] **Step 1: Write failing tests for OpenAlex adapter**

Append to the test file:

```typescript
describe("searchOpenAlex", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  it("returns papers on success", async () => {
    const { searchOpenAlex } = await import("./paper-search.service");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "OpenAlex Paper",
            doi: "https://doi.org/10.5678/oatest",
            ids: { openalex: "W123", doi: "https://doi.org/10.5678/oatest" },
            authorships: [
              { author: { display_name: "Charlie" } },
              { author: { display_name: "Dana" } },
            ],
            abstract_inverted_index: { This: [0], is: [1], abstract: [2] },
          },
        ],
      }),
    });

    const results = await searchOpenAlex("test query", 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("OpenAlex Paper");
    expect(results[0].authors).toBe("Charlie, Dana");
    expect(results[0].doi).toBe("10.5678/oatest");
    expect(results[0].source).toBe("openalex");
  });

  it("reconstructs abstract from inverted index", async () => {
    const { searchOpenAlex } = await import("./paper-search.service");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "T",
            doi: null,
            ids: {},
            authorships: [],
            abstract_inverted_index: { Hello: [0], world: [1] },
          },
        ],
      }),
    });

    const results = await searchOpenAlex("test", 5);
    expect(results[0].abstract).toBe("Hello world");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: FAIL — `searchOpenAlex` not exported

- [ ] **Step 3: Implement OpenAlex adapter**

Add to `src/services/paper-search.service.ts`:

```typescript
// ---------- OpenAlex ----------

const OPENALEX_EMAIL = process.env.OPENALEX_EMAIL;

function invertedIndexToText(index: Record<string, number[]> | null): string | null {
  if (!index) return null;
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, w]) => w).join(" ");
}

export async function searchOpenAlex(query: string, limit: number): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
    select: "title,doi,ids,authorships,abstract_inverted_index",
  });
  if (OPENALEX_EMAIL) params.set("mailto", OPENALEX_EMAIL);

  const url = `https://api.openalex.org/works?${params}`;
  const resp = await fetchWithRetry(url, { signal: AbortSignal.timeout(15000) });
  if (!resp) return [];

  const data = await resp.json() as {
    results?: Array<{
      title: string;
      doi: string | null;
      ids: { openalex?: string; doi?: string };
      authorships: Array<{ author: { display_name: string } }>;
      abstract_inverted_index: Record<string, number[]> | null;
    }>;
  };

  return (data.results ?? []).map((p) => {
    const doi = p.doi?.replace("https://doi.org/", "") ?? null;
    return {
      title: p.title,
      abstract: invertedIndexToText(p.abstract_inverted_index),
      authors: p.authorships.map((a) => a.author.display_name).join(", "),
      url: p.doi ?? `https://openalex.org/works/${p.ids.openalex ?? ""}`,
      arxivId: null,
      doi,
      source: "openalex" as const,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/paper-search.service.ts src/services/paper-search.service.test.ts
git commit -m "feat(paper-search): add OpenAlex adapter"
```

---

### Task 4: arXiv adapter

**Files:**
- Modify: `src/services/paper-search.service.ts`
- Modify: `src/services/paper-search.service.test.ts`

- [ ] **Step 1: Write failing tests for arXiv adapter**

Append to the test file:

```typescript
describe("searchArxiv", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  it("returns papers parsed from Atom XML", async () => {
    const { searchArxiv } = await import("./paper-search.service");
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.00001v1</id>
    <title>arXiv Paper Title</title>
    <summary>arXiv abstract text</summary>
    <author><name>Eve</name></author>
    <author><name>Frank</name></author>
  </entry>
</feed>`;
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => xml });

    const results = await searchArxiv("test query", 5);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("arXiv Paper Title");
    expect(results[0].abstract).toBe("arXiv abstract text");
    expect(results[0].authors).toBe("Eve, Frank");
    expect(results[0].arxivId).toBe("2401.00001");
    expect(results[0].source).toBe("arxiv");
  });

  it("returns empty on API error", async () => {
    const { searchArxiv } = await import("./paper-search.service");
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: new Headers() });

    const results = await searchArxiv("test", 5);
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: FAIL — `searchArxiv` not exported

- [ ] **Step 3: Implement arXiv adapter**

Add to `src/services/paper-search.service.ts`:

```typescript
// ---------- arXiv ----------

export async function searchArxiv(query: string, limit: number): Promise<PaperResult[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}`;
  const resp = await fetchWithRetry(url, { signal: AbortSignal.timeout(15000) });
  if (!resp) return [];

  const xml = await resp.text();
  const entries = xml.split("<entry>");
  if (entries.length < 2) return [];

  return entries.slice(1).map((entry) => {
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const authorMatches = [...entry.matchAll(/<name>(.*?)<\/name>/g)];
    const idMatch = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([\d.]+)/);

    const arxivId = idMatch?.[1] ?? null;
    return {
      title: titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "",
      abstract: summaryMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
      authors: authorMatches.map((m) => m[1]).join(", "),
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : "",
      arxivId,
      doi: null,
      source: "arxiv" as const,
    };
  }).filter((p) => p.title !== "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/paper-search.service.ts src/services/paper-search.service.test.ts
git commit -m "feat(paper-search): add arXiv adapter"
```

---

### Task 5: Parallel search with deduplication

**Files:**
- Modify: `src/services/paper-search.service.ts`
- Modify: `src/services/paper-search.service.test.ts`

- [ ] **Step 1: Write failing tests for searchPapers and deduplication**

Append to the test file:

```typescript
describe("searchPapers", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  it("deduplicates by DOI across sources", async () => {
    const { deduplicatePapers } = await import("./paper-search.service");
    const papers: PaperResult[] = [
      { title: "Paper A", abstract: "Full abstract", authors: "Alice", url: "https://arxiv.org/abs/2401.00001", arxivId: "2401.00001", doi: "10.1234/a", source: "semantic_scholar" },
      { title: "Paper A (duplicate)", abstract: null, authors: "Alice", url: "https://openalex.org/W1", arxivId: null, doi: "10.1234/a", source: "openalex" },
    ];

    const deduped = deduplicatePapers(papers);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].source).toBe("semantic_scholar"); // first wins
  });

  it("deduplicates by arXiv ID across sources", async () => {
    const { deduplicatePapers } = await import("./paper-search.service");
    const papers: PaperResult[] = [
      { title: "Paper B", abstract: "abs", authors: "Bob", url: "u1", arxivId: "2401.00002", doi: null, source: "arxiv" },
      { title: "Paper B copy", abstract: "abs2", authors: "Bob", url: "u2", arxivId: "2401.00002", doi: "10.5678/b", source: "semantic_scholar" },
    ];

    const deduped = deduplicatePapers(papers);
    expect(deduped).toHaveLength(1);
  });

  it("keeps papers with different identifiers", async () => {
    const { deduplicatePapers } = await import("./paper-search.service");
    const papers: PaperResult[] = [
      { title: "Unique A", abstract: null, authors: "X", url: "u1", arxivId: "2401.00001", doi: null, source: "arxiv" },
      { title: "Unique B", abstract: null, authors: "Y", url: "u2", arxivId: null, doi: "10.9999/b", source: "openalex" },
    ];

    const deduped = deduplicatePapers(papers);
    expect(deduped).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: FAIL — `deduplicatePapers` not exported

- [ ] **Step 3: Implement deduplication and main searchPapers entry point**

Add to `src/services/paper-search.service.ts`:

```typescript
// ---------- Deduplication ----------

export function deduplicatePapers(papers: PaperResult[]): PaperResult[] {
  const seen = new Set<string>();
  const result: PaperResult[] = [];

  for (const paper of papers) {
    // Build dedup keys — check DOI first, then arXiv ID
    const keys: string[] = [];
    if (paper.doi) keys.push(`doi:${paper.doi.toLowerCase()}`);
    if (paper.arxivId) keys.push(`arxiv:${paper.arxivId}`);

    if (keys.length === 0) {
      // No identifiers — use normalized title as fallback
      keys.push(`title:${paper.title.toLowerCase().replace(/\s+/g, " ").trim()}`);
    }

    const isDuplicate = keys.some((k) => seen.has(k));
    if (!isDuplicate) {
      keys.forEach((k) => seen.add(k));
      result.push(paper);
    }
  }

  return result;
}

// ---------- Main entry point ----------

const rateLimiter = new RateLimiter(1100); // slightly > 1s to be safe

export async function searchPapers(query: string, limit: number): Promise<PaperResult[]> {
  const perSourceLimit = Math.min(limit, 10);

  const [ssResult, oaResult, axResult] = await Promise.allSettled([
    rateLimiter.acquire("semantic_scholar").then(() => searchSemanticScholar(query, perSourceLimit)),
    rateLimiter.acquire("openalex").then(() => searchOpenAlex(query, perSourceLimit)),
    rateLimiter.acquire("arxiv").then(() => searchArxiv(query, perSourceLimit)),
  ]);

  const allPapers: PaperResult[] = [
    ...(ssResult.status === "fulfilled" ? ssResult.value : []),
    ...(oaResult.status === "fulfilled" ? oaResult.value : []),
    ...(axResult.status === "fulfilled" ? axResult.value : []),
  ];

  return deduplicatePapers(allPapers).slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/services/paper-search.service.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/paper-search.service.ts src/services/paper-search.service.test.ts
git commit -m "feat(paper-search): add parallel search with deduplication"
```

---

### Task 6: Wire into MCP tool

**Files:**
- Modify: `src/mcp/tools/literature.ts`

- [ ] **Step 1: Replace inline Semantic Scholar call with searchPapers**

Replace the `synapse_search_papers` tool handler in `src/mcp/tools/literature.ts` (lines 7–48) with:

```typescript
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
```

- [ ] **Step 2: Run full test suite to check nothing breaks**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/literature.ts
git commit -m "feat(paper-search): wire multi-source search into MCP tool"
```

---

### Task 7: Sync, deploy, and verify on remote

**Files:** (no code changes)

- [ ] **Step 1: Sync to synapse remote**

```bash
rsync -avz src/services/paper-search.service.ts synapse:/home/ubuntu/Synapse/src/services/paper-search.service.ts
rsync -avz src/services/paper-search.service.test.ts synapse:/home/ubuntu/Synapse/src/services/paper-search.service.test.ts
rsync -avz -e 'ssh' "src/mcp/tools/literature.ts" 'synapse:"/home/ubuntu/Synapse/src/mcp/tools/literature.ts"'
```

- [ ] **Step 2: Verify on remote by tailing logs and triggering a paper search from the UI**

```bash
ssh synapse 'tail -f /tmp/synapse-dev.log | grep -i "paper\|search\|429\|openalex\|arxiv"'
```

Then click Search on the Related Works page. Watch for successful responses from multiple sources.

- [ ] **Step 3: Commit and push from synapse**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add -A && git commit -m "feat: multi-source paper search (Semantic Scholar + OpenAlex + arXiv)" && git push'
```

Then pull locally:

```bash
git pull
```

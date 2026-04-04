import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PaperResult } from "@/services/paper-search.service";

// ---------------------------------------------------------------------------
// RateLimiter tests (use fake timers)
// ---------------------------------------------------------------------------

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first call immediately", async () => {
    const { RateLimiter } = await import("@/services/paper-search.service");
    const limiter = new RateLimiter(1000);

    const start = Date.now();
    await limiter.acquire("source_a");
    const elapsed = Date.now() - start;

    expect(elapsed).toBe(0);
  });

  it("delays second call to same source within interval", async () => {
    const { RateLimiter } = await import("@/services/paper-search.service");
    const limiter = new RateLimiter(1000);

    await limiter.acquire("source_a");

    // Advance 200ms — still within the 1000ms window
    vi.advanceTimersByTime(200);

    const promise = limiter.acquire("source_a");
    // The limiter should schedule a setTimeout for ~800ms
    vi.advanceTimersByTime(800);
    await promise;

    // After the acquire resolves, the internal clock should be at ~1000ms
    expect(Date.now()).toBeGreaterThanOrEqual(1000);
  });

  it("allows concurrent calls to different sources", async () => {
    const { RateLimiter } = await import("@/services/paper-search.service");
    const limiter = new RateLimiter(1000);

    const start = Date.now();
    await Promise.all([
      limiter.acquire("source_a"),
      limiter.acquire("source_b"),
    ]);
    const elapsed = Date.now() - start;

    expect(elapsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Adapter / integration tests (mock fetch, real timers)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

describe("searchSemanticScholar", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns papers on success", async () => {
    const { searchSemanticScholar } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              paperId: "abc123",
              title: "Test Paper",
              abstract: "An abstract",
              authors: [{ name: "Alice" }, { name: "Bob" }],
              externalIds: { ArXiv: "2301.00001", DOI: "10.1234/test" },
              url: "https://www.semanticscholar.org/paper/abc123",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchSemanticScholar("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Test Paper",
      abstract: "An abstract",
      authors: "Alice, Bob",
      url: "https://arxiv.org/abs/2301.00001",
      arxivId: "2301.00001",
      doi: "10.1234/test",
      source: "semantic_scholar",
    });
    // Verify query params
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("query=test");
    expect(calledUrl).toContain("limit=5");
    expect(calledUrl).toContain("fields=title%2Cabstract%2Cauthors%2CexternalIds%2Curl");
  });

  it("retries on 429 and succeeds", async () => {
    const { searchSemanticScholar } = await import("@/services/paper-search.service");

    // First call returns 429
    mockFetch.mockResolvedValueOnce(
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "0" },
      }),
    );
    // Second call succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              paperId: "def456",
              title: "Retry Paper",
              abstract: null,
              authors: [{ name: "Carol" }],
              externalIds: null,
              url: "https://www.semanticscholar.org/paper/def456",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchSemanticScholar("retry", 1);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Retry Paper");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty after max retries", async () => {
    const { searchSemanticScholar } = await import("@/services/paper-search.service");

    // All calls return 500
    mockFetch.mockResolvedValue(
      new Response("error", {
        status: 500,
        headers: { "Retry-After": "0" },
      }),
    );

    const results = await searchSemanticScholar("fail", 5);

    expect(results).toEqual([]);
    // 1 initial + 2 retries = 3
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("searchOpenAlex", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns papers on success", async () => {
    const { searchOpenAlex } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "OpenAlex Paper",
              abstract_inverted_index: { hello: [0], world: [1] },
              authorships: [
                { author: { display_name: "Dave" } },
              ],
              doi: "https://doi.org/10.5678/oa",
              ids: { openalex: "W123" },
              primary_location: { landing_page_url: "https://example.com/paper" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await searchOpenAlex("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "OpenAlex Paper",
      abstract: "hello world",
      authors: "Dave",
      url: "https://example.com/paper",
      doi: "10.5678/oa",
      source: "openalex",
    });
  });

  it("reconstructs abstract from inverted index", async () => {
    const { reconstructAbstract } = await import("@/services/paper-search.service");

    const result = reconstructAbstract({
      the: [0, 4],
      quick: [1],
      brown: [2],
      fox: [3],
      lazy: [5],
      dog: [6],
    });

    expect(result).toBe("the quick brown fox the lazy dog");
  });

  it("returns null abstract when inverted index is null", async () => {
    const { reconstructAbstract } = await import("@/services/paper-search.service");

    expect(reconstructAbstract(null)).toBeNull();
    expect(reconstructAbstract(undefined)).toBeNull();
    expect(reconstructAbstract({})).toBeNull();
  });
});

describe("searchArxiv", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns papers parsed from Atom XML", async () => {
    const { searchArxiv } = await import("@/services/paper-search.service");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2301.12345v1</id>
    <title>ArXiv Paper Title</title>
    <summary>This is the abstract.</summary>
    <author><name>Eve</name></author>
    <author><name>Frank</name></author>
    <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.9999/arxiv</arxiv:doi>
  </entry>
</feed>`;

    mockFetch.mockResolvedValueOnce(new Response(xml, { status: 200 }));

    const results = await searchArxiv("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "ArXiv Paper Title",
      abstract: "This is the abstract.",
      authors: "Eve, Frank",
      url: "https://arxiv.org/abs/2301.12345",
      arxivId: "2301.12345",
      doi: "10.9999/arxiv",
      source: "arxiv",
    });
  });

  it("returns empty on API error", async () => {
    const { searchArxiv } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValue(
      new Response("error", {
        status: 500,
        headers: { "Retry-After": "0" },
      }),
    );

    const results = await searchArxiv("fail", 5);

    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deduplication tests
// ---------------------------------------------------------------------------

describe("deduplicatePapers", () => {
  const makePaper = (overrides: Partial<PaperResult> = {}): PaperResult => ({
    title: "Paper",
    abstract: null,
    authors: "Author",
    url: "https://example.com",
    arxivId: null,
    doi: null,
    source: "semantic_scholar",
    ...overrides,
  });

  it("deduplicates by DOI", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "First", doi: "10.1234/test", source: "semantic_scholar" }),
      makePaper({ title: "Second", doi: "10.1234/test", source: "openalex" }),
    ];

    const result = deduplicatePapers(papers);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("deduplicates by arXiv ID", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "First", arxivId: "2301.00001", source: "semantic_scholar" }),
      makePaper({ title: "Second", arxivId: "2301.00001", source: "arxiv" }),
    ];

    const result = deduplicatePapers(papers);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("deduplicates by normalized title as fallback", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "My   Paper", source: "semantic_scholar" }),
      makePaper({ title: "my paper", source: "openalex" }),
    ];

    const result = deduplicatePapers(papers);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("My   Paper");
  });

  it("keeps papers with different identifiers", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "Paper A", doi: "10.1234/a" }),
      makePaper({ title: "Paper B", doi: "10.1234/b" }),
      makePaper({ title: "Paper C", arxivId: "2301.00001" }),
    ];

    const result = deduplicatePapers(papers);

    expect(result).toHaveLength(3);
  });
});

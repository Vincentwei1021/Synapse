import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PaperResult } from "@/services/paper-search.service";

// ---------------------------------------------------------------------------
// Shared mock setup
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

// ---------------------------------------------------------------------------
// searchDeepXiv tests
// ---------------------------------------------------------------------------

describe("searchDeepXiv", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the correct URL and maps response correctly", async () => {
    const { searchDeepXiv } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            arxiv_id: "2401.12345",
            title: "Deep Learning Paper",
            authors: "Alice, Bob",
            abstract: "A paper about deep learning.",
            url: "https://arxiv.org/abs/2401.12345",
            year: 2024,
            citation_count: 42,
          },
        ]),
        { status: 200 },
      ),
    );

    const results = await searchDeepXiv("deep learning", 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Deep Learning Paper",
      abstract: "A paper about deep learning.",
      authors: "Alice, Bob",
      url: "https://arxiv.org/abs/2401.12345",
      arxivId: "2401.12345",
      doi: null,
      year: 2024,
      citationCount: 42,
      source: "deepxiv",
    });

    // Verify URL
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("data.rag.ac.cn/arxiv/");
    expect(calledUrl).toContain("type=retrieve");
    expect(calledUrl).toContain("query=deep+learning");
    expect(calledUrl).toContain("size=5");
    expect(calledUrl).toContain("search_mode=hybrid");
  });

  it("includes auth header when DEEPXIV_TOKEN is set", async () => {
    vi.stubEnv("DEEPXIV_TOKEN", "test-token-123");
    const { searchDeepXiv } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await searchDeepXiv("test", 5);

    const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
    expect((calledInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token-123",
    );
  });

  it("returns empty array on fetch failure", async () => {
    const { searchDeepXiv } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValue(
      new Response("error", {
        status: 500,
        headers: { "Retry-After": "0" },
      }),
    );

    const results = await searchDeepXiv("fail", 5);
    expect(results).toEqual([]);
  });

  it("returns empty array on invalid JSON response", async () => {
    const { searchDeepXiv } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response("not json", { status: 200 }),
    );

    const results = await searchDeepXiv("test", 5);
    expect(results).toEqual([]);
  });

  it("generates URL from arxiv_id when url field is missing", async () => {
    const { searchDeepXiv } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            arxiv_id: "2401.99999",
            title: "No URL Paper",
            authors: "Carol",
          },
        ]),
        { status: 200 },
      ),
    );

    const results = await searchDeepXiv("test", 5);
    expect(results[0].url).toBe("https://arxiv.org/abs/2401.99999");
  });
});

// ---------------------------------------------------------------------------
// readPaperBrief tests
// ---------------------------------------------------------------------------

describe("readPaperBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns brief on success", async () => {
    const { readPaperBrief } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          arxiv_id: "2401.12345",
          title: "Test Paper",
          authors: "Alice",
          abstract: "Abstract text",
          tldr: "A short summary",
          keywords: ["ml", "nlp"],
          citation_count: 10,
          github_url: "https://github.com/test/repo",
          year: 2024,
        }),
        { status: 200 },
      ),
    );

    const result = await readPaperBrief("2401.12345");

    expect(result).toMatchObject({
      arxivId: "2401.12345",
      title: "Test Paper",
      tldr: "A short summary",
      keywords: ["ml", "nlp"],
      citationCount: 10,
      githubUrl: "https://github.com/test/repo",
      year: 2024,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("type=brief");
    expect(calledUrl).toContain("arxiv_id=2401.12345");
  });

  it("returns null on failure", async () => {
    const { readPaperBrief } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValue(
      new Response("error", { status: 500, headers: { "Retry-After": "0" } }),
    );

    const result = await readPaperBrief("2401.12345");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readPaperHead tests
// ---------------------------------------------------------------------------

describe("readPaperHead", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns paper structure on success", async () => {
    const { readPaperHead } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          arxiv_id: "2401.12345",
          title: "Test Paper",
          sections: [
            { name: "Introduction", tldr: "Intro summary", token_count: 500 },
            { name: "Methods", tldr: "Methods summary", token_count: 1200 },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await readPaperHead("2401.12345");

    expect(result).toMatchObject({
      arxivId: "2401.12345",
      title: "Test Paper",
      sections: [
        { name: "Introduction", tldr: "Intro summary", tokenCount: 500 },
        { name: "Methods", tldr: "Methods summary", tokenCount: 1200 },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// readPaperSection tests
// ---------------------------------------------------------------------------

describe("readPaperSection", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles object response format", async () => {
    const { readPaperSection } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ content: "Section content here" }),
        { status: 200 },
      ),
    );

    const result = await readPaperSection("2401.12345", "Introduction");

    expect(result).toMatchObject({
      arxivId: "2401.12345",
      sectionName: "Introduction",
      content: "Section content here",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("type=section");
    expect(calledUrl).toContain("arxiv_id=2401.12345");
    expect(calledUrl).toContain("section=Introduction");
  });

  it("handles string response format", async () => {
    const { readPaperSection } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify("Raw section text"), { status: 200 }),
    );

    const result = await readPaperSection("2401.12345", "Methods");

    expect(result).toMatchObject({
      arxivId: "2401.12345",
      sectionName: "Methods",
      content: "Raw section text",
    });
  });

  it("returns null on failure", async () => {
    const { readPaperSection } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValue(
      new Response("error", { status: 404 }),
    );

    const result = await readPaperSection("2401.12345", "Missing");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readPaperFull tests
// ---------------------------------------------------------------------------

describe("readPaperFull", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns raw markdown text", async () => {
    const { readPaperFull } = await import("@/services/paper-search.service");

    const markdown = "# Title\n\n## Introduction\nSome text...";
    mockFetch.mockResolvedValueOnce(
      new Response(markdown, { status: 200 }),
    );

    const result = await readPaperFull("2401.12345");

    expect(result).toBe(markdown);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("type=raw");
    expect(calledUrl).toContain("arxiv_id=2401.12345");
  });

  it("returns null on failure", async () => {
    const { readPaperFull } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValue(
      new Response("error", { status: 500, headers: { "Retry-After": "0" } }),
    );

    const result = await readPaperFull("2401.12345");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchArxiv tests (kept from original)
// ---------------------------------------------------------------------------

describe("searchArxiv", () => {
  beforeEach(() => {
    vi.resetModules();
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
// searchPapers integration tests
// ---------------------------------------------------------------------------

describe("searchPapers", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns DeepXiv results when available", async () => {
    const { searchPapers } = await import("@/services/paper-search.service");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            arxiv_id: "2401.00001",
            title: "DeepXiv Paper",
            authors: "Alice",
            abstract: "From DeepXiv",
            year: 2024,
            citation_count: 5,
          },
        ]),
        { status: 200 },
      ),
    );

    const results = await searchPapers("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("deepxiv");
    expect(results[0].title).toBe("DeepXiv Paper");
    // Should only call DeepXiv, not arXiv
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to arXiv when DeepXiv returns empty", async () => {
    const { searchPapers } = await import("@/services/paper-search.service");

    // DeepXiv returns empty array
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    // arXiv returns result
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2301.11111v1</id>
    <title>Fallback Paper</title>
    <summary>From arXiv</summary>
    <author><name>Bob</name></author>
  </entry>
</feed>`;
    mockFetch.mockResolvedValueOnce(new Response(xml, { status: 200 }));

    const results = await searchPapers("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("arxiv");
    expect(results[0].title).toBe("Fallback Paper");
    // Should call both DeepXiv and arXiv
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to arXiv when DeepXiv fails", async () => {
    const { searchPapers } = await import("@/services/paper-search.service");

    // DeepXiv fails (all retries)
    mockFetch.mockResolvedValueOnce(
      new Response("error", { status: 500, headers: { "Retry-After": "0" } }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response("error", { status: 500, headers: { "Retry-After": "0" } }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response("error", { status: 500, headers: { "Retry-After": "0" } }),
    );

    // arXiv returns result
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2301.22222v1</id>
    <title>Fallback After Failure</title>
    <summary>From arXiv fallback</summary>
    <author><name>Carol</name></author>
  </entry>
</feed>`;
    mockFetch.mockResolvedValueOnce(new Response(xml, { status: 200 }));

    const results = await searchPapers("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("arxiv");
    expect(results[0].title).toBe("Fallback After Failure");
  });

  it("deduplicates results", async () => {
    const { searchPapers } = await import("@/services/paper-search.service");

    // DeepXiv returns two papers with the same arxiv_id
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            arxiv_id: "2401.00001",
            title: "Paper One",
            authors: "Alice",
            year: 2024,
          },
          {
            arxiv_id: "2401.00001",
            title: "Paper One Duplicate",
            authors: "Alice",
            year: 2024,
          },
        ]),
        { status: 200 },
      ),
    );

    const results = await searchPapers("test", 5);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Paper One");
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
    citationCount: null,
    source: "deepxiv",
    ...overrides,
  });

  it("deduplicates by DOI", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "First", doi: "10.1234/test", source: "deepxiv" }),
      makePaper({ title: "Second", doi: "10.1234/test", source: "arxiv" }),
    ];

    const result = deduplicatePapers(papers);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("deduplicates by arXiv ID", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "First", arxivId: "2301.00001", source: "deepxiv" }),
      makePaper({ title: "Second", arxivId: "2301.00001", source: "arxiv" }),
    ];

    const result = deduplicatePapers(papers);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("deduplicates by normalized title as fallback", async () => {
    const { deduplicatePapers } = await import("@/services/paper-search.service");

    const papers = [
      makePaper({ title: "My   Paper", source: "deepxiv" }),
      makePaper({ title: "my paper", source: "arxiv" }),
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

describe("fetchDailyPapers", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the HF endpoint with the date param and maps response", async () => {
    const { fetchDailyPapers } = await import("@/services/huggingface-papers.service");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            paper: {
              id: "2605.18879",
              title: "ZeroUnlearn",
              authors: [{ name: "Yujie Lin" }, { name: "Bob" }],
              summary: "Abstract text.",
              publishedAt: "2026-05-26T00:00:00.000Z",
              githubRepo: "https://github.com/x/y",
            },
          },
        ]),
        { status: 200 },
      ),
    );

    const papers = await fetchDailyPapers("2026-05-26");

    expect(papers).toEqual([
      {
        id: "2605.18879",
        arxivId: "2605.18879",
        title: "ZeroUnlearn",
        authors: "Yujie Lin, Bob",
        summary: "Abstract text.",
        publishedAt: "2026-05-26T00:00:00.000Z",
        paperUrl: "https://huggingface.co/papers/2605.18879",
        githubRepo: "https://github.com/x/y",
      },
    ]);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://huggingface.co/api/daily_papers?date=2026-05-26");
  });

  it("returns [] on 5xx after retries", async () => {
    const { fetchDailyPapers } = await import("@/services/huggingface-papers.service");
    mockFetch.mockResolvedValue(
      new Response("err", { status: 500, headers: { "Retry-After": "0" } }),
    );
    const papers = await fetchDailyPapers("2026-05-26");
    expect(papers).toEqual([]);
  });

  it("returns [] on non-array body", async () => {
    const { fetchDailyPapers } = await import("@/services/huggingface-papers.service");
    mockFetch.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const papers = await fetchDailyPapers("2026-05-26");
    expect(papers).toEqual([]);
  });

  it("handles missing optional fields", async () => {
    const { fetchDailyPapers } = await import("@/services/huggingface-papers.service");
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { paper: { id: "2605.00001", title: "Bare", summary: "abs" } },
        ]),
        { status: 200 },
      ),
    );
    const papers = await fetchDailyPapers("2026-05-26");
    expect(papers[0].authors).toBe("");
    expect(papers[0].githubRepo).toBeUndefined();
  });
});

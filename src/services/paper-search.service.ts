/**
 * Multi-source academic paper search service.
 *
 * Searches Semantic Scholar, OpenAlex, and arXiv in parallel,
 * deduplicates results, and returns a unified list.
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
  source: "arxiv" | "semantic_scholar" | "openalex";
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

export class RateLimiter {
  private lastCall: Map<string, number> = new Map();

  constructor(private minIntervalMs: number) {}

  async acquire(source: string): Promise<void> {
    const now = Date.now();
    const last = this.lastCall.get(source) ?? 0;
    const elapsed = now - last;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastCall.set(source, Date.now());
  }
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

      // Respect Retry-After header (seconds) or fall back to exponential backoff
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
// Semantic Scholar adapter
// ---------------------------------------------------------------------------

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract: string | null;
  authors: Array<{ name: string }>;
  externalIds: { ArXiv?: string; DOI?: string } | null;
  url: string;
}

export async function searchSemanticScholar(
  query: string,
  limit: number,
): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: "title,abstract,authors,externalIds,url",
  });
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params}`;

  const headers: Record<string, string> = {};
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;

  const resp = await fetchWithRetry(url, { headers });
  if (!resp) return [];

  const json = (await resp.json()) as { data?: SemanticScholarPaper[] };
  return (json.data ?? []).map((p) => ({
    title: p.title,
    abstract: p.abstract,
    authors: p.authors.map((a) => a.name).join(", "),
    url: p.externalIds?.ArXiv
      ? `https://arxiv.org/abs/${p.externalIds.ArXiv}`
      : p.url,
    arxivId: p.externalIds?.ArXiv ?? null,
    doi: p.externalIds?.DOI ?? null,
    source: "semantic_scholar" as const,
  }));
}

// ---------------------------------------------------------------------------
// OpenAlex adapter
// ---------------------------------------------------------------------------

interface OpenAlexWork {
  title: string;
  abstract_inverted_index: Record<string, number[]> | null;
  authorships: Array<{ author: { display_name: string } }>;
  doi: string | null;
  ids: { openalex?: string };
  primary_location?: { landing_page_url?: string } | null;
}

/**
 * Reconstruct abstract from OpenAlex inverted index format.
 * Keys are words, values are arrays of 0-based positions.
 */
export function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string | null {
  if (!invertedIndex) return null;
  const entries = Object.entries(invertedIndex);
  if (entries.length === 0) return null;

  const words: string[] = [];
  for (const [word, positions] of entries) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(" ");
}

export async function searchOpenAlex(
  query: string,
  limit: number,
): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    search: query,
    per_page: String(limit),
  });
  const email = process.env.OPENALEX_EMAIL;
  if (email) params.set("mailto", email);

  const url = `https://api.openalex.org/works?${params}`;
  const resp = await fetchWithRetry(url);
  if (!resp) return [];

  const json = (await resp.json()) as { results?: OpenAlexWork[] };
  return (json.results ?? []).map((w) => {
    // Strip leading "https://doi.org/" if present
    const rawDoi = w.doi;
    const doi = rawDoi ? rawDoi.replace(/^https?:\/\/doi\.org\//, "") : null;

    return {
      title: w.title,
      abstract: reconstructAbstract(w.abstract_inverted_index),
      authors: w.authorships.map((a) => a.author.display_name).join(", "),
      url: w.primary_location?.landing_page_url ?? w.doi ?? "",
      arxivId: null,
      doi,
      source: "openalex" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// arXiv adapter (Atom XML, regex parsing)
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
  const entries = xml.split("<entry>").slice(1); // first chunk is feed header

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
    // Extract arXiv ID from URL like http://arxiv.org/abs/2301.12345v1
    const arxivId = idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "") || null;
    const doi = (entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) ?? [])[1]?.trim() ?? null;

    return {
      title,
      abstract: summary,
      authors,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : idRaw,
      arxivId,
      doi,
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
    // Try DOI first
    if (paper.doi) {
      const key = `doi:${paper.doi.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(paper);
      continue;
    }
    // Then arXiv ID
    if (paper.arxivId) {
      const key = `arxiv:${paper.arxivId.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(paper);
      continue;
    }
    // Fallback: normalized title
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

const rateLimiter = new RateLimiter(1100);

export async function searchPapers(
  query: string,
  limit: number = 10,
): Promise<PaperResult[]> {
  const [ssResult, oaResult, axResult] = await Promise.allSettled([
    rateLimiter.acquire("semantic_scholar").then(() => searchSemanticScholar(query, limit)),
    rateLimiter.acquire("openalex").then(() => searchOpenAlex(query, limit)),
    rateLimiter.acquire("arxiv").then(() => searchArxiv(query, limit)),
  ]);

  const all: PaperResult[] = [
    ...(ssResult.status === "fulfilled" ? ssResult.value : []),
    ...(oaResult.status === "fulfilled" ? oaResult.value : []),
    ...(axResult.status === "fulfilled" ? axResult.value : []),
  ];

  return deduplicatePapers(all).slice(0, limit);
}

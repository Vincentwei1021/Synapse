/**
 * Paper search and reading service.
 *
 * Primary source: DeepXiv (data.rag.ac.cn)
 * Fallback:       arXiv Atom API (export.arxiv.org)
 *
 * DeepXiv also provides structured paper reading (brief, head, section, full).
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
  citationCount: number | null;
  source: "arxiv" | "deepxiv" | "semantic_scholar" | "openalex";
}

/** Brief summary returned by DeepXiv `type=brief`. */
export interface DeepXivBrief {
  arxivId: string;
  title: string;
  authors: string;
  abstract: string | null;
  tldr: string | null;
  keywords: string[];
  citationCount: number | null;
  githubUrl: string | null;
  year: number | null;
}

/** Paper structure returned by DeepXiv `type=head`. */
export interface DeepXivHead {
  arxivId: string;
  title: string;
  sections: Array<{
    name: string;
    tldr: string | null;
    tokenCount: number | null;
  }>;
}

/** Section content returned by DeepXiv `type=section`. */
export interface DeepXivSectionContent {
  arxivId: string;
  sectionName: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEEPXIV_BASE = "https://data.rag.ac.cn/arxiv/";

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
// DeepXiv auth helper
// ---------------------------------------------------------------------------

let _cachedToken: { value: string | null; expiresAt: number } | null = null;
const TOKEN_CACHE_MS = 60_000; // cache DB lookup for 1 minute

async function deepxivHeaders(): Promise<Record<string, string>> {
  // 1. Env var takes precedence (operator override)
  const envToken = process.env.DEEPXIV_TOKEN;
  if (envToken) {
    return { Authorization: `Bearer ${envToken}` };
  }

  // 2. DB-stored company token (cached)
  const now = Date.now();
  if (!_cachedToken || now > _cachedToken.expiresAt) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const company = await prisma.company.findFirst({
        select: { deepxivToken: true },
      });
      _cachedToken = { value: company?.deepxivToken ?? null, expiresAt: now + TOKEN_CACHE_MS };
    } catch {
      _cachedToken = { value: null, expiresAt: now + TOKEN_CACHE_MS };
    }
  }

  if (_cachedToken.value) {
    return { Authorization: `Bearer ${_cachedToken.value}` };
  }
  return {};
}

/** Clear cached token (call after updating the token in DB). */
export function clearDeepxivTokenCache(): void {
  _cachedToken = null;
}

// ---------------------------------------------------------------------------
// DeepXiv search adapter
// ---------------------------------------------------------------------------

interface DeepXivSearchResult {
  arxiv_id?: string;
  title?: string;
  authors?: string;
  abstract?: string;
  url?: string;
  year?: number;
  citation_count?: number;
}

export async function searchDeepXiv(
  query: string,
  limit: number,
): Promise<PaperResult[]> {
  const params = new URLSearchParams({
    type: "retrieve",
    query,
    size: String(limit),
    search_mode: "hybrid",
  });
  const url = `${DEEPXIV_BASE}?${params}`;

  const resp = await fetchWithRetry(url, { headers: await deepxivHeaders() });
  if (!resp) return [];

  let data: DeepXivSearchResult[];
  try {
    const json = await resp.json();
    data = Array.isArray(json) ? json : [];
  } catch {
    return [];
  }

  return data.map((item) => {
    const arxivId = item.arxiv_id ?? null;
    return {
      title: item.title ?? "",
      abstract: item.abstract ?? null,
      authors: item.authors ?? "",
      url: item.url ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : ""),
      arxivId,
      doi: null,
      year: item.year ?? null,
      citationCount: item.citation_count ?? null,
      source: "deepxiv" as const,
    };
  });
}

// ---------------------------------------------------------------------------
// DeepXiv paper reading functions
// ---------------------------------------------------------------------------

/**
 * Issue a GET against DeepXiv and return the parsed JSON plus the raw status.
 * Unlike `fetchWithRetry`, this preserves the final HTTP status so callers can
 * distinguish 404 "paper not found" from transient failures. Retries 429/5xx.
 */
async function deepxivGet(url: string): Promise<{ status: number; json: unknown | null; authenticated: boolean }> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers = await deepxivHeaders();
      const authenticated = "Authorization" in headers;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers,
      });
      lastStatus = resp.status;
      if (resp.ok) {
        try {
          return { status: resp.status, json: await resp.json(), authenticated };
        } catch {
          return { status: resp.status, json: null, authenticated };
        }
      }
      const retryable = resp.status === 429 || (resp.status >= 500 && resp.status < 600);
      if (!retryable || attempt === MAX_RETRIES) return { status: resp.status, json: null, authenticated };

      const retryAfter = resp.headers.get("Retry-After");
      const delayMs = retryAfter
        ? Number(retryAfter) * 1000
        : BACKOFF_BASE_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    } catch {
      if (attempt === MAX_RETRIES) return { status: lastStatus, json: null, authenticated: false };
      await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
    }
  }
  return { status: lastStatus, json: null, authenticated: false };
}

/**
 * Trigger the public-arXiv fallback when DeepXiv cannot answer the request.
 * - 404 / "paper not found" payload: paper genuinely missing from DeepXiv.
 * - 401 / 403 with no token configured: DeepXiv requires auth we don't have;
 *   fall back to public arXiv rather than failing the agent's read.
 * Authenticated 401/403 means a misconfigured token — surface that as an error.
 */
function deepxivIsNotFound(status: number, json: unknown, authenticated: boolean): boolean {
  if (status === 404) return true;
  if (!authenticated && (status === 401 || status === 403)) return true;
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const msg =
      typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : typeof record.detail === "string"
            ? record.detail
            : null;
    if (msg && /not\s*found/i.test(msg)) return true;
    if (msg && !authenticated && /token\s+is\s+required/i.test(msg)) return true;
  }
  return false;
}

/**
 * Fetch a single paper from the public arXiv Atom API by ID.
 * Used as a fallback when DeepXiv doesn't have the paper (F-025).
 * Returns null only on network/API failure (not on "paper missing").
 */
async function fetchArxivById(arxivId: string): Promise<PaperResult | null> {
  const params = new URLSearchParams({ id_list: arxivId });
  const url = `https://export.arxiv.org/api/query?${params}`;
  const resp = await fetchWithRetry(url);
  if (!resp) return null;
  const xml = await resp.text();
  const entries = xml.split("<entry>").slice(1);
  if (entries.length === 0) return null;
  const entry = entries[0];
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
  const resolvedArxivId =
    idRaw.replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "") || arxivId;
  const doi = (entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) ?? [])[1]?.trim() ?? null;
  const published = (entry.match(/<published>([\s\S]*?)<\/published>/) ?? [])[1]?.trim() ?? null;
  const year = published ? new Date(published).getFullYear() : null;
  if (!title) return null;
  return {
    title,
    abstract: summary,
    authors,
    url: `https://arxiv.org/abs/${resolvedArxivId}`,
    arxivId: resolvedArxivId,
    doi,
    year: year && !isNaN(year) ? year : null,
    citationCount: null,
    source: "arxiv" as const,
  };
}

/** Get brief summary: TLDR, keywords, citation count, GitHub URL. */
export async function readPaperBrief(arxivId: string): Promise<DeepXivBrief | null> {
  const params = new URLSearchParams({ type: "brief", arxiv_id: arxivId });
  const url = `${DEEPXIV_BASE}?${params}`;

  const { status, json, authenticated } = await deepxivGet(url);

  // F-025: fall back to public arXiv when DeepXiv cannot answer (not-found, or
  // unauthenticated 401/403 when no token is configured). Real auth failures
  // with a configured token still surface as null so operators notice.
  if (deepxivIsNotFound(status, json, authenticated)) {
    const arxivPaper = await fetchArxivById(arxivId);
    if (!arxivPaper) return null;
    return {
      arxivId: arxivPaper.arxivId ?? arxivId,
      title: arxivPaper.title,
      authors: arxivPaper.authors,
      abstract: arxivPaper.abstract,
      tldr: null,
      keywords: [],
      citationCount: null,
      githubUrl: null,
      year: arxivPaper.year,
    };
  }

  if (json === null) return null;

  const data = json as Record<string, unknown>;
  return {
    arxivId: (data.arxiv_id as string) ?? arxivId,
    title: (data.title as string) ?? "",
    authors: (data.authors as string) ?? "",
    abstract: (data.abstract as string) ?? null,
    tldr: (data.tldr as string) ?? null,
    keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
    citationCount: (data.citation_count as number) ?? null,
    githubUrl: (data.github_url as string) ?? null,
    year: (data.year as number) ?? null,
  };
}

/** Get paper structure with per-section TLDRs and token counts. */
export async function readPaperHead(arxivId: string): Promise<DeepXivHead | null> {
  const params = new URLSearchParams({ type: "head", arxiv_id: arxivId });
  const url = `${DEEPXIV_BASE}?${params}`;

  const { status, json, authenticated } = await deepxivGet(url);

  // F-025: on "not found" or unauthenticated-no-token, synthesize a minimal
  // head from the public arXiv abstract so agents can at least see the
  // title + abstract.
  if (deepxivIsNotFound(status, json, authenticated)) {
    const arxivPaper = await fetchArxivById(arxivId);
    if (!arxivPaper) return null;
    return {
      arxivId: arxivPaper.arxivId ?? arxivId,
      title: arxivPaper.title,
      sections: arxivPaper.abstract
        ? [{ name: "Abstract", tldr: arxivPaper.abstract, tokenCount: null }]
        : [],
    };
  }

  if (json === null) return null;

  const data = json as Record<string, unknown>;
  const sections = Array.isArray(data.sections)
    ? (data.sections as Array<{ name?: string; tldr?: string; token_count?: number }>).map((s) => ({
        name: s.name ?? "",
        tldr: s.tldr ?? null,
        tokenCount: s.token_count ?? null,
      }))
    : [];
  return {
    arxivId: (data.arxiv_id as string) ?? arxivId,
    title: (data.title as string) ?? "",
    sections,
  };
}

/** Get full text of one section. */
export async function readPaperSection(
  arxivId: string,
  sectionName: string,
): Promise<DeepXivSectionContent | null> {
  const params = new URLSearchParams({
    type: "section",
    arxiv_id: arxivId,
    section: sectionName,
  });
  const url = `${DEEPXIV_BASE}?${params}`;

  const resp = await fetchWithRetry(url, { headers: await deepxivHeaders() });
  if (!resp) return null;

  try {
    const raw = await resp.json();
    // Handle both string and {content: string} response formats
    const content = typeof raw === "string" ? raw : (raw.content ?? "");
    return {
      arxivId,
      sectionName,
      content: String(content),
    };
  } catch {
    return null;
  }
}

/** Get complete paper as raw Markdown. */
export async function readPaperFull(arxivId: string): Promise<string | null> {
  const params = new URLSearchParams({ type: "raw", arxiv_id: arxivId });
  const url = `${DEEPXIV_BASE}?${params}`;

  const resp = await fetchWithRetry(url, { headers: await deepxivHeaders() });
  if (!resp) return null;

  try {
    return await resp.text();
  } catch {
    return null;
  }
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
      citationCount: null,
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

export async function searchPapers(
  query: string,
  limit: number = 10,
): Promise<PaperResult[]> {
  // Try DeepXiv first
  let results = await searchDeepXiv(query, limit);

  // Fall back to arXiv if DeepXiv returned nothing
  if (results.length === 0) {
    results = await searchArxiv(query, limit);
  }

  return deduplicatePapers(results).slice(0, limit);
}

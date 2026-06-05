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
  /** Precise publication date as YYYY-MM-DD, when known. */
  publishedDate: string | null;
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
  /** Precise publication date as YYYY-MM-DD, when known. */
  publishedDate: string | null;
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

/**
 * Normalize a DeepXiv date value (e.g. "2017-06-12T00:00:00", "2017-06-12",
 * or "2017") into a precise YYYY-MM-DD string plus the year. DeepXiv returns
 * the publication date in `date` (search) / `publish_at` (brief); it does NOT
 * return a numeric `year`, so we derive it here. Returns nulls for missing or
 * unparseable input.
 */
function parsePublishedDate(value: unknown): { publishedDate: string | null; year: number | null } {
  if (typeof value !== "string" || value.trim() === "") {
    return { publishedDate: null, year: null };
  }
  // Take the date portion before any time component.
  const datePart = value.split("T")[0].trim();
  const m = datePart.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return { publishedDate: null, year: null };
  const year = Number(m[1]);
  // Only treat as a full date when month and day are present.
  const publishedDate = m[2] && m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
  return { publishedDate, year: Number.isNaN(year) ? null : year };
}

// Auto-registration endpoint + public SDK secret. Mirrors the official DeepXiv
// Python SDK, which silently registers a per-client token on first use when
// none is configured. The secret is a public constant shipped in the SDK; it
// only identifies the caller as a legitimate SDK client (no privileged access).
const DEEPXIV_REGISTER_ENDPOINT = "https://data.rag.ac.cn/api/register/sdk";
const DEEPXIV_SDK_SECRET = "UuZp0i83svQU7_naUEexczc-X3NWv7lvNkD8e3sPyng";

/**
 * Raised when DeepXiv needs an authenticated request but no token is available
 * and auto-registration failed. Callers (MCP tools) surface this to the agent
 * so it knows to configure a token in Settings rather than seeing "no results".
 */
export class DeepXivTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepXivTokenError";
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
// DeepXiv auth helper
// ---------------------------------------------------------------------------

// Cache resolved tokens per company UUID for a short window to avoid a DB
// lookup on every request. Keyed by company UUID; the env-token path bypasses
// this entirely.
const _tokenCache = new Map<string, { value: string | null; expiresAt: number }>();
const TOKEN_CACHE_MS = 60_000; // cache DB lookup for 1 minute

/**
 * Resolve a DeepXiv token for the given company, auto-registering one if the
 * company has none yet (mirrors the official SDK's first-use behavior).
 * Returns null only when no company context is supplied (anonymous reads).
 * Throws {@link DeepXivTokenError} when a token is required but registration
 * fails, so the caller can tell the agent to configure one manually.
 */
async function resolveCompanyToken(companyUuid: string): Promise<string> {
  const now = Date.now();
  const cached = _tokenCache.get(companyUuid);
  if (cached && now < cached.expiresAt && cached.value) {
    return cached.value;
  }

  const { prisma } = await import("@/lib/prisma");
  const company = await prisma.company.findUnique({
    where: { uuid: companyUuid },
    select: { deepxivToken: true },
  });

  if (company?.deepxivToken) {
    _tokenCache.set(companyUuid, { value: company.deepxivToken, expiresAt: now + TOKEN_CACHE_MS });
    return company.deepxivToken;
  }

  // No token yet — auto-register one and persist it to the company.
  const token = await autoRegisterDeepxivToken();
  if (!token) {
    throw new DeepXivTokenError(
      "DeepXiv token is not configured and automatic registration failed. " +
        "Set one in Settings > Integrations (register at data.rag.ac.cn).",
    );
  }
  try {
    await prisma.company.update({
      where: { uuid: companyUuid },
      data: { deepxivToken: token },
    });
  } catch {
    // Persisting failed (e.g. race) — still use the token for this request.
  }
  _tokenCache.set(companyUuid, { value: token, expiresAt: now + TOKEN_CACHE_MS });
  return token;
}

/**
 * Build auth headers for a DeepXiv request.
 * - With `companyUuid`: resolve (and if needed auto-register) the company token.
 * - Without `companyUuid`: env token if present, otherwise anonymous (the
 *   public-arXiv fallback path relies on this for unauthenticated reads).
 */
async function deepxivHeaders(companyUuid?: string): Promise<Record<string, string>> {
  // 1. Env var takes precedence (operator override).
  const envToken = process.env.DEEPXIV_TOKEN;
  if (envToken) {
    return { Authorization: `Bearer ${envToken}` };
  }

  // 2. Per-company token (auto-registered on first use).
  if (companyUuid) {
    const token = await resolveCompanyToken(companyUuid);
    return { Authorization: `Bearer ${token}` };
  }

  // 3. No company context: anonymous.
  return {};
}

/** Register a fresh DeepXiv token via the public SDK endpoint. Returns null on failure. */
async function autoRegisterDeepxivToken(): Promise<string | null> {
  // Random, opaque registration identity (matches the SDK's payload shape).
  const suffix =
    Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 4);
  const payload = {
    sdk_secret: DEEPXIV_SDK_SECRET,
    name: `deepxiv_${suffix}`,
    email: `${suffix}@example.com`,
  };
  try {
    const resp = await fetch(DEEPXIV_REGISTER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { success?: boolean; data?: { token?: string } };
    if (!json.success) return null;
    return json.data?.token ?? null;
  } catch {
    return null;
  }
}

/** Clear cached token(s). Call after updating the token in DB. */
export function clearDeepxivTokenCache(companyUuid?: string): void {
  if (companyUuid) {
    _tokenCache.delete(companyUuid);
  } else {
    _tokenCache.clear();
  }
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
  /** Publication date, e.g. "2017-06-12T00:00:00". DeepXiv does not send `year`. */
  date?: string;
  citation_count?: number;
}

export type DeepXivDateSearchType = "exact" | "after" | "before" | "between";

export interface DeepXivDateFilter {
  /** "exact" / "after" / "before" / "between". For "between", pass two values in `dateStr`. */
  dateSearchType: DeepXivDateSearchType;
  /** YYYY / YYYY-MM / YYYY-MM-DD. Pass two-element tuple for "between". */
  dateStr: string | [string, string];
}

export interface SearchPapersOptions {
  dateFilter?: DeepXivDateFilter;
  /** Company context for per-company token resolution / auto-registration. */
  companyUuid?: string;
}

export async function searchDeepXiv(
  query: string,
  limit: number,
  options: SearchPapersOptions = {},
): Promise<PaperResult[]> {
  // `top_k` is the upstream result-count param (the SDK contract); `size` is
  // ignored by the endpoint. `search_mode` is deprecated and also ignored.
  const params = new URLSearchParams({
    type: "retrieve",
    query,
    top_k: String(limit),
  });
  if (options.dateFilter) {
    params.set("date_search_type", options.dateFilter.dateSearchType);
    const ds = options.dateFilter.dateStr;
    if (Array.isArray(ds)) {
      // DeepXiv expects two `date_str` entries for "between"
      params.append("date_str", ds[0]);
      params.append("date_str", ds[1]);
    } else {
      params.set("date_str", ds);
    }
  }
  const url = `${DEEPXIV_BASE}?${params}`;

  const resp = await fetchWithRetry(url, { headers: await deepxivHeaders(options.companyUuid) });
  if (!resp) return [];

  let data: DeepXivSearchResult[];
  try {
    const json = await resp.json();
    if (Array.isArray(json)) {
      data = json;
    } else if (json && typeof json === "object" && Array.isArray((json as { result?: unknown }).result)) {
      data = (json as { result: DeepXivSearchResult[] }).result;
    } else {
      data = [];
    }
  } catch {
    return [];
  }

  return data.map((item) => {
    const arxivId = item.arxiv_id ?? null;
    const { publishedDate, year } = parsePublishedDate(item.date);
    return {
      title: item.title ?? "",
      abstract: item.abstract ?? null,
      authors: item.authors ?? "",
      url: item.url ?? (arxivId ? `https://arxiv.org/abs/${arxivId}` : ""),
      arxivId,
      doi: null,
      publishedDate,
      year,
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
async function deepxivGet(
  url: string,
  companyUuid?: string,
): Promise<{ status: number; json: unknown | null; authenticated: boolean }> {
  // Resolve headers once, outside the retry loop, so a DeepXivTokenError from
  // auto-registration propagates to the caller instead of being swallowed by
  // the loop's catch (and so we don't re-register on every retry).
  const headers = await deepxivHeaders(companyUuid);
  const authenticated = "Authorization" in headers;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
  const { publishedDate, year } = parsePublishedDate(published);
  if (!title) return null;
  return {
    title,
    abstract: summary,
    authors,
    url: `https://arxiv.org/abs/${resolvedArxivId}`,
    arxivId: resolvedArxivId,
    doi,
    publishedDate,
    year,
    citationCount: null,
    source: "arxiv" as const,
  };
}

/** Get brief summary: TLDR, keywords, citation count, GitHub URL. */
export async function readPaperBrief(arxivId: string, companyUuid?: string): Promise<DeepXivBrief | null> {
  const params = new URLSearchParams({ type: "brief", arxiv_id: arxivId });
  const url = `${DEEPXIV_BASE}?${params}`;

  const { status, json, authenticated } = await deepxivGet(url, companyUuid);

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
      publishedDate: arxivPaper.publishedDate,
      year: arxivPaper.year,
    };
  }

  if (json === null) return null;

  const data = json as Record<string, unknown>;
  // DeepXiv brief returns the date in `publish_at` and citations in `citations`
  // (with `citation_count` as a legacy alias). It does not return a numeric year.
  const { publishedDate, year } = parsePublishedDate(data.publish_at ?? data.date);
  return {
    arxivId: (data.arxiv_id as string) ?? arxivId,
    title: (data.title as string) ?? "",
    authors: (data.authors as string) ?? "",
    abstract: (data.abstract as string) ?? null,
    tldr: (data.tldr as string) ?? null,
    keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
    citationCount: (data.citations as number) ?? (data.citation_count as number) ?? null,
    githubUrl: (data.github_url as string) ?? null,
    publishedDate,
    year,
  };
}

/** Get paper structure with per-section TLDRs and token counts. */
export async function readPaperHead(arxivId: string, companyUuid?: string): Promise<DeepXivHead | null> {
  const params = new URLSearchParams({ type: "head", arxiv_id: arxivId });
  const url = `${DEEPXIV_BASE}?${params}`;

  const { status, json, authenticated } = await deepxivGet(url, companyUuid);

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
  companyUuid?: string,
): Promise<DeepXivSectionContent | null> {
  const params = new URLSearchParams({
    type: "section",
    arxiv_id: arxivId,
    section: sectionName,
  });
  const url = `${DEEPXIV_BASE}?${params}`;

  const resp = await fetchWithRetry(url, { headers: await deepxivHeaders(companyUuid) });
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
export async function readPaperFull(arxivId: string, companyUuid?: string): Promise<string | null> {
  const params = new URLSearchParams({ type: "raw", arxiv_id: arxivId });
  const url = `${DEEPXIV_BASE}?${params}`;

  const resp = await fetchWithRetry(url, { headers: await deepxivHeaders(companyUuid) });
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
    const { publishedDate, year } = parsePublishedDate(published);

    return {
      title,
      abstract: summary,
      authors,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : idRaw,
      arxivId,
      doi,
      publishedDate,
      year,
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
  options: SearchPapersOptions = {},
): Promise<PaperResult[]> {
  // Try DeepXiv first
  let results = await searchDeepXiv(query, limit, options);

  // Fall back to arXiv only when no date filter is requested. The arXiv
  // Atom search has no equivalent date predicate, so silently falling back
  // would return papers outside the requested window.
  if (results.length === 0 && !options.dateFilter) {
    results = await searchArxiv(query, limit);
  }

  return deduplicatePapers(results).slice(0, limit);
}

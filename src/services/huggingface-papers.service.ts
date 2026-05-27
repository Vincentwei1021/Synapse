import { fetchWithRetry } from "@/services/paper-search.service";

export interface HFDailyPaper {
  id: string;
  arxivId: string | null;
  title: string;
  authors: string;
  summary: string;
  publishedAt: string | null;
  paperUrl: string;
  githubRepo?: string;
}

interface HFRawAuthor { name?: string }
interface HFRawPaperWrapper {
  paper?: {
    id?: string;
    title?: string;
    authors?: HFRawAuthor[];
    summary?: string;
    publishedAt?: string;
    githubRepo?: string;
  };
}

const HF_BASE = "https://huggingface.co/api/daily_papers";

export async function fetchDailyPapers(date: string): Promise<HFDailyPaper[]> {
  const url = `${HF_BASE}?date=${encodeURIComponent(date)}`;
  const resp = await fetchWithRetry(url);
  if (!resp) return [];
  let raw: unknown;
  try {
    raw = await resp.json();
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return (raw as HFRawPaperWrapper[]).flatMap((wrap) => {
    const p = wrap?.paper;
    if (!p?.id || !p.title) return [];
    return [{
      id: p.id,
      arxivId: p.id, // HF uses arxiv ID as paper id
      title: p.title,
      authors: (p.authors ?? []).map((a) => a.name ?? "").filter(Boolean).join(", "),
      summary: p.summary ?? "",
      publishedAt: p.publishedAt ?? null,
      paperUrl: `https://huggingface.co/papers/${p.id}`,
      githubRepo: p.githubRepo,
    }];
  });
}

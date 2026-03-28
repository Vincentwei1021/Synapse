import { prisma } from "@/lib/prisma";

export interface RelatedWorkResponse {
  uuid: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  url: string;
  arxivId: string | null;
  source: string;
  addedBy: string;
  addedByAgentUuid: string | null;
  createdAt: string;
}

function formatRelatedWork(rw: {
  uuid: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  url: string;
  arxivId: string | null;
  source: string;
  addedBy: string;
  addedByAgentUuid: string | null;
  createdAt: Date;
}): RelatedWorkResponse {
  return {
    uuid: rw.uuid,
    title: rw.title,
    authors: rw.authors,
    abstract: rw.abstract,
    url: rw.url,
    arxivId: rw.arxivId,
    source: rw.source,
    addedBy: rw.addedBy,
    addedByAgentUuid: rw.addedByAgentUuid,
    createdAt: rw.createdAt.toISOString(),
  };
}

export async function listRelatedWorks(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<RelatedWorkResponse[]> {
  const works = await prisma.relatedWork.findMany({
    where: { companyUuid, researchProjectUuid },
    orderBy: { createdAt: "desc" },
  });
  return works.map(formatRelatedWork);
}

export async function createRelatedWork(input: {
  companyUuid: string;
  researchProjectUuid: string;
  title: string;
  authors?: string | null;
  abstract?: string | null;
  url: string;
  arxivId?: string | null;
  source: string;
  addedBy: string;
  addedByAgentUuid?: string | null;
}): Promise<RelatedWorkResponse> {
  const rw = await prisma.relatedWork.create({
    data: {
      companyUuid: input.companyUuid,
      researchProjectUuid: input.researchProjectUuid,
      title: input.title,
      authors: input.authors ?? null,
      abstract: input.abstract ?? null,
      url: input.url,
      arxivId: input.arxivId ?? null,
      source: input.source,
      addedBy: input.addedBy,
      addedByAgentUuid: input.addedByAgentUuid ?? null,
    },
  });
  return formatRelatedWork(rw);
}

export async function deleteRelatedWork(
  companyUuid: string,
  uuid: string,
): Promise<void> {
  await prisma.relatedWork.deleteMany({
    where: { uuid, companyUuid },
  });
}

export async function fetchArxivMetadata(url: string): Promise<{
  title: string;
  authors: string;
  abstract: string;
  arxivId: string;
} | null> {
  const match = url.match(/arxiv\.org\/abs\/([0-9]+\.[0-9]+)/);
  if (!match) return null;
  const arxivId = match[1];

  try {
    // Use curl for reliability — Node fetch has issues with arXiv's redirect + rate limiting
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout: xml } = await execFileAsync(
      "curl",
      ["-sL", "--max-time", "20", `https://export.arxiv.org/api/query?id_list=${arxivId}`],
      { timeout: 25000, maxBuffer: 1024 * 1024 },
    );

    // Parse XML — arXiv API returns Atom feed with entries
    const entries = xml.split("<entry>");
    if (entries.length < 2) return null;
    const entry = entries[1];

    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const authorMatches = [...entry.matchAll(/<name>(.*?)<\/name>/g)];

    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const abstract = summaryMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const authors = authorMatches.map((m) => m[1]).join(", ");

    if (!title) return null;
    return { title, authors, abstract, arxivId };
  } catch {
    return null;
  }
}

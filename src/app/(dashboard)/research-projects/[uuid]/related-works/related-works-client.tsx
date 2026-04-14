"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, Check, ExternalLink, Loader2, Plus, Search, Settings, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import type { RelatedWorkResponse } from "@/services/related-work.service";

interface AgentOption {
  uuid: string;
  name: string;
}

interface DeepResearchDocInfo {
  uuid: string;
  version: number;
  updatedAt: string;
}

interface RelatedWorksClientProps {
  projectUuid: string;
  initialWorks: RelatedWorkResponse[];
  agents: AgentOption[];
  deepResearchDoc: DeepResearchDocInfo | null;
}

export function RelatedWorksClient({
  projectUuid,
  initialWorks,
  agents,
  deepResearchDoc: initialDeepResearchDoc,
}: RelatedWorksClientProps) {
  const router = useRouter();
  const t = useTranslations("relatedWorks");
  const [works, setWorks] = useState(initialWorks);

  // Sync state when server component re-renders with new data (e.g. after SSE refresh)
  useEffect(() => { setWorks(initialWorks); }, [initialWorks]);
  useEffect(() => { setDeepResearchDoc(initialDeepResearchDoc); }, [initialDeepResearchDoc]);

  // Auto-search state (one-shot trigger)
  const [autoSearchAgentUuid, setAutoSearchAgentUuid] = useState<string>("");
  const [searchingPapers, setSearchingPapers] = useState(false);
  const [searchTriggeredAgent, setSearchTriggeredAgent] = useState<string | null>(null);

  // Deep research state
  const [deepResearchDoc, setDeepResearchDoc] = useState<DeepResearchDocInfo | null>(initialDeepResearchDoc);
  const [deepResearchAgentUuid, setDeepResearchAgentUuid] = useState<string>("");
  const [generatingDeepResearch, setGeneratingDeepResearch] = useState(false);
  const [deepResearchTriggeredAgent, setDeepResearchTriggeredAgent] = useState<string | null>(null);

  // Auto-clear triggered banners after 8s
  useEffect(() => {
    if (!searchTriggeredAgent) return;
    const t = setTimeout(() => setSearchTriggeredAgent(null), 8000);
    return () => clearTimeout(t);
  }, [searchTriggeredAgent]);

  useEffect(() => {
    if (!deepResearchTriggeredAgent) return;
    const t = setTimeout(() => setDeepResearchTriggeredAgent(null), 8000);
    return () => clearTimeout(t);
  }, [deepResearchTriggeredAgent]);

  // Prompt editing state — additional instructions appended to built-in prompt
  const [searchPrompt, setSearchPrompt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`${projectUuid}:searchPrompt`) ?? "";
  });
  const [deepResearchPrompt, setDeepResearchPrompt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`${projectUuid}:deepResearchPrompt`) ?? "";
  });
  const [promptDialogOpen, setPromptDialogOpen] = useState<"search" | "deepResearch" | null>(null);
  const [promptDraft, setPromptDraft] = useState("");

  const openPromptDialog = useCallback((type: "search" | "deepResearch") => {
    const current = type === "search" ? searchPrompt : deepResearchPrompt;
    setPromptDraft(current);
    setPromptDialogOpen(type);
  }, [searchPrompt, deepResearchPrompt]);

  const savePrompt = useCallback(() => {
    if (!promptDialogOpen) return;
    const key = promptDialogOpen === "search" ? "searchPrompt" : "deepResearchPrompt";
    const trimmed = promptDraft.trim();
    if (!trimmed) {
      localStorage.removeItem(`${projectUuid}:${key}`);
    } else {
      localStorage.setItem(`${projectUuid}:${key}`, trimmed);
    }
    if (promptDialogOpen === "search") setSearchPrompt(trimmed);
    else setDeepResearchPrompt(trimmed);
    setPromptDialogOpen(null);
  }, [promptDialogOpen, promptDraft, projectUuid]);

  // Add paper dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paperUrl, setPaperUrl] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [paperAuthors, setPaperAuthors] = useState("");
  const [paperAbstract, setPaperAbstract] = useState("");
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [addingPaper, setAddingPaper] = useState(false);
  const [addPaperError, setAddPaperError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  // Realtime refresh — auto-refreshes server data on SSE events
  useRealtimeRefresh();

  // --- Auto-search (one-shot trigger) ---
  const handleAutoSearch = useCallback(async () => {
    if (!autoSearchAgentUuid) return;
    setSearchingPapers(true);
    setSearchTriggeredAgent(null);
    try {
      const res = await fetch(
        `/api/research-projects/${projectUuid}/related-works/auto-search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentUuid: autoSearchAgentUuid, customPrompt: searchPrompt || undefined }),
        },
      );
      if (res.ok) {
        const agentName = agents.find((a) => a.uuid === autoSearchAgentUuid)?.name ?? "";
        setSearchTriggeredAgent(agentName);
      }
    } finally {
      setSearchingPapers(false);
    }
  }, [projectUuid, autoSearchAgentUuid, agents, searchPrompt]);

  // --- Deep research ---
  const handleGenerateDeepResearch = useCallback(async () => {
    if (!deepResearchAgentUuid) return;
    setGeneratingDeepResearch(true);
    setDeepResearchTriggeredAgent(null);
    try {
      const res = await fetch(
        `/api/research-projects/${projectUuid}/related-works/deep-research`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentUuid: deepResearchAgentUuid, customPrompt: deepResearchPrompt || undefined }),
        },
      );
      if (res.ok) {
        const agentName = agents.find((a) => a.uuid === deepResearchAgentUuid)?.name ?? "";
        setDeepResearchTriggeredAgent(agentName);
      }
    } finally {
      setGeneratingDeepResearch(false);
    }
  }, [projectUuid, deepResearchAgentUuid, agents, deepResearchPrompt]);

  // --- URL metadata fetch (client-side arXiv API) ---
  const handleUrlBlur = useCallback(async () => {
    if (!paperUrl || !paperUrl.includes("arxiv.org/")) return;
    if (paperTitle) return; // Already populated
    const match = paperUrl.match(/arxiv\.org\/(?:abs|pdf|html)\/([0-9]+\.[0-9]+)/);
    if (!match) return;
    setFetchingMeta(true);
    try {
      const arxivId = match[1];
      const resp = await fetch(
        `https://export.arxiv.org/api/query?id_list=${arxivId}`,
      );
      const xml = await resp.text();
      const entries = xml.split("<entry>");
      if (entries.length >= 2) {
        const entry = entries[1];
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
        const authorMatches = [...entry.matchAll(/<name>(.*?)<\/name>/g)];
        if (titleMatch?.[1]) {
          setPaperTitle(titleMatch[1].replace(/\s+/g, " ").trim());
        }
        if (summaryMatch?.[1]) {
          setPaperAbstract(summaryMatch[1].replace(/\s+/g, " ").trim());
        }
        if (authorMatches.length > 0) {
          setPaperAuthors(authorMatches.map((m) => m[1]).join(", "));
        }
      }
    } catch {
      // Silently ignore fetch failures
    } finally {
      setFetchingMeta(false);
    }
  }, [paperUrl, paperTitle]);

  // --- Add paper ---
  const handleAddPaper = useCallback(async () => {
    if (!paperUrl) return;
    setAddingPaper(true);
    setAddPaperError(null);
    try {
      const res = await fetch(
        `/api/research-projects/${projectUuid}/related-works`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: paperUrl,
            title: paperTitle || undefined,
            authors: paperAuthors || undefined,
            abstract: paperAbstract || undefined,
          }),
        },
      );
      const data = await res.json();
      if (data.success && data.data?.relatedWork) {
        setWorks((prev) => [data.data.relatedWork, ...prev]);
        setDialogOpen(false);
        setPaperUrl("");
        setPaperTitle("");
        setPaperAuthors("");
        setPaperAbstract("");
        setAddPaperError(null);
      } else {
        // Show server validation error (e.g. title could not be auto-fetched)
        const errorMsg =
          data.error?.details?.title ||
          data.error?.message ||
          t("addPaperError");
        setAddPaperError(typeof errorMsg === "string" ? errorMsg : String(errorMsg));
      }
    } catch {
      setAddPaperError(t("addPaperError"));
    } finally {
      setAddingPaper(false);
    }
  }, [projectUuid, paperUrl, paperTitle, paperAuthors, paperAbstract, t]);

  // --- Delete paper ---
  const handleDeletePaper = useCallback(
    async (workUuid: string) => {
      await fetch(
        `/api/research-projects/${projectUuid}/related-works/${workUuid}`,
        { method: "DELETE" },
      );
      setWorks((prev) => prev.filter((w) => w.uuid !== workUuid));
    },
    [projectUuid],
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => { setAddPaperError(null); setDialogOpen(true); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("addPaper")}
        </Button>
      </div>

      {/* Control cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Auto-search control */}
        <Card className="rounded-2xl border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">
                  {t("autoSearch")}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("autoSearchDesc")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => openPromptDialog("search")}
              title={t("editPrompt")}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <select
              value={autoSearchAgentUuid}
              onChange={(e) => { setAutoSearchAgentUuid(e.target.value); setSearchTriggeredAgent(null); }}
              disabled={searchingPapers}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            >
              <option value="">{t("selectAgent")}</option>
              {agents.map((agent) => (
                <option key={agent.uuid} value={agent.uuid}>
                  {agent.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!autoSearchAgentUuid || searchingPapers || !!searchTriggeredAgent}
              onClick={handleAutoSearch}
              className={searchTriggeredAgent
                ? "bg-emerald-600 text-white hover:bg-emerald-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90"}
            >
              {searchingPapers ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : searchTriggeredAgent ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : null}
              {searchTriggeredAgent ? t("sent") : t("search")}
            </Button>
          </div>
        </Card>

        {/* Deep Research control */}
        <Card className="rounded-2xl border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">
                  {t("deepResearch")}
                </h3>
              </div>
              {deepResearchDoc ? (
                <Link
                  href={`/research-projects/${projectUuid}/documents/${deepResearchDoc.uuid}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  v{deepResearchDoc.version} {t("lastUpdated", { time: new Date(deepResearchDoc.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })} &rarr;
                </Link>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("noReport")}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => openPromptDialog("deepResearch")}
              title={t("editPrompt")}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <select
              value={deepResearchAgentUuid}
              onChange={(e) => { setDeepResearchAgentUuid(e.target.value); setDeepResearchTriggeredAgent(null); }}
              disabled={generatingDeepResearch}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            >
              <option value="">{t("selectAgent")}</option>
              {agents.map((agent) => (
                <option key={agent.uuid} value={agent.uuid}>
                  {agent.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!deepResearchAgentUuid || generatingDeepResearch || !!deepResearchTriggeredAgent}
              onClick={handleGenerateDeepResearch}
              className={deepResearchTriggeredAgent
                ? "bg-emerald-600 text-white hover:bg-emerald-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90"}
            >
              {generatingDeepResearch ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : deepResearchTriggeredAgent ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : null}
              {deepResearchTriggeredAgent ? t("sent") : t("generate")}
            </Button>
          </div>
        </Card>
      </div>

      {/* Paper list */}
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t("papersCount", { count: works.length })}
            {works.length > 0 && (
              <span className="ml-1 text-muted-foreground/60">
                ({t("lastUpdated", { time: new Date(works[0].createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })})
              </span>
            )}
          </p>
          {works.length > 0 && (
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={t("filterPlaceholder")}
              className="h-8 w-56 text-xs"
            />
          )}
        </div>

        {works.length === 0 ? (
          <Card className="flex flex-col items-center justify-center rounded-2xl border-border bg-card px-6 py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {t("noPapers")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("noPapersDesc")}
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {works.filter((p) => {
              if (!filterQuery) return true;
              const q = filterQuery.toLowerCase();
              return (
                p.title.toLowerCase().includes(q) ||
                (p.authors?.toLowerCase().includes(q)) ||
                (p.abstract?.toLowerCase().includes(q)) ||
                (p.arxivId?.toLowerCase().includes(q))
              );
            }).map((paper) => (
              <a
                key={paper.uuid}
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Card className="rounded-2xl border-border bg-card p-5 transition-colors hover:border-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Title */}
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {paper.title}
                        </h3>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>

                      {/* Meta: authors, arxivId, year */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {paper.authors && <span>{paper.authors}</span>}
                        {paper.arxivId && (
                          <span className="font-mono">{paper.arxivId}</span>
                        )}
                        {paper.publishedYear && (
                          <span>{paper.publishedYear}</span>
                        )}
                      </div>

                      {/* Abstract */}
                      {paper.abstract && (
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                          {paper.abstract}
                        </p>
                      )}

                      {/* Badges */}
                      <div className="mt-3 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            paper.source === "arxiv"
                              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                              : "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-300"
                          }
                        >
                          {paper.source}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            paper.addedBy === "manual"
                              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                              : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                          }
                        >
                          {paper.addedBy === "manual"
                            ? t("manual")
                            : t("auto")}
                        </Badge>
                      </div>
                    </div>

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeletePaper(paper.uuid);
                      }}
                      title={t("deletePaper")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Add Paper dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addPaperTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="paper-url">{t("urlLabel")}</Label>
              <Input
                id="paper-url"
                placeholder={t("urlPlaceholder")}
                value={paperUrl}
                onChange={(e) => setPaperUrl(e.target.value)}
                onBlur={handleUrlBlur}
              />
              {fetchingMeta && (
                <p className="text-xs text-muted-foreground">
                  {t("fetchingMetadata")}
                </p>
              )}
            </div>

          </div>
          {addPaperError && (
            <p className="text-sm text-destructive">{addPaperError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleAddPaper}
              disabled={!paperUrl || addingPaper}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t("addPaper")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prompt editing dialog */}
      <Dialog open={!!promptDialogOpen} onOpenChange={(open) => { if (!open) setPromptDialogOpen(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editPromptTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("promptLabel")}</Label>
            <Textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder={promptDialogOpen === "deepResearch" ? t("deepResearchPromptPlaceholder") : t("searchPromptPlaceholder")}
              rows={6}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("promptHint")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={savePrompt} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

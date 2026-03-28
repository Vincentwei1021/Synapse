"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, ExternalLink, Plus, Trash2, Sparkles } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import type { RelatedWorkResponse } from "@/services/related-work.service";

interface AgentOption {
  uuid: string;
  name: string;
}

interface RelatedWorksClientProps {
  projectUuid: string;
  initialWorks: RelatedWorkResponse[];
  agents: AgentOption[];
  autoSearchEnabled: boolean;
  autoSearchAgentUuid: string | null;
  deepResearchDocUuid: string | null;
}

export function RelatedWorksClient({
  projectUuid,
  initialWorks,
  agents,
  autoSearchEnabled: initialAutoSearch,
  autoSearchAgentUuid: initialAutoSearchAgent,
  deepResearchDocUuid: initialDeepResearchDoc,
}: RelatedWorksClientProps) {
  const router = useRouter();
  const t = useTranslations("relatedWorks");
  const [works, setWorks] = useState(initialWorks);

  // Auto-search state
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(initialAutoSearch);
  const [autoSearchAgentUuid, setAutoSearchAgentUuid] = useState<string | null>(
    initialAutoSearchAgent,
  );

  // Deep research state
  const [deepResearchDocUuid] = useState<string | null>(initialDeepResearchDoc);
  const [deepResearchAgentUuid, setDeepResearchAgentUuid] = useState<string>("");
  const [generatingDeepResearch, setGeneratingDeepResearch] = useState(false);

  // Add paper dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paperUrl, setPaperUrl] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [paperAuthors, setPaperAuthors] = useState("");
  const [paperAbstract, setPaperAbstract] = useState("");
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [addingPaper, setAddingPaper] = useState(false);

  // Realtime refresh — auto-refreshes server data on SSE events
  useRealtimeRefresh();

  // --- Auto-search toggle ---
  const handleAutoSearchToggle = useCallback(
    async (enabled: boolean) => {
      setAutoSearchEnabled(enabled);
      const newAgentUuid = enabled ? autoSearchAgentUuid : null;
      await fetch(`/api/research-projects/${projectUuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSearchEnabled: enabled,
          autoSearchAgentUuid: newAgentUuid,
        }),
      });
    },
    [projectUuid, autoSearchAgentUuid],
  );

  const handleAutoSearchAgentChange = useCallback(
    async (agentUuid: string) => {
      const val = agentUuid || null;
      setAutoSearchAgentUuid(val);
      await fetch(`/api/research-projects/${projectUuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSearchEnabled,
          autoSearchAgentUuid: val,
        }),
      });
    },
    [projectUuid, autoSearchEnabled],
  );

  // --- Deep research ---
  const handleGenerateDeepResearch = useCallback(async () => {
    if (!deepResearchAgentUuid) return;
    setGeneratingDeepResearch(true);
    try {
      await fetch(
        `/api/research-projects/${projectUuid}/related-works/deep-research`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentUuid: deepResearchAgentUuid }),
        },
      );
      router.refresh();
    } finally {
      setGeneratingDeepResearch(false);
    }
  }, [projectUuid, deepResearchAgentUuid, router]);

  // --- URL metadata fetch (client-side arXiv API) ---
  const handleUrlBlur = useCallback(async () => {
    if (!paperUrl || !paperUrl.includes("arxiv.org/abs/")) return;
    if (paperTitle) return; // Already populated
    const match = paperUrl.match(/arxiv\.org\/abs\/([0-9]+\.[0-9]+)/);
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
      }
      setDialogOpen(false);
      setPaperUrl("");
      setPaperTitle("");
      setPaperAuthors("");
      setPaperAbstract("");
    } finally {
      setAddingPaper(false);
    }
  }, [projectUuid, paperUrl, paperTitle, paperAuthors, paperAbstract]);

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

  const selectedAutoAgent = agents.find((a) => a.uuid === autoSearchAgentUuid);

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
          onClick={() => setDialogOpen(true)}
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {t("autoSearch")}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("autoSearchDesc")}
              </p>
            </div>
            <Switch
              checked={autoSearchEnabled}
              onCheckedChange={handleAutoSearchToggle}
            />
          </div>

          {autoSearchEnabled && (
            <div className="mt-4 space-y-3">
              <select
                value={autoSearchAgentUuid || ""}
                onChange={(e) => handleAutoSearchAgentChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">{t("selectAgent")}</option>
                {agents.map((agent) => (
                  <option key={agent.uuid} value={agent.uuid}>
                    {agent.name}
                  </option>
                ))}
              </select>

              {autoSearchEnabled && !autoSearchAgentUuid && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("selectAgentToActivate")}
                </p>
              )}

              {autoSearchEnabled && selectedAutoAgent && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {t("activeWith", { agent: selectedAutoAgent.name })}
                </p>
              )}
            </div>
          )}
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
              {deepResearchDocUuid ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t("lastGenerated")}
                  </span>
                  <Link
                    href={`/research-projects/${projectUuid}/documents/${deepResearchDocUuid}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t("viewDocument")} &rarr;
                  </Link>
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("noReport")}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <select
              value={deepResearchAgentUuid}
              onChange={(e) => setDeepResearchAgentUuid(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              disabled={!deepResearchAgentUuid || generatingDeepResearch}
              onClick={handleGenerateDeepResearch}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t("generate")}
            </Button>
          </div>
        </Card>
      </div>

      {/* Paper list */}
      <div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("papersCount", { count: works.length })}
        </p>

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
            {works.map((paper) => (
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
                        {paper.createdAt && (
                          <span>
                            {new Date(paper.createdAt).getFullYear()}
                          </span>
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

            <div className="space-y-2">
              <Label htmlFor="paper-title">{t("titleLabel")}</Label>
              <Input
                id="paper-title"
                value={paperTitle}
                onChange={(e) => setPaperTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paper-authors">{t("authorsLabel")}</Label>
              <Input
                id="paper-authors"
                value={paperAuthors}
                onChange={(e) => setPaperAuthors(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paper-abstract">{t("abstractLabel")}</Label>
              <Textarea
                id="paper-abstract"
                rows={4}
                value={paperAbstract}
                onChange={(e) => setPaperAbstract(e.target.value)}
              />
            </div>
          </div>
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
    </div>
  );
}

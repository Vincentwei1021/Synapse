"use client";

import { useState, useCallback, useEffect } from "react";
import { Check, Loader2, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/markdown-content";
import { GlowBorder } from "@/components/glow-border";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import { getAgentColor } from "@/lib/agent-colors";

interface AgentOption {
  uuid: string;
  name: string;
  type: string;
}

interface CompletedExperiment {
  uuid: string;
  title: string;
  outcome: string | null;
  researchQuestionTitle: string | null;
}

interface InsightsClientProps {
  projectUuid: string;
  agents: AgentOption[];
  synthesisActiveAgentUuid: string | null;
  synthesisContent: string | null;
  latestSynthesisAt: string | null;
  latestSynthesisIdeaCount: number;
  latestSynthesisSummary: string | null;
  completedExperiments: CompletedExperiment[];
  labels: Record<string, string>;
}

export function InsightsClient({
  projectUuid,
  agents,
  synthesisActiveAgentUuid,
  synthesisContent,
  latestSynthesisAt,
  latestSynthesisIdeaCount,
  latestSynthesisSummary,
  completedExperiments,
  labels,
}: InsightsClientProps) {
  const [agentUuid, setAgentUuid] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [triggeredAgent, setTriggeredAgent] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [customPrompt, setCustomPrompt] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`${projectUuid}:synthesisPrompt`) ?? "";
  });

  useRealtimeRefresh();

  const isRunning = Boolean(synthesisActiveAgentUuid);
  const resolvedAgentUuid = agentUuid || synthesisActiveAgentUuid || "";

  useEffect(() => {
    if (!triggeredAgent) return;
    const t = setTimeout(() => setTriggeredAgent(null), 8000);
    return () => clearTimeout(t);
  }, [triggeredAgent]);

  const handleTrigger = useCallback(async () => {
    if (!resolvedAgentUuid) return;
    setIsSubmitting(true);
    setTriggeredAgent(null);
    try {
      const res = await fetch(
        `/api/research-projects/${projectUuid}/synthesis/trigger`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentUuid: resolvedAgentUuid, customPrompt: customPrompt || undefined }),
        },
      );
      if (res.ok) {
        const name = agents.find((a) => a.uuid === resolvedAgentUuid)?.name ?? "";
        setTriggeredAgent(name);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [projectUuid, resolvedAgentUuid, agents, customPrompt]);

  const openPromptDialog = useCallback(() => {
    setPromptDraft(customPrompt);
    setPromptDialogOpen(true);
  }, [customPrompt]);

  const savePrompt = useCallback(() => {
    const trimmed = promptDraft.trim();
    if (!trimmed) {
      localStorage.removeItem(`${projectUuid}:synthesisPrompt`);
    } else {
      localStorage.setItem(`${projectUuid}:synthesisPrompt`, trimmed);
    }
    setCustomPrompt(trimmed);
    setPromptDialogOpen(false);
  }, [promptDraft, projectUuid]);

  const activeAgent = synthesisActiveAgentUuid
    ? agents.find((a) => a.uuid === synthesisActiveAgentUuid)
    : null;
  const glowColors = activeAgent
    ? getAgentColor(activeAgent.uuid, null)
    : { primary: "#6366f1", light: "#22d3ee" };

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{labels.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={openPromptDialog}
            title={labels.editPrompt}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <select
            value={resolvedAgentUuid}
            onChange={(e) => { setAgentUuid(e.target.value); setTriggeredAgent(null); }}
            disabled={isSubmitting || isRunning}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            <option value="">{labels.selectAgent}</option>
            {agents.map((agent) => (
              <option key={agent.uuid} value={agent.uuid}>
                {agent.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!resolvedAgentUuid || isSubmitting || !!triggeredAgent || isRunning}
            onClick={handleTrigger}
            className={triggeredAgent
              ? "gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600"
              : isRunning
                ? "gap-1.5 bg-primary/70 text-primary-foreground"
                : "gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"}
          >
            {(isSubmitting || isRunning) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : triggeredAgent ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isRunning ? labels.analyzing : triggeredAgent ? labels.sent : labels.analyze}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.latestUpdate}</p>
          <p className="mt-3 text-lg font-semibold text-foreground">
            {latestSynthesisAt ? new Date(latestSynthesisAt).toLocaleString() : labels.notAvailable}
          </p>
        </Card>
        <Card className="rounded-3xl border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.coveredIdeas}</p>
          <p className="mt-3 text-lg font-semibold text-foreground">{latestSynthesisIdeaCount}</p>
        </Card>
        <Card className="rounded-3xl border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{labels.summary}</p>
          <p className="mt-3 text-sm leading-6 text-foreground">
            {latestSynthesisSummary || labels.empty}
          </p>
        </Card>
      </div>

      {/* Analysis + Recent experiments */}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <GlowBorder
          active={isRunning}
          primaryColor={glowColors.primary}
          lightColor={glowColors.light}
          variant="spin"
          className="h-full"
        >
          <Card className={`h-full rounded-3xl bg-card p-6 ${isRunning ? "border-transparent" : "border-border"}`}>
            <h2 className="text-lg font-semibold text-foreground">{labels.analysis}</h2>
            {synthesisContent ? (
              <div className="mt-4 max-w-none text-sm leading-7 text-foreground">
                <MarkdownContent>{synthesisContent}</MarkdownContent>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{labels.empty}</p>
            )}
          </Card>
        </GlowBorder>

        <Card className="rounded-3xl border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{labels.recentExperiments}</h2>
          <div className="mt-4 space-y-3">
            {completedExperiments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
              completedExperiments.map((experiment) => (
                <div key={experiment.uuid} className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-sm font-medium text-foreground">{experiment.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {experiment.researchQuestionTitle || labels.unlinked}
                  </p>
                  {experiment.outcome ? <p className="mt-2 text-xs text-muted-foreground">{experiment.outcome}</p> : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Custom prompt dialog */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.promptDialogTitle}</DialogTitle>
            <p className="text-sm text-muted-foreground">{labels.promptDialogDesc}</p>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="synthesis-prompt">{labels.editPrompt}</Label>
            <Textarea
              id="synthesis-prompt"
              rows={4}
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder={labels.promptPlaceholder}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>
              {labels.promptCancel}
            </Button>
            <Button onClick={savePrompt}>
              {labels.promptSave}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

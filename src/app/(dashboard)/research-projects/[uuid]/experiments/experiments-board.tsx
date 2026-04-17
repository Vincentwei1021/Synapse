"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutGroup, motion } from "framer-motion";
import { Bot, CheckCircle2, ChevronRight, CornerUpLeft, FileText, GitBranch, Loader2, PenLine, Save, Send, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PresenceIndicator } from "@/components/ui/presence-indicator";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import { MarkdownContent } from "@/components/markdown-content";
import { GlowBorder } from "@/components/glow-border";
import { getAgentColor } from "@/lib/agent-colors";
import { ANIM } from "@/lib/animation";
import type { ExperimentResponse } from "@/services/experiment.service";
import { RevertDialog } from "./revert-dialog";

const columns = [
  { id: "draft", labelKey: "draft" },
  { id: "pending_review", labelKey: "pendingReview" },
  { id: "pending_start", labelKey: "pendingStart" },
  { id: "in_progress", labelKey: "inProgress" },
  { id: "completed", labelKey: "completed" },
] as const;

function formatPriorityLabel(t: ReturnType<typeof useTranslations>, priority: string) {
  const value = priority === "immediate" ? "immediate" : priority === "high" ? "high" : priority === "low" ? "low" : "medium";
  return t(`priority.${value}`);
}

function priorityBadgeClasses(priority: string) {
  switch (priority) {
    case "immediate":
      return "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200";
    case "high":
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";
    case "low":
      return "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200";
    default:
      return "border-border bg-secondary/60 text-muted-foreground";
  }
}

function liveStatusBadge(t: ReturnType<typeof useTranslations>, status: string | null) {
  if (!status) return null;
  const colors: Record<string, string> = {
    sent: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
    ack: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    checking_resources: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    queuing: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    running: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] || ""}`}>
      {t(`experiments.liveStatus.${status}` as Parameters<typeof t>[0])}
    </span>
  );
}

const PRIORITY_ORDER: Record<string, number> = { immediate: 0, high: 1, medium: 2, low: 3 };

function sortColumnExperiments(columnId: string, items: ExperimentResponse[]): ExperimentResponse[] {
  return [...items].sort((a, b) => {
    if (columnId === "pending_start" || columnId === "draft" || columnId === "pending_review") {
      // Sort by priority (high first), then by creation time (oldest first)
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (columnId === "in_progress") {
      // Sort by start time (newest first)
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : new Date(a.createdAt).getTime();
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : new Date(b.createdAt).getTime();
      return tb - ta;
    }
    if (columnId === "completed") {
      // Sort by completion time (newest first)
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.createdAt).getTime();
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.createdAt).getTime();
      return tb - ta;
    }
    return 0;
  });
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ExperimentsBoard({
  experiments,
  agents,
  realtimeAgents,
  initialSelectedExperimentUuid = null,
  viewerUuid,
  projectUuid,
  autonomousLoopEnabled,
  autonomousLoopAgentUuid,
  autonomousLoopMode,
  repoUrl,
  researchQuestions,
}: {
  experiments: ExperimentResponse[];
  agents: Array<{ uuid: string; name: string }>;
  realtimeAgents: Array<{ uuid: string; name: string }>;
  initialSelectedExperimentUuid?: string | null;
  viewerUuid: string;
  projectUuid: string;
  autonomousLoopEnabled: boolean;
  autonomousLoopAgentUuid: string | null;
  autonomousLoopMode: string | null;
  repoUrl: string | null;
  researchQuestions: Array<{ uuid: string; title: string }>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedExperimentUuid, setSelectedExperimentUuid] = useState<string | null>(initialSelectedExperimentUuid);
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [progressLogs, setProgressLogs] = useState<Array<{uuid: string; message: string; phase: string | null; createdAt: string}>>([]);
  const [loopEnabled, setLoopEnabled] = useState(autonomousLoopEnabled);
  const [loopAgentUuid, setLoopAgentUuid] = useState(autonomousLoopAgentUuid ?? "");
  const [loopMode, setLoopMode] = useState(autonomousLoopMode ?? "human_review");
  const [loopDropdownOpen, setLoopDropdownOpen] = useState(false);
  const [loopSelectedMode, setLoopSelectedMode] = useState<string | null>(null);
  const loopDropdownRef = useRef<HTMLDivElement>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftResearchQuestionUuid, setDraftResearchQuestionUuid] = useState("");
  const [draftPriority, setDraftPriority] = useState("medium");
  const [draftStatus, setDraftStatus] = useState<"draft" | "pending_review" | "pending_start">("draft");
  const [draftComputeBudgetHours, setDraftComputeBudgetHours] = useState("");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickDescription, setQuickDescription] = useState("");
  const [quickAgentUuid, setQuickAgentUuid] = useState(realtimeAgents[0]?.uuid ?? "");
  const [quickCreating, setQuickCreating] = useState(false);
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [revertTargetUuid, setRevertTargetUuid] = useState<string | null>(null);
  useRealtimeRefresh();

  async function updateAutonomousLoop(enabled: boolean, agentUuid: string, mode: string) {
    const res = await fetch(`/api/research-projects/${projectUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autonomousLoopEnabled: enabled && agentUuid !== "",
        autonomousLoopAgentUuid: agentUuid || null,
        autonomousLoopMode: mode,
      }),
    });
    if (res.ok) {
      setLoopEnabled(enabled && agentUuid !== "");
      setLoopAgentUuid(agentUuid);
      setLoopMode(mode);
    }
  }

  async function handleQuickCreate() {
    if (!quickDescription.trim()) return;
    setQuickCreating(true);
    try {
      // 1. Create a draft experiment with just the description as title
      const payload = new FormData();
      payload.set("title", quickDescription.trim());
      payload.set("description", "");
      payload.set("status", "draft");
      payload.set("priority", "medium");
      const createRes = await fetch(`/api/research-projects/${projectUuid}/experiments`, {
        method: "POST",
        body: payload,
      });
      if (!createRes.ok) return;
      const createData = await createRes.json();
      const newExperiment = createData.data?.experiment;
      if (!newExperiment?.uuid) return;

      // 2. Send plan request to agent
      if (quickAgentUuid) {
        await fetch(`/api/experiments/${newExperiment.uuid}/request-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentUuid: quickAgentUuid }),
        });
      }

      // 3. Close dialog and navigate to board with new experiment selected
      setQuickCreateOpen(false);
      setQuickDescription("");
      router.refresh();
      setSelectedExperimentUuid(newExperiment.uuid);
    } finally {
      setQuickCreating(false);
    }
  }

  useEffect(() => {
    if (!loopDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (loopDropdownRef.current && !loopDropdownRef.current.contains(e.target as Node)) {
        setLoopDropdownOpen(false);
        setLoopSelectedMode(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [loopDropdownOpen]);

  useEffect(() => {
    if (dismissed) return;
    if (!experiments.some((experiment) => experiment.uuid === selectedExperimentUuid)) {
      setSelectedExperimentUuid(initialSelectedExperimentUuid && experiments.some((experiment) => experiment.uuid === initialSelectedExperimentUuid)
        ? initialSelectedExperimentUuid
        : null);
    }
  }, [experiments, initialSelectedExperimentUuid, selectedExperimentUuid, dismissed]);

  useEffect(() => {
    if (!selectedExperimentUuid) {
      setProgressLogs([]);
      return;
    }
    fetch(`/api/experiments/${selectedExperimentUuid}/progress`)
      .then(r => r.json())
      .then(d => { if (d.success) setProgressLogs(d.data.logs || []); })
      .catch(() => setProgressLogs([]));
  }, [selectedExperimentUuid]);

  // Derive autonomous loop phase from experiment board state
  const autonomousPhase = useMemo(() => {
    if (!loopEnabled) return null;
    const inProgress = experiments.filter((e) => e.status === "in_progress");
    const pendingStart = experiments.filter((e) => e.status === "pending_start");
    const pendingReview = experiments.filter((e) => e.status === "pending_review");
    const drafts = experiments.filter((e) => e.status === "draft");

    if (inProgress.length > 0) {
      // Check liveStatus of in-progress experiments for more detail
      const running = inProgress.find((e) => e.liveStatus === "running");
      if (running) return "running" as const;
      const checking = inProgress.find((e) => e.liveStatus === "checking_resources" || e.liveStatus === "queuing");
      if (checking) return "preparing" as const;
      return "running" as const;
    }
    if (pendingStart.length > 0) return "starting" as const;
    if (pendingReview.length > 0 || drafts.length > 0) return "reviewing" as const;
    // All queues empty — agent should be analysing / proposing
    return "analysing" as const;
  }, [loopEnabled, experiments]);

  const grouped = useMemo(() => {
    return Object.fromEntries(
      columns.map((column) => [
        column.id,
        sortColumnExperiments(column.id, experiments.filter((experiment) => experiment.status === column.id)),
      ]),
    ) as Record<(typeof columns)[number]["id"], ExperimentResponse[]>;
  }, [experiments]);

  const selectedExperiment = useMemo(
    () => experiments.find((experiment) => experiment.uuid === selectedExperimentUuid) ?? null,
    [experiments, selectedExperimentUuid],
  );

  useEffect(() => {
    if (!selectedExperiment) {
      setDraftTitle("");
      setDraftDescription("");
      setDraftResearchQuestionUuid("");
      setDraftPriority("medium");
      setDraftStatus("draft");
      setDraftComputeBudgetHours("");
      setDraftSaveError(null);
      setPlanPanelOpen(false);
      return;
    }

    setDraftTitle(selectedExperiment.title);
    setDraftDescription(selectedExperiment.description ?? "");
    setDraftResearchQuestionUuid(selectedExperiment.researchQuestionUuid ?? "");
    setDraftPriority(selectedExperiment.priority);
    setDraftStatus(
      selectedExperiment.status === "pending_review" || selectedExperiment.status === "pending_start"
        ? selectedExperiment.status
        : "draft",
    );
    setDraftComputeBudgetHours(
      selectedExperiment.computeBudgetHours != null ? String(selectedExperiment.computeBudgetHours) : "",
    );
    setDraftSaveError(null);
  }, [selectedExperiment]);

  async function handleAssign(experimentUuid: string) {
    const assigneeUuid = assignments[experimentUuid];
    if (!assigneeUuid) return;

    await fetch(`/api/experiments/${experimentUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeType: "agent",
        assigneeUuid,
      }),
    });
    router.refresh();
  }

  async function postAction(experimentUuid: string, action: "review" | "complete", body: Record<string, unknown>) {
    await fetch(`/api/experiments/${experimentUuid}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function handleDraftSave(experimentUuid: string) {
    setDraftSaveError(null);

    const response = await fetch(`/api/experiments/${experimentUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draftTitle.trim(),
        description: draftDescription.trim() || null,
        researchQuestionUuid: draftResearchQuestionUuid || null,
        priority: draftPriority,
        status: draftStatus,
        computeBudgetHours: draftComputeBudgetHours.trim() ? Number(draftComputeBudgetHours) : null,
      }),
    });

    if (!response.ok) {
      setDraftSaveError(t("experiments.detail.saveFailed"));
      return;
    }

    router.refresh();
  }

  const renderActionBlock = (experiment: ExperimentResponse) => {
    if (experiment.status === "draft") {
      return (
        <Button
          size="sm"
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isPending}
          onClick={(event) => {
            event.stopPropagation();
            startTransition(() => {
              void (async () => {
                await fetch(`/api/experiments/${experiment.uuid}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "pending_review" }),
                });
                router.refresh();
              })();
            });
          }}
        >
          <Send className="mr-2 h-4 w-4" />
          {t("experiments.actions.submitForReview")}
        </Button>
      );
    }

    if (experiment.status === "pending_review") {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isPending}
            onClick={(event) => {
              event.stopPropagation();
              startTransition(() => {
                void postAction(experiment.uuid, "review", { approved: true });
              });
            }}
          >
            {t("experiments.actions.approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={(event) => {
              event.stopPropagation();
              setRevertTargetUuid(experiment.uuid);
            }}
          >
            <CornerUpLeft className="mr-2 h-4 w-4" />
            {t("experiments.actions.returnToDraft")}
          </Button>
        </div>
      );
    }

    if (experiment.status === "pending_start") {
      return (
        <div className="space-y-2">
          <select
            value={assignments[experiment.uuid] || experiment.assignee?.uuid || ""}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              setAssignments((current) => ({ ...current, [experiment.uuid]: event.target.value }))
            }
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">{t("experiments.actions.selectAgent")}</option>
            {agents.map((agent) => (
              <option key={agent.uuid} value={agent.uuid}>
                {agent.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={isPending || !(assignments[experiment.uuid] || experiment.assignee?.uuid)}
            onClick={(event) => {
              event.stopPropagation();
              startTransition(() => {
                void handleAssign(experiment.uuid);
              });
            }}
          >
            {experiment.assignee ? t("experiments.actions.reassign") : t("experiments.actions.assign")}
          </Button>
        </div>
      );
    }

    if (experiment.status === "in_progress") {
      const canComplete =
        !experiment.assignee ||
        (experiment.assignee.type === "user" && experiment.assignee.uuid === viewerUuid);

      if (!canComplete) {
        return null;
      }

      return (
        <Button
          size="sm"
          className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
          disabled={isPending}
          onClick={(event) => {
            event.stopPropagation();
            startTransition(() => {
              void postAction(experiment.uuid, "complete", { outcome: t("experiments.defaultOutcome") });
            });
          }}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {t("experiments.actions.complete")}
        </Button>
      );
    }

    return null;
  };

  return (
    <>
      {/* Header — title row + subtitle */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{t("experiments.title")}</h1>

          {/* Autonomous Loop inline control */}
          <div className="relative" ref={loopDropdownRef}>
            {loopEnabled ? (
              /* ACTIVE: showing mode + agent + phase + stop */
              <div className="flex items-center">
                <button
                  onClick={() => setLoopDropdownOpen(!loopDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 cursor-pointer transition-all duration-200"
                >
                  <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse shrink-0" />
                  <span className="whitespace-nowrap text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {loopMode === "full_auto" ? t("experiments.fullAutoMode") : t("experiments.humanReviewMode")}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {t("experiments.via")} {realtimeAgents.find((a) => a.uuid === loopAgentUuid)?.name ?? "Agent"}
                  </span>
                  {autonomousPhase && (
                    <span className="whitespace-nowrap text-[11px] text-emerald-600/75 dark:text-emerald-400/75">
                      · {t(`experiments.autoPhase.${autonomousPhase}`)}
                    </span>
                  )}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await updateAutonomousLoop(false, "", loopMode);
                      setLoopDropdownOpen(false);
                      setLoopSelectedMode(null);
                    }}
                    className="ml-1 rounded-md border border-red-500/30 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                  >
                    {t("experiments.stop")}
                  </button>
                </button>
              </div>
            ) : (
              /* OFF: zap icon + text */
              <button
                onClick={() => setLoopDropdownOpen(!loopDropdownOpen)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200 bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm transition-all duration-200 hover:bg-sky-200 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/20"
              >
                <Zap className="h-3.5 w-3.5 shrink-0 fill-sky-300 text-sky-400 dark:fill-sky-300/80 dark:text-sky-300" />
                <span className="whitespace-nowrap">{t("experiments.startAutoResearch")}</span>
              </button>
            )}

            {/* Dropdown menu */}
            {loopDropdownOpen && !loopEnabled && (
              <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-border/40 bg-card shadow-xl shadow-black/30">
                {!loopSelectedMode ? (
                  <div className="p-1.5">
                    <button
                      onClick={() => setLoopSelectedMode("human_review")}
                      className="w-full rounded-md p-2.5 text-left hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="text-sm font-medium text-foreground">{t("experiments.humanReviewMode")}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t("experiments.humanReviewModeDesc")}</div>
                    </button>
                    <button
                      onClick={() => setLoopSelectedMode("full_auto")}
                      className="w-full rounded-md p-2.5 text-left hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <div className="text-sm font-medium text-foreground">{t("experiments.fullAutoMode")}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t("experiments.fullAutoModeDesc")}</div>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-primary"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                      <span className="text-sm font-medium text-foreground">
                        {loopSelectedMode === "full_auto" ? t("experiments.fullAutoMode") : t("experiments.humanReviewMode")}
                      </span>
                      <button
                        onClick={() => setLoopSelectedMode(null)}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        &#8592;
                      </button>
                    </div>
                    <select
                      value={loopAgentUuid}
                      onChange={(e) => setLoopAgentUuid(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                    >
                      <option value="">{t("experiments.selectAgent")}</option>
                      {realtimeAgents.map((agent) => (
                        <option key={agent.uuid} value={agent.uuid}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!loopAgentUuid}
                      onClick={async () => {
                        await updateAutonomousLoop(true, loopAgentUuid, loopSelectedMode!);
                        setLoopDropdownOpen(false);
                        setLoopSelectedMode(null);
                      }}
                      className="w-full rounded-md border border-sky-200 bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-200 disabled:opacity-40 cursor-pointer dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/20"
                    >
                      {t("experiments.activate")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ml-auto">
            <button
              onClick={() => setQuickCreateOpen(true)}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2"><path d="M12 5v14m-7-7h14" /></svg>
              {t("experiments.create")}
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1 hidden lg:block">{t("experiments.subtitle")}</p>
      </div>

      <div className="pb-4">
        <LayoutGroup>
        <div className="grid gap-3 xl:grid-cols-5">
          {columns.map((column) => (
            <section
              key={column.id}
              className="flex min-h-[calc(100vh-250px)] min-w-0 flex-col rounded-[28px] border border-border bg-secondary/50 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-foreground">{t(`experiments.columns.${column.labelKey}`)}</h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {grouped[column.id].length}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-3">
                {grouped[column.id].length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("experiments.empty")}
                  </div>
                ) : (
                  grouped[column.id].map((experiment) => (
                    <motion.div
                      key={experiment.uuid}
                      layoutId={`experiment-card-${experiment.uuid}`}
                      transition={ANIM.spring}
                    >
                    <PresenceIndicator entityType="experiment" entityUuid={experiment.uuid}>
                    <GlowBorder
                      active={!!experiment.liveStatus}
                      primaryColor={getAgentColor(experiment.assignee?.uuid ?? "").primary}
                      lightColor={getAgentColor(experiment.assignee?.uuid ?? "").light}
                      variant="pulse"
                    >
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); };
                        }
                      }}
                      className="relative space-y-3 rounded-2xl border-border bg-card p-3.5 text-left shadow-none transition-colors hover:border-primary/30"
                    >
                      {experiment.liveStatus && experiment.assignee?.name && (
                        <div
                          className="absolute -top-2.5 right-2 z-10 inline-flex max-w-[80%] items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap sm:text-[11px] sm:px-2"
                          style={{ backgroundColor: getAgentColor(experiment.assignee.uuid).primary }}
                        >
                          <Bot className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{experiment.assignee.name}</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{experiment.title}</h3>
                          <Badge variant="outline" className={priorityBadgeClasses(experiment.priority)}>
                            {formatPriorityLabel(t, experiment.priority)}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>
                          {t("experiments.card.assignee")}:{" "}
                          {experiment.assignee?.name || t("experiments.card.unassigned")}
                        </p>
                        {experiment.outcome ? (
                          <p className="line-clamp-2">
                            {t("experiments.card.outcome")}: {experiment.outcome}
                          </p>
                        ) : null}
                      </div>

                      {experiment.liveStatus ? (
                        <div className="flex items-center gap-2">
                          {liveStatusBadge(t, experiment.liveStatus)}
                          {experiment.liveMessage ? (
                            <span className="truncate text-[11px] text-muted-foreground">{experiment.liveMessage}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {renderActionBlock(experiment)}
                    </Card>
                    </GlowBorder>
                    </PresenceIndicator>
                    </motion.div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
        </LayoutGroup>
      </div>

      <Sheet open={Boolean(selectedExperiment)} onOpenChange={(open) => { if (!open) { setSelectedExperimentUuid(null); setDismissed(true); } }}>
        <SheetContent side="right" className="w-full sm:max-w-[640px] lg:w-1/3 lg:max-w-none">
          {planPanelOpen && selectedExperiment?.description ? (
            <div className="absolute inset-y-0 right-full hidden w-[480px] overflow-y-auto border-r border-border bg-background shadow-xl sm:block">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-foreground">{t("experiments.fields.description")}</h3>
                <button
                  onClick={() => setPlanPanelOpen(false)}
                  className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  &times;
                </button>
              </div>
              <div className="min-h-full select-text bg-background px-5 py-4 prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert prose-hr:border-border">
                <MarkdownContent>{selectedExperiment.description}</MarkdownContent>
              </div>
            </div>
          ) : null}

          {selectedExperiment ? (
            <div className="h-full overflow-y-auto">
              <SheetHeader className="border-b border-border px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="line-clamp-2">{selectedExperiment.title}</SheetTitle>
                    {selectedExperiment.status === "draft" ? (
                      <SheetDescription className="mt-2 leading-6">
                        {t("experiments.detail.draftEditable")}
                      </SheetDescription>
                    ) : selectedExperiment.description ? (
                      <button
                        onClick={() => setPlanPanelOpen(!planPanelOpen)}
                        className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 cursor-pointer transition-colors"
                      >
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${planPanelOpen ? "rotate-90" : ""}`} />
                        {t("experiments.fields.description")}
                      </button>
                    ) : (
                      <SheetDescription className="mt-2 leading-6">
                        {t("experiments.detail.noDescription")}
                      </SheetDescription>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6 px-6 py-5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={priorityBadgeClasses(selectedExperiment.priority)}>
                    {formatPriorityLabel(t, selectedExperiment.priority)}
                  </Badge>
                  <Badge variant="secondary">{t(`experiments.columns.${columns.find((column) => column.id === selectedExperiment.status)?.labelKey || "draft"}`)}</Badge>
                  {selectedExperiment.assignee?.name ? (
                    <Badge variant="outline">{selectedExperiment.assignee.name}</Badge>
                  ) : null}
                </div>

                {selectedExperiment.experimentBranch && repoUrl ? (() => {
                  const cleanRepoUrl = repoUrl.replace(/\.git$/, "");
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`${cleanRepoUrl}/tree/${selectedExperiment.experimentBranch}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {selectedExperiment.experimentBranch}
                      </a>
                      {selectedExperiment.commitSha && (
                        <a
                          href={`${cleanRepoUrl}/commit/${selectedExperiment.commitSha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-muted-foreground hover:text-primary"
                        >
                          {selectedExperiment.commitSha.slice(0, 7)}
                        </a>
                      )}
                    </div>
                  );
                })() : null}

                {selectedExperiment.status === "draft" ? (
                  <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="draft-title">{t("experiments.fields.title")}</Label>
                        <Input
                          id="draft-title"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          placeholder={t("experiments.fields.titlePlaceholder")}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="draft-description">{t("experiments.fields.description")}</Label>
                        <Textarea
                          id="draft-description"
                          rows={5}
                          value={draftDescription}
                          onChange={(event) => setDraftDescription(event.target.value)}
                          placeholder={t("experiments.fields.descriptionPlaceholder")}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="draft-question">{t("experiments.fields.question")}</Label>
                          <select
                            id="draft-question"
                            value={draftResearchQuestionUuid}
                            onChange={(event) => setDraftResearchQuestionUuid(event.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <option value="">{t("experiments.fields.noQuestion")}</option>
                            {researchQuestions.map((question) => (
                              <option key={question.uuid} value={question.uuid}>
                                {question.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="draft-priority">{t("experiments.fields.priority")}</Label>
                          <select
                            id="draft-priority"
                            value={draftPriority}
                            onChange={(event) => setDraftPriority(event.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <option value="low">{t("priority.low")}</option>
                            <option value="medium">{t("priority.medium")}</option>
                            <option value="high">{t("priority.high")}</option>
                            <option value="immediate">{t("priority.immediate")}</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="draft-status">{t("experiments.fields.status")}</Label>
                          <select
                            id="draft-status"
                            value={draftStatus}
                            onChange={(event) => setDraftStatus(event.target.value as "draft" | "pending_review" | "pending_start")}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <option value="draft">{t("experiments.columns.draft")}</option>
                            <option value="pending_review">{t("experiments.columns.pendingReview")}</option>
                            <option value="pending_start">{t("experiments.columns.pendingStart")}</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="draft-compute-budget">{t("experiments.fields.computeBudgetHours")}</Label>
                          <Input
                            id="draft-compute-budget"
                            type="number"
                            min="0"
                            step="0.5"
                            value={draftComputeBudgetHours}
                            onChange={(event) => setDraftComputeBudgetHours(event.target.value)}
                            placeholder={t("experiments.fields.computeBudgetHoursPlaceholder")}
                          />
                        </div>
                      </div>

                      {draftSaveError ? <p className="text-sm text-destructive">{draftSaveError}</p> : null}

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          disabled={isPending || !draftTitle.trim()}
                          onClick={() => {
                            startTransition(() => {
                              void handleDraftSave(selectedExperiment.uuid);
                            });
                          }}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          {isPending ? t("common.saving") : t("common.save")}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Card className="rounded-2xl border-border bg-secondary/50 p-4 shadow-none">
                      <p className="text-xs text-muted-foreground">{t("experiments.card.question")}</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {selectedExperiment.researchQuestion?.title || t("experiments.card.unlinked")}
                      </p>
                    </Card>
                    <Card className="rounded-2xl border-border bg-secondary/50 p-4 shadow-none">
                      <p className="text-xs text-muted-foreground">{t("experiments.detail.computeBudget")}</p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {selectedExperiment.computeBudgetHours ?? t("experiments.detail.unlimited")}
                      </p>
                    </Card>
                  </div>
                )}

                {selectedExperiment.outcome ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.outcome")}</h3>
                    <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                      <p className="text-sm leading-7 text-muted-foreground">
                        {selectedExperiment.outcome}
                      </p>
                    </Card>
                  </div>
                ) : null}

                {selectedExperiment.parentQuestionExperiments.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.parentContext")}</h3>
                    <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                      <div className="space-y-3">
                        {selectedExperiment.parentQuestionExperiments.map((experiment) => (
                          <div key={experiment.uuid} className="rounded-2xl bg-secondary/60 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-foreground">{experiment.title}</p>
                              <Badge variant="outline">{t(`experiments.columns.${columns.find((column) => column.id === experiment.status)?.labelKey || "draft"}`)}</Badge>
                            </div>
                            {experiment.outcome ? (
                              <p className="mt-2 text-xs leading-5 text-muted-foreground">{experiment.outcome}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                ) : null}

                {progressLogs.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.progressLog")}</h3>
                    <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                      <div className="space-y-3">
                        {progressLogs.map((log) => (
                          <div key={log.uuid} className="flex gap-3 text-xs">
                            <span className="shrink-0 text-muted-foreground">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </span>
                            {log.phase ? (
                              <Badge variant="outline" className="shrink-0 text-[10px]">{log.phase}</Badge>
                            ) : null}
                            <span className="text-foreground">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                ) : null}

                {selectedExperiment.results ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.results")}</h3>
                    <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                        {prettyJson(selectedExperiment.results)}
                      </pre>
                    </Card>
                  </div>
                ) : null}

                {selectedExperiment.attachments?.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.attachments")}</h3>
                    <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                      <ul className="space-y-2 text-sm text-foreground">
                        {selectedExperiment.attachments.map((attachment) => (
                          <li key={attachment.storedPath} className="flex items-center justify-between gap-3">
                            <span className="truncate">{attachment.originalName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{attachment.mimeType}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Quick-create experiment dialog */}
      <Dialog open={quickCreateOpen} onOpenChange={(open) => { if (!open) { setQuickCreateOpen(false); setQuickDescription(""); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("experiments.quickCreate.title")}</DialogTitle>
            <DialogDescription>{t("experiments.quickCreate.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="quick-description">{t("experiments.quickCreate.ideaLabel")}</Label>
              <Textarea
                id="quick-description"
                value={quickDescription}
                onChange={(e) => setQuickDescription(e.target.value)}
                placeholder={t("experiments.quickCreate.ideaPlaceholder")}
                rows={2}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && quickDescription.trim() && quickAgentUuid) {
                    e.preventDefault();
                    void handleQuickCreate();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("experiments.quickCreate.agentLabel")}</Label>
              <select
                value={quickAgentUuid}
                onChange={(e) => setQuickAgentUuid(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {realtimeAgents.map((agent) => (
                  <option key={agent.uuid} value={agent.uuid}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuickCreateOpen(false);
                  router.push(`/research-projects/${projectUuid}/experiments/new`);
                }}
              >
                <PenLine className="mr-1.5 h-3.5 w-3.5" />
                {t("experiments.quickCreate.manual")}
              </Button>
              <Button
                size="sm"
                disabled={!quickDescription.trim() || !quickAgentUuid || quickCreating}
                onClick={() => void handleQuickCreate()}
              >
                {quickCreating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                {quickCreating ? t("experiments.quickCreate.sending") : t("experiments.quickCreate.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {revertTargetUuid && (() => {
        const target = experiments.find((e) => e.uuid === revertTargetUuid);
        if (!target) return null;
        const currentAssigneeUuid = target.assignee?.type === "agent" ? target.assignee.uuid : null;
        return (
          <RevertDialog
            open={revertTargetUuid !== null}
            onOpenChange={(next) => { if (!next) setRevertTargetUuid(null); }}
            currentAssigneeUuid={currentAssigneeUuid}
            agents={agents}
            onSubmit={async ({ reviewNote, assignedAgentUuid }) => {
              await postAction(target.uuid, "review", {
                approved: false,
                ...(reviewNote ? { reviewNote } : {}),
                assignedAgentUuid,
              });
              setRevertTargetUuid(null);
            }}
          />
        );
      })()}
    </>
  );
}

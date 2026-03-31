"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, CornerUpLeft, FileText, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import type { ExperimentResponse } from "@/services/experiment.service";

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
    sent: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    ack: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    checking_resources: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    queuing: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    running: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] || ""}`}>
      {t(`experiments.liveStatus.${status}` as Parameters<typeof t>[0])}
    </span>
  );
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        } mt-0.5`}
      />
    </button>
  );
}

export function ExperimentsBoard({
  experiments,
  agents,
  initialSelectedExperimentUuid = null,
  viewerUuid,
  projectUuid,
  autonomousLoopEnabled,
  autonomousLoopAgentUuid,
}: {
  experiments: ExperimentResponse[];
  agents: Array<{ uuid: string; name: string }>;
  initialSelectedExperimentUuid?: string | null;
  viewerUuid: string;
  projectUuid: string;
  autonomousLoopEnabled: boolean;
  autonomousLoopAgentUuid: string | null;
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
  useRealtimeRefresh();

  async function updateAutonomousLoop(enabled: boolean, agentUuid: string) {
    await fetch(`/api/research-projects/${projectUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autonomousLoopEnabled: enabled && agentUuid !== "",
        autonomousLoopAgentUuid: agentUuid || null,
      }),
    });
  }

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

  const grouped = useMemo(() => {
    return Object.fromEntries(
      columns.map((column) => [column.id, experiments.filter((experiment) => experiment.status === column.id)]),
    ) as Record<(typeof columns)[number]["id"], ExperimentResponse[]>;
  }, [experiments]);

  const selectedExperiment = useMemo(
    () => experiments.find((experiment) => experiment.uuid === selectedExperimentUuid) ?? null,
    [experiments, selectedExperimentUuid],
  );

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
              startTransition(() => {
                void postAction(experiment.uuid, "review", { approved: false });
              });
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

  const activeAgentName = loopEnabled && loopAgentUuid
    ? agents.find((a) => a.uuid === loopAgentUuid)?.name ?? ""
    : "";

  return (
    <>
      {/* Autonomous Loop toggle */}
      <div
        className={`mb-4 rounded-2xl border p-3 ${
          loopEnabled && loopAgentUuid
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ToggleSwitch
              checked={loopEnabled}
              onChange={(v) => {
                setLoopEnabled(v);
                if (!v) {
                  setLoopAgentUuid("");
                  void updateAutonomousLoop(false, "");
                }
              }}
            />
            <div>
              <p
                className={`text-sm font-medium ${
                  loopEnabled ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {t("experiments.autonomousLoop")}
              </p>
              {!loopEnabled ? (
                <p className="text-xs text-muted-foreground">
                  {t("experiments.autonomousLoopDesc")}
                </p>
              ) : loopAgentUuid ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t("experiments.autonomousActive", { agent: activeAgentName })}
                </p>
              ) : (
                <p className="text-xs text-primary">
                  {t("experiments.selectAgentToActivate")}
                </p>
              )}
            </div>
          </div>
          {loopEnabled ? (
            <select
              value={loopAgentUuid}
              onChange={(e) => {
                setLoopAgentUuid(e.target.value);
                void updateAutonomousLoop(true, e.target.value);
              }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="">{t("experiments.selectAgent")}</option>
              {agents.map((a) => (
                <option key={a.uuid} value={a.uuid}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="pb-4">
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
                    <Card
                      key={experiment.uuid}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); };
                        }
                      }}
                      className="space-y-3 rounded-2xl border-border bg-card p-3.5 text-left shadow-none transition-colors hover:border-primary/30"
                    >
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
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <Sheet open={Boolean(selectedExperiment)} onOpenChange={(open) => { if (!open) { setSelectedExperimentUuid(null); setDismissed(true); } }}>
        <SheetContent side="right" className="w-full sm:max-w-[560px]">
          {selectedExperiment ? (
            <div className="h-full overflow-y-auto">
              <SheetHeader className="border-b border-border px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="line-clamp-2">{selectedExperiment.title}</SheetTitle>
                    <SheetDescription className="mt-2 leading-6">
                      {selectedExperiment.description || t("experiments.detail.noDescription")}
                    </SheetDescription>
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

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.outcome")}</h3>
                  <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                    <p className="text-sm leading-7 text-muted-foreground">
                      {selectedExperiment.outcome || t("experiments.detail.noOutcome")}
                    </p>
                  </Card>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.parentContext")}</h3>
                  <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                    {selectedExperiment.parentQuestionExperiments.length ? (
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
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("experiments.detail.noParentContext")}</p>
                    )}
                  </Card>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.progressLog")}</h3>
                  <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                    {progressLogs.length ? (
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
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("experiments.detail.noProgress")}</p>
                    )}
                  </Card>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.results")}</h3>
                  <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                    {selectedExperiment.results ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                        {prettyJson(selectedExperiment.results)}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("experiments.detail.noResults")}</p>
                    )}
                  </Card>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">{t("experiments.detail.attachments")}</h3>
                  <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
                    {selectedExperiment.attachments?.length ? (
                      <ul className="space-y-2 text-sm text-foreground">
                        {selectedExperiment.attachments.map((attachment) => (
                          <li key={attachment.storedPath} className="flex items-center justify-between gap-3">
                            <span className="truncate">{attachment.originalName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{attachment.mimeType}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("experiments.detail.noAttachments")}</p>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

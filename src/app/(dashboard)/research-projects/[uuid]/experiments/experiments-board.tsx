"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Play, Send, CheckCircle2, CornerUpLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import type { ExperimentResponse } from "@/services/experiment.service";

const columns = [
  { id: "draft", labelKey: "draft" },
  { id: "pending_review", labelKey: "pendingReview" },
  { id: "pending_start", labelKey: "pendingStart" },
  { id: "in_progress", labelKey: "inProgress" },
  { id: "completed", labelKey: "completed" },
] as const;

export function ExperimentsBoard({
  experiments,
  agents,
}: {
  experiments: ExperimentResponse[];
  agents: Array<{ uuid: string; name: string }>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  useRealtimeRefresh();

  const grouped = useMemo(() => {
    return Object.fromEntries(
      columns.map((column) => [column.id, experiments.filter((experiment) => experiment.status === column.id)]),
    ) as Record<(typeof columns)[number]["id"], ExperimentResponse[]>;
  }, [experiments]);

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

  async function postAction(experimentUuid: string, action: "review" | "start" | "complete", body: Record<string, unknown>) {
    await fetch(`/api/experiments/${experimentUuid}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="grid min-w-max grid-flow-col auto-cols-[minmax(360px,1fr)] gap-5">
        {columns.map((column) => (
          <section
            key={column.id}
            className="flex min-h-[calc(100vh-260px)] flex-col rounded-3xl border border-border bg-secondary/50 p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{t(`experiments.columns.${column.labelKey}`)}</h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{grouped[column.id].length}</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {grouped[column.id].length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("experiments.empty")}
                </div>
              ) : (
                grouped[column.id].map((experiment) => (
                  <Card key={experiment.uuid} className="space-y-4 rounded-2xl border-border bg-card p-4 shadow-none">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{experiment.title}</h3>
                        <Badge variant="outline" className="border-border bg-secondary/60 text-muted-foreground">
                          {experiment.priority}
                        </Badge>
                      </div>
                      {experiment.description ? (
                        <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{experiment.description}</p>
                      ) : null}
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        {t("experiments.card.question")}:{" "}
                        {experiment.researchQuestion?.title || t("experiments.card.unlinked")}
                      </p>
                      <p>
                        {t("experiments.card.assignee")}:{" "}
                        {experiment.assignee?.name || t("experiments.card.unassigned")}
                      </p>
                      {experiment.outcome ? (
                        <p>
                          {t("experiments.card.outcome")}: {experiment.outcome}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {experiment.status === "draft" ? (
                        <Button
                          size="sm"
                          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(() => {
                              void (async () => {
                                await fetch(`/api/experiments/${experiment.uuid}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "pending_review" }),
                                });
                                router.refresh();
                              })();
                            })
                          }
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {t("experiments.actions.submitForReview")}
                        </Button>
                      ) : null}

                      {experiment.status === "pending_review" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(() => { void postAction(experiment.uuid, "review", { approved: true }); })
                            }
                          >
                            {t("experiments.actions.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(() => { void postAction(experiment.uuid, "review", { approved: false }); })
                            }
                          >
                            <CornerUpLeft className="mr-2 h-4 w-4" />
                            {t("experiments.actions.returnToDraft")}
                          </Button>
                        </div>
                      ) : null}

                      {experiment.status === "pending_start" ? (
                        <>
                          <select
                            value={assignments[experiment.uuid] || experiment.assignee?.uuid || ""}
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
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isPending || !(assignments[experiment.uuid] || experiment.assignee?.uuid)}
                              onClick={() => startTransition(() => { void handleAssign(experiment.uuid); })}
                            >
                              {t("experiments.actions.assign")}
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-700 text-white hover:bg-emerald-600"
                              disabled={isPending}
                              onClick={() => startTransition(() => { void postAction(experiment.uuid, "start", {}); })}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              {t("experiments.actions.start")}
                            </Button>
                          </div>
                        </>
                      ) : null}

                      {experiment.status === "in_progress" ? (
                        <Button
                          size="sm"
                          className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(() => {
                              void postAction(experiment.uuid, "complete", { outcome: t("experiments.defaultOutcome") });
                            })
                          }
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {t("experiments.actions.complete")}
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

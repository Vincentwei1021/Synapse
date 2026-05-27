"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Play, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import { getAgentColor } from "@/lib/agent-colors";
import { PaperFeedsCard } from "./paper-feeds-card";
import {
  PaperFeedsAgentPicker,
  type PaperFeedsAgentOption,
} from "./paper-feeds-agent-picker";
import {
  getHeaderStatus,
  getLatestFailedRun,
  hasInflightRun,
  shouldShowEmptyState,
  type PaperFeedConfigState,
  type PaperFeedDayState,
  type PaperFeedRunState,
} from "./paper-feeds-state";

export interface PaperFeedsClientProps {
  projectUuid: string;
  initialConfig: PaperFeedConfigState;
  initialItemsByDate: PaperFeedDayState[];
  initialRuns: PaperFeedRunState[];
  agents: PaperFeedsAgentOption[];
}

export function PaperFeedsClient({
  projectUuid,
  initialConfig,
  initialItemsByDate,
  initialRuns,
  agents,
}: PaperFeedsClientProps) {
  const t = useTranslations("paperFeeds");

  const [config, setConfig] = useState<PaperFeedConfigState>(initialConfig);
  const [itemsByDate, setItemsByDate] = useState<PaperFeedDayState[]>(initialItemsByDate);
  const [runs, setRuns] = useState<PaperFeedRunState[]>(initialRuns);

  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [selectedAgentUuid, setSelectedAgentUuid] = useState<string>(
    initialConfig.paperFeedAgentUuid ?? agents[0]?.uuid ?? "",
  );
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [runningPromote, setRunningPromote] = useState<Set<string>>(new Set());
  const [failedBannerDismissed, setFailedBannerDismissed] = useState(false);
  const [lastSeenFailedRunUuid, setLastSeenFailedRunUuid] = useState<string | null>(
    () => {
      const latest = initialRuns[0];
      return latest && latest.status === "failed" ? latest.uuid : null;
    },
  );

  // Sync from server-driven props (re-renders triggered by router.refresh()).
  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);
  useEffect(() => {
    setItemsByDate(initialItemsByDate);
  }, [initialItemsByDate]);
  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  // Reset the dismissed banner whenever a new failed run shows up.
  useEffect(() => {
    const latestFailed = getLatestFailedRun(runs);
    if (latestFailed && latestFailed.uuid !== lastSeenFailedRunUuid) {
      setFailedBannerDismissed(false);
      setLastSeenFailedRunUuid(latestFailed.uuid);
    }
  }, [runs, lastSeenFailedRunUuid]);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/research-projects/${projectUuid}/paper-feeds`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        data?: {
          config: PaperFeedConfigState;
          itemsByDate: PaperFeedDayState[];
          runs: PaperFeedRunState[];
        };
      };
      const data = json.data;
      if (!data) return;
      setConfig(data.config);
      setItemsByDate(data.itemsByDate);
      setRuns(data.runs);
    } catch {
      // ignore
    }
  }, [projectUuid]);

  // Realtime refresh — re-renders the server component on SSE events, which
  // will flow through the props -> state useEffects above.
  useRealtimeRefresh();

  const headerStatus = getHeaderStatus(config);
  const showEmptyState = shouldShowEmptyState(config, itemsByDate);
  const latestFailedRun = getLatestFailedRun(runs);
  const inflight = hasInflightRun(runs);

  const assignedAgent = useMemo(
    () => agents.find((a) => a.uuid === config.paperFeedAgentUuid) ?? null,
    [agents, config.paperFeedAgentUuid],
  );
  const accentColor = assignedAgent
    ? getAgentColor(assignedAgent.uuid, assignedAgent.color).primary
    : null;

  const handleEnable = useCallback(async () => {
    if (!selectedAgentUuid) return;
    setEnabling(true);
    try {
      const res = await fetch(`/api/research-projects/${projectUuid}/paper-feeds/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentUuid: selectedAgentUuid }),
      });
      if (res.ok) {
        setAgentPickerOpen(false);
        await refetch();
      }
    } finally {
      setEnabling(false);
    }
  }, [projectUuid, selectedAgentUuid, refetch]);

  const handleDisable = useCallback(async () => {
    setDisabling(true);
    try {
      const res = await fetch(`/api/research-projects/${projectUuid}/paper-feeds/disable`, {
        method: "POST",
      });
      if (res.ok) await refetch();
    } finally {
      setDisabling(false);
    }
  }, [projectUuid, refetch]);

  const handleRunNow = useCallback(
    async (feedDate?: string) => {
      setTriggeringRun(true);
      try {
        const res = await fetch(`/api/research-projects/${projectUuid}/paper-feeds/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(feedDate ? { feedDate } : {}),
        });
        if (res.ok) await refetch();
      } finally {
        setTriggeringRun(false);
      }
    },
    [projectUuid, refetch],
  );

  const handlePromote = useCallback(
    async (itemUuid: string) => {
      setRunningPromote((prev) => {
        const next = new Set(prev);
        next.add(itemUuid);
        return next;
      });
      try {
        const res = await fetch(
          `/api/research-projects/${projectUuid}/paper-feeds/items/${itemUuid}/promote`,
          { method: "POST" },
        );
        if (res.ok) await refetch();
      } finally {
        setRunningPromote((prev) => {
          const next = new Set(prev);
          next.delete(itemUuid);
          return next;
        });
      }
    },
    [projectUuid, refetch],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <Badge variant={headerStatus === "disabled" ? "outline" : "default"}>
              {t(`status.${headerStatus}`)}
            </Badge>
            {assignedAgent ? (
              <span
                className="text-muted-foreground inline-flex items-center gap-1.5 text-sm"
                style={accentColor ? { color: accentColor } : undefined}
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={accentColor ? { backgroundColor: accentColor } : undefined}
                />
                {assignedAgent.name}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
          {config.paperFeedLastRunAt ? (
            <p className="text-muted-foreground text-xs">
              {t("lastRun", {
                date: runs[0]?.feedDate ?? config.paperFeedLastRunAt.slice(0, 10),
                count: runs[0]?.paperCount ?? 0,
                status: runs[0]?.status ?? "—",
              })}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {config.paperFeedEnabled ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleRunNow()}
                disabled={triggeringRun || inflight}
              >
                {triggeringRun ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {t("actions.runNow")}
              </Button>
              <Button variant="outline" onClick={handleDisable} disabled={disabling}>
                {disabling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Power className="size-4" />
                )}
                {t("actions.disable")}
              </Button>
            </>
          ) : (
            <Button onClick={() => setAgentPickerOpen(true)}>
              <Power className="size-4" />
              {t("actions.enable")}
            </Button>
          )}
        </div>
      </header>

      {latestFailedRun && !failedBannerDismissed ? (
        <Card className="border-destructive/40 bg-destructive/5 flex flex-row items-center justify-between gap-4 px-4 py-3">
          <p className="text-destructive text-sm">
            {t("failedBanner", {
              date: latestFailedRun.feedDate,
              reason: latestFailedRun.errorMessage ?? "—",
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRunNow(latestFailedRun.feedDate)}
              disabled={triggeringRun || inflight}
            >
              <RefreshCw className="size-4" />
              {t("actions.retry")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFailedBannerDismissed(true)}
            >
              {t("actions.dismiss")}
            </Button>
          </div>
        </Card>
      ) : null}

      {showEmptyState ? (
        <Card className="mx-auto max-w-xl items-center gap-3 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold">{t("emptyState.title")}</h2>
          <p className="text-muted-foreground text-sm">{t("emptyState.body")}</p>
          <Button className="mt-2" onClick={() => setAgentPickerOpen(true)}>
            {t("emptyState.cta")}
          </Button>
        </Card>
      ) : (
        <div className="space-y-8">
          {itemsByDate.map((group) => (
            <section key={group.feedDate} className="space-y-3">
              <h2 className="text-base font-medium">
                {t("groupHeader", {
                  date: group.feedDate,
                  count: group.items.length,
                })}
              </h2>
              {group.items.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("emptyDay", { date: group.feedDate })}
                </p>
              ) : (
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <PaperFeedsCard
                      key={item.uuid}
                      item={item}
                      runningPromote={runningPromote}
                      accentColor={accentColor}
                      onPromote={handlePromote}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <PaperFeedsAgentPicker
        open={agentPickerOpen}
        onOpenChange={setAgentPickerOpen}
        agents={agents}
        selectedAgentUuid={selectedAgentUuid}
        onSelectAgent={setSelectedAgentUuid}
        onConfirm={handleEnable}
        submitting={enabling}
      />
    </div>
  );
}

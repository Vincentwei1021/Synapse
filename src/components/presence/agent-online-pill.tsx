"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAgentPresence } from "@/contexts/agent-presence-context";
import { ConnectionList } from "@/components/presence/connection-list";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AgentOnlinePill() {
  const t = useTranslations();
  const { connections, onlineAgentCount, loading } = useAgentPresence();
  const onlineConnections = connections.filter((c) => c.status === "online");
  // Use a stable now for uptime within one render; the 15s poll re-renders anyway.
  const nowMs = Date.now();

  if (loading && connections.length === 0) {
    return (
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground" aria-hidden>
        {t("presence.loading")}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-left text-[11px] hover:bg-muted/60"
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${onlineAgentCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            aria-hidden
          />
          <span className="font-medium tabular-nums">
            {t("presence.agentsOnline", { count: onlineAgentCount })}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[min(92vw,360px)] p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold">{t("presence.title")}</span>
          <Link href="/agents" className="text-[11px] text-muted-foreground hover:underline">
            {t("presence.viewAll")}
          </Link>
        </div>
        <ScrollArea className="max-h-[50vh]">
          <ConnectionList
            connections={onlineConnections}
            nowMs={nowMs}
            variant="stacked"
            emptyLabel={t("presence.noConnections")}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

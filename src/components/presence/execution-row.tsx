"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleStop } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ExecutionViewLite } from "@/lib/presence-format";
import { experimentHref } from "@/components/presence/execution-row.helpers";

export { experimentHref };

export function ExecutionRow({
  execution,
  variant = "inline",
  onInterrupt,
}: {
  execution: ExecutionViewLite;
  variant?: "inline" | "stacked";
  onInterrupt?: (experimentUuid: string) => void;
}) {
  const t = useTranslations();
  const href = experimentHref(execution.researchProjectUuid, execution.experimentUuid);
  const statusKey = `presence.status.${execution.liveStatus}`;
  const statusLabel = t.has(statusKey) ? t(statusKey) : execution.liveStatus;
  const interruptButton = onInterrupt ? (
    <button
      type="button"
      aria-label={t("control.interrupt")}
      title={t("control.interrupt")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onInterrupt(execution.experimentUuid);
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
    >
      <CircleStop className="h-3.5 w-3.5" />
    </button>
  ) : null;
  if (variant === "stacked") {
    return (
      <Link href={href} className="block rounded-md px-2 py-1.5 hover:bg-muted/60">
        <div className="flex items-start gap-2">
          <div className="line-clamp-2 flex-1 text-xs font-medium">{execution.title}</div>
          {interruptButton}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{statusLabel}</Badge>
          {execution.liveMessage ? (
            <span className="truncate text-[10px] text-muted-foreground">{execution.liveMessage}</span>
          ) : null}
        </div>
      </Link>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
      <span className="truncate text-xs font-medium">{execution.title}</span>
      <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{statusLabel}</Badge>
      {interruptButton}
    </Link>
  );
}

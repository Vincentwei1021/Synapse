"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ExecutionViewLite } from "@/lib/presence-format";
import { experimentHref } from "@/components/presence/execution-row.helpers";

export { experimentHref };

export function ExecutionRow({
  execution,
  variant = "inline",
}: {
  execution: ExecutionViewLite;
  variant?: "inline" | "stacked";
}) {
  const href = experimentHref(execution.researchProjectUuid, execution.experimentUuid);
  if (variant === "stacked") {
    return (
      <Link href={href} className="block rounded-md px-2 py-1.5 hover:bg-muted/60">
        <div className="line-clamp-2 text-xs font-medium">{execution.title}</div>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{execution.liveStatus}</Badge>
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
      <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{execution.liveStatus}</Badge>
    </Link>
  );
}

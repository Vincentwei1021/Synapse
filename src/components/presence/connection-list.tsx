"use client";
import { groupByAgent, formatUptime, type ConnectionViewLite } from "@/lib/presence-format";
import { ExecutionRow } from "@/components/presence/execution-row";
import { getAgentColor } from "@/lib/agent-colors";
import { AgentTypeIcon } from "@/components/agent-type-icon";
import { connectionStatusLabel } from "@/components/presence/connection-list.helpers";

export { connectionStatusLabel };

export function ConnectionList({
  connections,
  nowMs,
  variant = "stacked",
  emptyLabel,
}: {
  connections: ConnectionViewLite[];
  nowMs: number;
  variant?: "inline" | "stacked";
  emptyLabel: string;
}) {
  if (connections.length === 0) {
    return <div className="px-2 py-3 text-xs text-muted-foreground">{emptyLabel}</div>;
  }
  const groups = groupByAgent(connections);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const color = getAgentColor(g.agentUuid);
        return (
          <div key={g.agentUuid} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 px-2">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded"
                style={{ backgroundColor: color.light, color: color.primary }}
              >
                <AgentTypeIcon type={g.connections[0]?.clientType ?? "claude_code"} className="h-3 w-3" />
              </span>
              <span className="text-xs font-medium">{g.agentName}</span>
            </div>
            {g.connections.map((c) => (
              <div key={c.connectionKey} className="pl-2">
                <div className="flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${c.status === "online" ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                    aria-hidden
                  />
                  <span className="truncate">{c.host} · {c.cwd}</span>
                  {c.status === "online" ? (
                    <span className="ml-auto font-mono tabular-nums">{formatUptime(c.connectedAt, nowMs)}</span>
                  ) : null}
                </div>
                {c.executions.map((e) => (
                  <ExecutionRow key={e.experimentUuid} execution={e} variant={variant} />
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

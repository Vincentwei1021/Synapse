"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getAgentColor } from "@/lib/agent-colors";
import type { AgentSummary } from "@/services/agent-activity.service";

interface SidebarSectionFrameProps {
  agents: AgentSummary[];
  children: ReactNode;
  active?: boolean;
  className?: string;
}

const MAX_VISIBLE_CHIPS = 2;

export function SidebarSectionFrame({ agents, children, active, className }: SidebarSectionFrameProps) {
  const hasAgents = agents.length > 0;
  const visible = agents.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = agents.length - visible.length;
  const tooltip = agents.map((a) => a.name).join(", ");

  return (
    <div
      className={cn(
        "relative rounded-lg px-1.5 py-0.5 transition-[border-color,box-shadow] duration-200",
        hasAgents
          ? "border border-primary/80"
          : "border border-transparent",
        hasAgents && active && "shadow-[0_0_8px_0_hsl(var(--primary)/0.25)]",
        "[&_button[data-variant=secondary]]:bg-transparent [&_button[data-variant=secondary]]:shadow-none",
        className,
      )}
    >
      {hasAgents && (
        <div
          title={tooltip}
          className="absolute -top-2 right-1 flex items-center gap-1"
        >
          {visible.map((agent) => {
            const { primary, light } = getAgentColor(agent.uuid, agent.color);
            return (
              <span
                key={agent.uuid}
                className="truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none max-w-[80px]"
                style={{ backgroundColor: light, color: primary }}
              >
                {agent.name}
              </span>
            );
          })}
          {overflow > 0 && (
            <span
              className="rounded-full px-1 py-0.5 text-[10px] font-medium leading-none"
              style={{ backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
            >
              +{overflow}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

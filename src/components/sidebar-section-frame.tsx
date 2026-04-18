"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getAgentColor } from "@/lib/agent-colors";
import { GlowBorder } from "@/components/glow-border";
import type { AgentSummary } from "@/services/agent-activity.service";
import { getSidebarSectionFrameGlowColors } from "@/components/sidebar-section-frame.helpers";

interface SidebarSectionFrameProps {
  agents: AgentSummary[];
  children: ReactNode;
  active?: boolean;
  className?: string;
  appearance?: "frame" | "glow";
}

const MAX_VISIBLE_CHIPS = 2;

export function SidebarSectionFrame({
  agents,
  children,
  active,
  className,
  appearance = "frame",
}: SidebarSectionFrameProps) {
  const hasAgents = agents.length > 0;
  const visible = agents.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = agents.length - visible.length;
  const tooltip = agents.map((a) => a.name).join(", ");
  const glowColors = getSidebarSectionFrameGlowColors(agents);

  if (appearance === "glow") {
    return (
      <div className="relative">
        {hasAgents && (
          <div
            title={tooltip}
            className="absolute -top-2 right-1 z-10 flex items-center gap-1"
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
        <GlowBorder
          active={hasAgents}
          primaryColor={glowColors?.primary ?? getAgentColor("").primary}
          lightColor={glowColors?.light ?? getAgentColor("").light}
          variant="pulse"
          className={className}
        >
          {children}
        </GlowBorder>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-lg px-1.5 py-0.5 transition-[border-color,box-shadow,background-color] duration-200",
        hasAgents
          ? "border border-primary/80"
          : "border border-transparent",
        hasAgents && active && "bg-secondary shadow-[0_0_8px_0_hsl(var(--primary)/0.25)]",
        hasAgents && active && "[&_button[data-variant=secondary]]:bg-transparent [&_button[data-variant=secondary]]:shadow-none",
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

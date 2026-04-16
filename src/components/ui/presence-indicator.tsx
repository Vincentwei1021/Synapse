"use client";

import { usePresence, type PresenceEntry } from "@/hooks/use-presence";
import { getAgentColor } from "@/lib/agent-colors";
import { Bot } from "lucide-react";

interface PresenceIndicatorProps {
  entityType: string;
  entityUuid: string;
  children: React.ReactNode;
}

export function PresenceIndicator({ entityType, entityUuid, children }: PresenceIndicatorProps) {
  const { getPresence } = usePresence();
  const entries = getPresence(entityType, entityUuid);

  const hasPresence = entries.length > 0;
  const hasMutate = hasPresence && entries.some((e) => e.action === "mutate");
  const borderStyle = hasMutate ? "solid" : "dashed";

  const primary = hasPresence
    ? (hasMutate ? entries.find((e) => e.action === "mutate")! : entries[entries.length - 1])
    : null;
  const borderColor = primary ? getAgentColor(primary.agentUuid).primary : "transparent";

  return (
    <div
      className="relative"
      style={hasPresence ? {
        outline: `2px ${borderStyle} ${borderColor}`,
        outlineOffset: "-2px",
        borderRadius: "var(--radius)",
      } : undefined}
    >
      {/* Agent badges */}
      {hasPresence && (
        <div className="absolute -top-2.5 right-2 z-10 flex max-w-[80%] justify-end gap-1">
          {entries.slice(0, 3).map((entry) => (
            <AgentBadge key={entry.agentUuid} entry={entry} />
          ))}
          {entries.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-gray-500 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap">
              +{entries.length - 3}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function AgentBadge({ entry }: { entry: PresenceEntry }) {
  const color = getAgentColor(entry.agentUuid);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap animate-in fade-in duration-300 ease-out sm:text-[11px] sm:px-2"
      style={{ backgroundColor: color.primary }}
    >
      <Bot className="h-2.5 w-2.5" />
      {entry.agentName}
    </span>
  );
}

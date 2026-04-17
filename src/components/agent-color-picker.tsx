"use client";

import { useTranslations } from "next-intl";
import {
  AGENT_COLOR_KEYS,
  AGENT_COLORS,
  type AgentColorEntry,
} from "@/lib/agent-colors";
import { cn } from "@/lib/utils";

interface AgentColorPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function AgentColorPicker({ value, onChange, className, disabled }: AgentColorPickerProps) {
  const t = useTranslations();

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-label={t("agents.form.colorLabel")}>
      {AGENT_COLOR_KEYS.map((key) => {
        const entry: AgentColorEntry = AGENT_COLORS[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`agents.colors.${key}` as Parameters<typeof t>[0])}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "h-7 w-7 rounded-full border border-border transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected && "ring-2 ring-primary ring-offset-2",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            style={{ backgroundColor: entry.primary }}
          />
        );
      })}
    </div>
  );
}

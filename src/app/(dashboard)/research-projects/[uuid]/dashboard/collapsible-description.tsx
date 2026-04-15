"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { MarkdownContent } from "@/components/markdown-content";

export function CollapsibleDescription({
  text,
  maxLines = 3,
}: {
  text: string;
  maxLines?: number;
}) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const lineHeight = parseFloat(getComputedStyle(ref.current).lineHeight) || 22;
      setNeedsCollapse(ref.current.scrollHeight > lineHeight * (maxLines + 0.5));
    }
  }, [text, maxLines]);

  return (
    <div className="mt-2">
      <div
        ref={ref}
        className="text-sm leading-6 text-muted-foreground prose prose-sm dark:prose-invert max-w-none prose-headings:text-muted-foreground prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1.5 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5"
        style={
          !expanded && needsCollapse
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }
            : undefined
        }
      >
        <MarkdownContent>{text}</MarkdownContent>
      </div>
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}

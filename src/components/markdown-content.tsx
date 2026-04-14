"use client";

import { RichMarkdown } from "@/components/rich-markdown";

export function MarkdownContent({ children }: { children: string }) {
  return <RichMarkdown>{children}</RichMarkdown>;
}

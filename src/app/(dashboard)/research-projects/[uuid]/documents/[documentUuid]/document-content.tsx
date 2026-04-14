"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { RichMarkdown } from "@/components/rich-markdown";
import { Button } from "@/components/ui/button";
import { updateDocumentAction } from "./actions";

interface DocumentContentProps {
  documentUuid: string;
  projectUuid: string;
  initialContent: string;
  documentType?: string;
}

/** Detect TSV/CSV tabular content: header + at least one data row with consistent columns */
function parseTsvContent(content: string): { headers: string[]; rows: string[][] } | null {
  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return null;
  const sep = lines[0].includes("\t") ? "\t" : null;
  if (!sep) return null;
  const headers = lines[0].split(sep).map((h) => h.trim());
  if (headers.length < 2) return null;
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim());
    // Pad or trim to header length
    while (cells.length < headers.length) cells.push("");
    return cells.slice(0, headers.length);
  });
  return { headers, rows };
}

function TsvTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            {headers.map((header, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="max-w-[300px] truncate px-4 py-2.5 text-foreground">
                  {cell || <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocumentContent({ documentUuid, projectUuid, initialContent, documentType }: DocumentContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(initialContent);
  const [isPending, startTransition] = useTransition();

  // Check if content is TSV tabular data (experiment results log)
  const tsvData = useMemo(() => {
    if (documentType === "experiment_results_log" || !initialContent) {
      return parseTsvContent(initialContent);
    }
    // Also try parsing if content looks like TSV
    return parseTsvContent(initialContent);
  }, [initialContent, documentType]);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateDocumentAction(documentUuid, projectUuid, editContent);
      if (result.success) {
        setIsEditing(false);
        router.refresh();
      }
    });
  };

  const handleCancel = () => {
    setEditContent(initialContent);
    setIsEditing(false);
  };

  return (
    <Card className="flex-1 overflow-auto border-border p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">{t("common.content")}</h2>
        {isEditing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
              className="border-border text-muted-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {isPending ? t("common.processing") : t("documents.saveChanges")}
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setIsEditing(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2 h-4 w-4"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            {t("common.edit")}
          </Button>
        )}
      </div>

      {isEditing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="h-full w-full resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={t("documents.documentContent")}
        />
      ) : tsvData ? (
        <TsvTable headers={tsvData.headers} rows={tsvData.rows} />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
          {initialContent ? (
            <RichMarkdown>{initialContent}</RichMarkdown>
          ) : (
            <span className="text-muted-foreground italic">{t("common.noContent")}</span>
          )}
        </div>
      )}
    </Card>
  );
}

"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2 } from "lucide-react";
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isGeneratedDocument = documentType === "experiment_results_log" || documentType === "execution_incident_lessons";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function insertAtCursor(snippet: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      setEditContent((current) => current + snippet);
      return;
    }
    const start = textarea.selectionStart ?? editContent.length;
    const end = textarea.selectionEnd ?? editContent.length;
    const next = editContent.slice(0, start) + snippet + editContent.slice(end);
    setEditContent(next);
    // Restore caret after React state flushes
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = start + snippet.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  }

  async function uploadImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError(t("documents.imageUploadInvalidType"));
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/documents/${documentUuid}/images`, {
        method: "POST",
        body: form,
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        const detail =
          json?.error?.message ||
          (typeof json?.error === "string" ? json.error : null) ||
          t("documents.imageUploadFailed");
        setUploadError(detail);
        return;
      }
      const altBase = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, " ").trim() || "image";
      const snippet = `\n\n![${altBase}](${json.data.url})\n\n`;
      insertAtCursor(snippet);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("documents.imageUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) await uploadImageFile(file);
  }

  async function handleDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    event.preventDefault();
    await uploadImageFile(file);
  }

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
        ) : isGeneratedDocument ? null : (
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
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="border-border"
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {t("documents.insertImage")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("documents.imagePasteHint")}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) await uploadImageFile(file);
            }}
          />
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onPaste={handlePaste}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer?.items ?? []).some((i) => i.kind === "file")) {
                event.preventDefault();
              }
            }}
            onDrop={handleDrop}
            className="h-full w-full resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={t("documents.documentContent")}
          />
          {uploadError ? (
            <p className="text-xs text-destructive">{uploadError}</p>
          ) : null}
        </div>
      ) : tsvData ? (
        <TsvTable headers={tsvData.headers} rows={tsvData.rows} />
      ) : (
        <div className="max-w-none text-sm text-foreground">
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

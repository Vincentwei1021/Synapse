"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentActionsProps {
  documentUuid: string;
  projectUuid: string;
  documentTitle: string;
  documentContent: string;
}

export function DocumentActions({ documentTitle, documentContent }: DocumentActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const handleDownload = useCallback(() => {
    const blob = new Blob([documentContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Sanitize filename
    const safeName = documentTitle.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [documentTitle, documentContent]);

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        className="border-border text-muted-foreground"
        onClick={handleDownload}
      >
        <Download className="mr-2 h-4 w-4" />
        {t("common.download")}
      </Button>
      <Button
        variant="outline"
        className="border-border text-muted-foreground"
        onClick={() => router.back()}
      >
        {t("common.back")}
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportResearchResults } from "./export-actions";

interface ExportButtonProps {
  projectUuid: string;
}

export function ExportButton({ projectUuid }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const result = await exportResearchResults(projectUuid);
      if (!result) return;

      const safeName = result.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      // Download Markdown
      downloadFile(result.markdown, `synapse-results-${safeName}.md`, "text/markdown");

      // Small delay between downloads so browser handles both
      setTimeout(() => {
        downloadFile(result.csv, `synapse-metrics-${safeName}.csv`, "text/csv");
      }, 300);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
      Export Results
    </Button>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

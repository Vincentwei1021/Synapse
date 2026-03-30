"use server";

import { getServerAuthContext } from "@/lib/auth-server";
import { getActiveBaseline } from "@/services/baseline.service";
import { getResearchProjectExportData } from "@/services/research-project.service";

export async function exportResearchResults(projectUuid: string): Promise<{
  markdown: string;
  csv: string;
  projectName: string;
} | null> {
  const auth = await getServerAuthContext();
  if (!auth) return null;

  const [projectData, baseline] =
    await Promise.all([
      getResearchProjectExportData(auth.companyUuid, projectUuid),
      getActiveBaseline(auth.companyUuid, projectUuid),
    ]);

  if (!projectData) return null;
  const { project, designs, questions, runs, rdrDocs } = projectData;

  // Build design lookup map
  const designMap = new Map(designs.map((d) => [d.uuid, d.title]));

  // Classify run outcomes
  const outcomeCounts = { accepted: 0, rejected: 0, inconclusive: 0, pending: 0 };
  for (const run of runs) {
    if (run.outcome === "accepted") outcomeCounts.accepted++;
    else if (run.outcome === "rejected") outcomeCounts.rejected++;
    else if (run.outcome === "inconclusive") outcomeCounts.inconclusive++;
    else outcomeCounts.pending++;
  }

  // ── Markdown generation ──────────────────────────────────────────────
  const md: string[] = [];
  md.push(`# ${project.name} — Research Results`);
  md.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  md.push("");

  // Summary
  md.push("## Summary");
  md.push(`- Research Questions: ${questions.length}`);
  md.push(`- Experiment Designs: ${designs.length}`);
  md.push(
    `- Experiment Runs: ${runs.length} total (${outcomeCounts.accepted} accepted, ${outcomeCounts.rejected} rejected, ${outcomeCounts.inconclusive} inconclusive, ${outcomeCounts.pending} pending)`
  );
  md.push("");

  // Baseline
  md.push("## Baseline");
  if (baseline) {
    md.push(`**${baseline.name}**`);
    const metrics = baseline.metrics as Record<string, number> | null;
    if (metrics && Object.keys(metrics).length > 0) {
      md.push("| Metric | Value |");
      md.push("|--------|-------|");
      for (const [key, value] of Object.entries(metrics)) {
        md.push(`| ${key} | ${value} |`);
      }
    }
  } else {
    md.push("No active baseline");
  }
  md.push("");

  // Results by Experiment Design
  md.push("## Results by Experiment Design");
  md.push("");

  // Group runs by design
  const runsByDesign = new Map<string | null, typeof runs>();
  for (const run of runs) {
    const key = run.experimentDesignUuid;
    if (!runsByDesign.has(key)) runsByDesign.set(key, []);
    runsByDesign.get(key)!.push(run);
  }

  for (const [designUuid, designRuns] of runsByDesign.entries()) {
    const designTitle = designUuid
      ? designMap.get(designUuid) ?? "Unknown Design"
      : "Ungrouped";
    md.push(`### ${designTitle}`);

    // Collect all metric keys across these runs
    const metricKeys = new Set<string>();
    for (const run of designRuns) {
      const results = run.experimentResults as Record<string, number> | null;
      if (results) {
        for (const key of Object.keys(results)) {
          metricKeys.add(key);
        }
      }
    }

    const sortedMetricKeys = Array.from(metricKeys).sort();

    if (sortedMetricKeys.length > 0) {
      // Build table header
      md.push(
        `| Run | Outcome | ${sortedMetricKeys.join(" | ")} |`
      );
      md.push(
        `|-----|---------|${sortedMetricKeys.map(() => "------").join("|")}|`
      );

      for (const run of designRuns) {
        const results = run.experimentResults as Record<string, number> | null;
        const metricCells = sortedMetricKeys.map((k) =>
          results && k in results ? String(results[k]) : ""
        );
        md.push(
          `| ${run.title} | ${run.outcome ?? "pending"} | ${metricCells.join(" | ")} |`
        );
      }
    } else {
      // No metrics — simple table
      md.push("| Run | Outcome |");
      md.push("|-----|---------|");
      for (const run of designRuns) {
        md.push(`| ${run.title} | ${run.outcome ?? "No results"} |`);
      }
    }

    md.push("");
  }

  // Research Decision Records
  if (rdrDocs.length > 0) {
    md.push("## Research Decision Records");
    md.push("");
    for (const doc of rdrDocs) {
      md.push(`### ${doc.title}`);
      md.push(doc.content ?? "");
      md.push("");
      md.push("---");
      md.push("");
    }
  }

  const markdown = md.join("\n");

  // ── CSV generation ───────────────────────────────────────────────────
  // Collect all unique metric keys across all runs
  const allMetricKeys = new Set<string>();
  for (const run of runs) {
    const results = run.experimentResults as Record<string, number> | null;
    if (results) {
      for (const key of Object.keys(results)) {
        allMetricKeys.add(key);
      }
    }
  }
  const sortedAllMetricKeys = Array.from(allMetricKeys).sort();

  const csvRows: string[] = [];
  // Header
  csvRows.push(
    ["run_uuid", "run_title", "design_title", "outcome", ...sortedAllMetricKeys]
      .map(escapeCsvField)
      .join(",")
  );

  // Data rows — only runs that have experimentResults
  for (const run of runs) {
    const results = run.experimentResults as Record<string, number> | null;
    if (!results) continue;

    const designTitle = run.experimentDesignUuid
      ? designMap.get(run.experimentDesignUuid) ?? "Unknown Design"
      : "";

    const row = [
      run.uuid,
      run.title,
      designTitle,
      run.outcome ?? "",
      ...sortedAllMetricKeys.map((k) => (k in results ? String(results[k]) : "")),
    ];
    csvRows.push(row.map(escapeCsvField).join(","));
  }

  const csv = csvRows.join("\n");

  return { markdown, csv, projectName: project.name };
}

/** Escape a value for CSV (RFC 4180). */
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

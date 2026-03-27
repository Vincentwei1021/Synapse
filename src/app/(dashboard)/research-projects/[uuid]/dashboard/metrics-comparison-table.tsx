"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ExperimentRunData {
  uuid: string;
  title: string;
  experimentDesignUuid: string | null;
  experimentDesignTitle: string | null;
  experimentResults: Record<string, number> | null;
  outcome: string | null;
}

interface BaselineData {
  name: string;
  metrics: Record<string, number>;
}

interface MetricsComparisonTableProps {
  runs: ExperimentRunData[];
  baseline: BaselineData | null;
}

type ViewMode = "by-design" | "custom-selection";

function hasResults(run: ExperimentRunData): boolean {
  return (
    run.experimentResults !== null &&
    Object.keys(run.experimentResults).length > 0
  );
}

function getOutcomeBadge(outcome: string | null) {
  switch (outcome) {
    case "Accepted":
      return <Badge variant="success">{outcome}</Badge>;
    case "Rejected":
      return <Badge variant="destructive">{outcome}</Badge>;
    case "Inconclusive":
      return <Badge variant="warning">{outcome}</Badge>;
    default:
      return null;
  }
}

function getCellColorClass(
  value: number,
  baselineValue: number | undefined,
): string {
  if (baselineValue === undefined) return "";
  if (value > baselineValue) return "text-green-600";
  if (value < baselineValue) return "text-red-600";
  return "";
}

function collectMetricNames(
  runs: ExperimentRunData[],
  baseline: BaselineData | null,
): string[] {
  const names = new Set<string>();
  if (baseline) {
    for (const key of Object.keys(baseline.metrics)) {
      names.add(key);
    }
  }
  for (const run of runs) {
    if (run.experimentResults) {
      for (const key of Object.keys(run.experimentResults)) {
        names.add(key);
      }
    }
  }
  return Array.from(names).sort();
}

interface GroupedRuns {
  designUuid: string | null;
  designTitle: string;
  runs: ExperimentRunData[];
}

function groupRunsByDesign(runs: ExperimentRunData[]): GroupedRuns[] {
  const groupMap = new Map<string | null, ExperimentRunData[]>();
  const titleMap = new Map<string | null, string>();

  for (const run of runs) {
    const key = run.experimentDesignUuid;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
      titleMap.set(key, run.experimentDesignTitle ?? "Ungrouped");
    }
    groupMap.get(key)!.push(run);
  }

  const groups: GroupedRuns[] = [];
  for (const [designUuid, groupRuns] of groupMap) {
    groups.push({
      designUuid,
      designTitle: titleMap.get(designUuid) ?? "Ungrouped",
      runs: groupRuns,
    });
  }

  // Sort: named groups first (alphabetically), then ungrouped at the end
  groups.sort((a, b) => {
    if (a.designUuid === null && b.designUuid !== null) return 1;
    if (a.designUuid !== null && b.designUuid === null) return -1;
    return a.designTitle.localeCompare(b.designTitle);
  });

  return groups;
}

function MetricsTable({
  runs,
  baseline,
}: {
  runs: ExperimentRunData[];
  baseline: BaselineData | null;
}) {
  const metricNames = useMemo(
    () => collectMetricNames(runs, baseline),
    [runs, baseline],
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[#6B6B6B]">Metric</TableHead>
          {baseline && (
            <TableHead className="bg-[#F5F5F5] text-[#6B6B6B]">
              {baseline.name}
            </TableHead>
          )}
          {runs.map((run) => (
            <TableHead key={run.uuid}>
              <div className="flex items-center gap-2">
                <span className="text-[#2C2C2C]">{run.title}</span>
                {getOutcomeBadge(run.outcome)}
              </div>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {metricNames.map((metric) => (
          <TableRow key={metric}>
            <TableCell className="font-medium text-[#2C2C2C]">
              {metric}
            </TableCell>
            {baseline && (
              <TableCell className="bg-[#F5F5F5] text-[#6B6B6B]">
                {baseline.metrics[metric] !== undefined
                  ? baseline.metrics[metric]
                  : "\u2014"}
              </TableCell>
            )}
            {runs.map((run) => {
              const value = run.experimentResults?.[metric];
              if (value === undefined) {
                return (
                  <TableCell key={run.uuid} className="text-[#6B6B6B]">
                    {"\u2014"}
                  </TableCell>
                );
              }
              const colorClass = baseline
                ? getCellColorClass(value, baseline.metrics[metric])
                : "";
              return (
                <TableCell
                  key={run.uuid}
                  className={colorClass || "text-[#2C2C2C]"}
                >
                  {value}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function MetricsComparisonTable({
  runs,
  baseline,
}: MetricsComparisonTableProps) {
  const [mode, setMode] = useState<ViewMode>("by-design");
  const [selectedRunUuids, setSelectedRunUuids] = useState<Set<string>>(
    new Set(),
  );

  const runsWithResults = useMemo(
    () => runs.filter(hasResults),
    [runs],
  );

  const groupedRuns = useMemo(
    () => groupRunsByDesign(runsWithResults),
    [runsWithResults],
  );

  const selectedRuns = useMemo(
    () => runsWithResults.filter((run) => selectedRunUuids.has(run.uuid)),
    [runsWithResults, selectedRunUuids],
  );

  const handleToggleRun = (uuid: string) => {
    setSelectedRunUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  if (runsWithResults.length === 0) {
    return (
      <Card className="border-[#E0E0E0]">
        <div className="flex items-center justify-center px-6 py-12">
          <p className="text-[15px] text-[#6B6B6B]">
            No experiment runs with results
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[#E0E0E0]">
      <div className="flex flex-col gap-4 px-6">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "by-design" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("by-design")}
          >
            By Design
          </Button>
          <Button
            variant={mode === "custom-selection" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("custom-selection")}
          >
            Custom Selection
          </Button>
        </div>

        {/* By Design mode */}
        {mode === "by-design" && (
          <div className="flex flex-col gap-6">
            {groupedRuns.map((group) => (
              <div key={group.designUuid ?? "__ungrouped"}>
                <h3 className="mb-3 font-semibold text-[15px] text-[#2C2C2C]">
                  {group.designTitle}
                </h3>
                <MetricsTable runs={group.runs} baseline={baseline} />
              </div>
            ))}
          </div>
        )}

        {/* Custom Selection mode */}
        {mode === "custom-selection" && (
          <div className="flex flex-col gap-4">
            {/* Run checklist */}
            <div className="flex flex-wrap gap-4">
              {runsWithResults.map((run) => (
                <label
                  key={run.uuid}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Checkbox
                    checked={selectedRunUuids.has(run.uuid)}
                    onCheckedChange={() => handleToggleRun(run.uuid)}
                  />
                  <span className="text-[13px] text-[#2C2C2C]">
                    {run.title}
                  </span>
                </label>
              ))}
            </div>

            {/* Table for selected runs */}
            {selectedRuns.length > 0 ? (
              <MetricsTable runs={selectedRuns} baseline={baseline} />
            ) : (
              <p className="py-8 text-center text-[13px] text-[#6B6B6B]">
                Select runs to compare
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface GoNoGoCriterion {
  metricName: string | null;
  threshold: number | null;
  operator: string | null;
  actualValue: number | null;
  required: boolean;
  isEarlyStop: boolean;
}

interface GoNoGoBadgeProps {
  criteria: GoNoGoCriterion[];
  size?: "sm" | "md";
}

function evaluateOperator(
  actual: number,
  op: string,
  threshold: number
): boolean {
  switch (op) {
    case ">=":
      return actual >= threshold;
    case "<=":
      return actual <= threshold;
    case ">":
      return actual > threshold;
    case "<":
      return actual < threshold;
    case "==":
      return actual === threshold;
    default:
      return false;
  }
}

export function GoNoGoBadge({ criteria, size = "sm" }: GoNoGoBadgeProps) {
  const researchCriteria = criteria.filter(
    (c) => c.metricName != null && c.operator != null && c.threshold != null
  );

  if (researchCriteria.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`rounded-full ${size === "sm" ? "size-1.5" : "size-2"}`}
              style={{ backgroundColor: "#9ca3af" }}
            />
          </TooltipTrigger>
          <TooltipContent>No Go/No-Go criteria</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const requiredCriteria = researchCriteria.filter((c) => c.required);

  let passed = 0;
  let failed = 0;
  let pending = 0;

  for (const c of requiredCriteria) {
    if (c.actualValue == null) {
      pending++;
    } else {
      const result = evaluateOperator(
        c.actualValue,
        c.operator!,
        c.threshold!
      );
      if (result) {
        passed++;
      } else {
        failed++;
      }
    }
  }

  const total = requiredCriteria.length;

  let color: string;
  if (total === 0) {
    color = "#9ca3af";
  } else if (failed > 0) {
    color = "#ef4444";
  } else if (passed === total) {
    color = "#22c55e";
  } else {
    color = "#eab308";
  }

  const tooltipText = `${passed}/${total} passed, ${pending} pending`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`rounded-full ${size === "sm" ? "size-1.5" : "size-2"}`}
            style={{ backgroundColor: color }}
          />
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

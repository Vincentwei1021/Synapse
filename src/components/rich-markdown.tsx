"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

/**
 * Detect ```chart code blocks and render as Recharts components.
 * Format:
 * ```chart
 * label,value
 * A,10
 * B,20
 * ```
 * Or with type:
 * ```chart:line
 * ...
 * ```
 */

function parseChartData(raw: string): { type: "bar" | "line"; data: Record<string, string | number>[]; keys: string[] } | null {
  const lines = raw.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return null;

  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());
  if (headers.length < 2) return null;

  const data = lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim());
    const row: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const val = cells[i] ?? "";
      const num = Number(val);
      row[h] = isNaN(num) ? val : num;
    });
    return row;
  });

  // Determine if all non-label columns are numeric
  const valueKeys = headers.slice(1);
  const allNumeric = data.every((row) =>
    valueKeys.every((k) => typeof row[k] === "number")
  );

  if (!allNumeric) return null;

  return { type: "bar", data, keys: valueKeys };
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function ChartBlock({ raw, chartType }: { raw: string; chartType?: string }) {
  const parsed = useMemo(() => parseChartData(raw), [raw]);
  if (!parsed) {
    return <pre className="overflow-x-auto rounded-lg bg-secondary p-4 text-sm">{raw}</pre>;
  }

  const type = chartType === "line" ? "line" : parsed.type;
  const labelKey = Object.keys(parsed.data[0] ?? {})[0] ?? "label";

  return (
    <div className="my-4 rounded-lg border border-border bg-card p-4">
      <ResponsiveContainer width="100%" height={300}>
        {type === "line" ? (
          <LineChart data={parsed.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {parsed.keys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart data={parsed.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {parsed.keys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function RichMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        // Override code blocks to detect chart blocks
        code({ className, children: codeChildren, ...props }) {
          const match = /language-chart(?::(\w+))?/.exec(className || "");
          if (match) {
            return <ChartBlock raw={String(codeChildren).replace(/\n$/, "")} chartType={match[1]} />;
          }
          // Inline code
          if (!className) {
            return (
              <code className="rounded bg-secondary px-1.5 py-0.5 text-sm font-mono" {...props}>
                {codeChildren}
              </code>
            );
          }
          // Block code with syntax highlighting fallback
          return (
            <code className={className} {...props}>
              {codeChildren}
            </code>
          );
        },
        pre({ children: preChildren }) {
          return <pre className="overflow-x-auto rounded-lg bg-secondary/80 p-4 text-sm">{preChildren}</pre>;
        },
        table({ children: tableChildren }) {
          return (
            <div className="my-4 overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">{tableChildren}</table>
            </div>
          );
        },
        thead({ children: theadChildren }) {
          return <thead className="border-b border-border bg-secondary/50">{theadChildren}</thead>;
        },
        th({ children: thChildren }) {
          return <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{thChildren}</th>;
        },
        td({ children: tdChildren }) {
          return <td className="px-4 py-2.5 text-foreground border-b border-border/30">{tdChildren}</td>;
        },
        img({ src, alt }) {
          return (
            <span className="my-4 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt || ""} className="max-w-full rounded-lg border border-border" loading="lazy" />
              {alt && <span className="mt-1 block text-center text-xs text-muted-foreground">{alt}</span>}
            </span>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

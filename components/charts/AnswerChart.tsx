"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import type {
  QuestionSummary,
  TextSummary,
  ChoiceSummary,
  GridSummary,
  ScaleSummary,
  FileSummary,
} from "@/lib/summary-helpers";

// ─── Palette ──────────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", // indigo-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
];

function colorFor(index: number) {
  return COLORS[index % COLORS.length];
}

// ─── Tooltip customisation ───────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { percent?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const { value, payload: entry } = payload[0];
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm">
      <span className="font-semibold text-gray-800">{value}</span>
      {entry.percent !== undefined && (
        <span className="ml-1 text-gray-500">({entry.percent}%)</span>
      )}
    </div>
  );
}

// ─── Text summary ─────────────────────────────────────────────────────────────

function TextCard({ summary }: { summary: TextSummary }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Pill label="Responses" value={summary.totalAnswers} />
        {summary.type === "SHORT_TEXT" || summary.type === "PARAGRAPH" ? (
          <Pill label="Unique" value={summary.uniqueCount} />
        ) : null}
      </div>
      {summary.recentEntries.length > 0 && (
        <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
          {summary.recentEntries.map((entry, i) => (
            <li
              key={i}
              className="px-3 py-2 text-gray-700 break-words leading-snug"
            >
              {entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Choice summary ───────────────────────────────────────────────────────────

function ChoiceCard({ summary }: { summary: ChoiceSummary }) {
  const [showPie, setShowPie] = useState(false);

  const data = summary.distribution.map((d, i) => ({
    ...d,
    fill: colorFor(i),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Pill label="Responses" value={summary.totalAnswers} />
        {data.length > 1 && (
          <button
            onClick={() => setShowPie((v) => !v)}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            {showPie ? "Bar" : "Pie"}
          </button>
        )}
      </div>

      {showPie ? (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name ?? ""} ${Math.round((percent ?? 0) * 100)}%`
              }
              labelLine={false}
            >
              {data.map((entry, i) => (
                <Cell key={entry.label} fill={colorFor(i)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-gray-700">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ left: 0, right: 24, top: 4, bottom: 4 }}
          >
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) =>
                v.length > 18 ? `${v.slice(0, 17)}…` : v
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {data.map((entry, i) => (
                <Cell key={entry.label} fill={colorFor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Grid summary ─────────────────────────────────────────────────────────────

function GridCard({ summary }: { summary: GridSummary }) {
  if (summary.rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-5">
      <Pill label="Responses" value={summary.totalAnswers} />
      {summary.rows.map((row) => {
        const rowData = row.columns.map((col, i) => ({
          label: col.label,
          count: col.count,
          fill: colorFor(i),
        }));
        return (
          <div key={row.id} className="space-y-1">
            <p className="text-xs font-semibold text-gray-600 truncate">
              {row.label}
            </p>
            <ResponsiveContainer width="100%" height={Math.max(120, rowData.length * 32)}>
              <BarChart
                layout="vertical"
                data={rowData}
                margin={{ left: 0, right: 20, top: 2, bottom: 2 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={100}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) =>
                    v.length > 14 ? `${v.slice(0, 13)}…` : v
                  }
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {rowData.map((entry, i) => (
                    <Cell key={entry.label} fill={colorFor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

// ─── Scale summary ────────────────────────────────────────────────────────────

function ScaleCard({ summary }: { summary: ScaleSummary }) {
  const data = summary.distribution.map((d, i) => ({
    ...d,
    fill: colorFor(i),
    label: String(d.value),
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Pill label="Responses" value={summary.totalAnswers} />
        {summary.totalAnswers > 0 && (
          <>
            <Pill label="Average" value={summary.avg} />
            <Pill label="Min" value={summary.min} />
            <Pill label="Max" value={summary.max} />
          </>
        )}
      </div>
      {data.length > 0 && (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {data.map((entry, i) => (
                <Cell key={i} fill={colorFor(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── File summary ─────────────────────────────────────────────────────────────

function FileCard({ summary }: { summary: FileSummary }) {
  const isImage = (url: string) => IMAGE_EXTS.test(url);

  return (
    <div className="space-y-3">
      <Pill label="Files submitted" value={summary.totalAnswers} />
      {summary.urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-gray-200 hover:border-indigo-400 transition-colors"
            >
              {isImage(url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={`File ${i + 1}`}
                  className="h-16 w-16 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center bg-gray-50 text-xs text-gray-500 p-1 text-center break-all">
                  {url.split("/").pop()}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Pill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1">
      <span className="text-xs text-indigo-600 font-medium">{label}</span>
      <span className="text-sm font-bold text-indigo-800">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="py-4 text-center text-sm text-gray-400">No responses yet.</p>
  );
}

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;

// ─── Main export ─────────────────────────────────────────────────────────────

export default function AnswerChart({ summary }: { summary: QuestionSummary }) {
  if (summary.totalAnswers === 0) {
    return <EmptyState />;
  }

  switch (summary.kind) {
    case "text":
      return <TextCard summary={summary} />;
    case "choice":
      return <ChoiceCard summary={summary} />;
    case "grid":
      return <GridCard summary={summary} />;
    case "scale":
      return <ScaleCard summary={summary} />;
    case "file":
      return <FileCard summary={summary} />;
    default:
      return null;
  }
}

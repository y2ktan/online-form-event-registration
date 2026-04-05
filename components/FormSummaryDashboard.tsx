"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  RefreshCw,
  LayoutGrid,
  User,
  ChevronLeft,
  ChevronRight,
  Phone,
  Hash,
} from "lucide-react";
import AnswerChart from "@/components/charts/AnswerChart";
import {
  aggregateResponses,
  buildAnswerMap,
  parseConfig,
  type QuestionRecord,
} from "@/lib/summary-helpers";
import { QUESTION_TYPE_LABELS } from "@/lib/question-types";

// ─── Prop types (mirror existing editor types) ───────────────────────────────

interface AnswerData {
  id: string;
  value: string;
  question: {
    label: string;
    type: string;
    config: string | Record<string, unknown>;
  };
}

interface ResponseEntry {
  id: string;
  shortCode: string;
  phoneNumber: string | null;
  createdAt: string;
  updatedAt: string;
  answers: AnswerData[];
}

interface QuestionData {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  order: number;
  options: { id: string; value: string; order: number; group: string }[];
  config: Record<string, unknown>;
}

interface FormSummaryDashboardProps {
  responses: ResponseEntry[];
  questions: QuestionData[];
  formId: string;
  onRefresh: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a raw answer value into a readable string for the individual view. */
function formatValue(value: string, type: string): string {
  if (!value || value.trim() === "") return "—";
  switch (type) {
    case "CHECKBOX": {
      try {
        const arr = JSON.parse(value) as unknown[];
        if (Array.isArray(arr)) return arr.join(", ");
      } catch {
        /* fall through */
      }
      return value;
    }
    case "MULTIPLE_CHOICE_GRID":
    case "CHECKBOX_GRID": {
      try {
        const obj = JSON.parse(value) as Record<string, string | string[]>;
        return Object.entries(obj)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
      } catch {
        /* fall through */
      }
      return value;
    }
    default:
      return value;
  }
}

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
      <p className="text-2xl font-bold text-indigo-600">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function QuestionCard({
  children,
  label,
  typeLabel,
}: {
  children: React.ReactNode;
  label: string;
  typeLabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800 leading-snug flex-1">
          {label || <span className="italic text-gray-400">Untitled question</span>}
        </h3>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          {typeLabel}
        </span>
      </div>
      {children}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = QUESTION_TYPE_LABELS;

// ─── Individual response view ───────────────────────────────────────────────

function IndividualView({ responses }: { responses: ResponseEntry[] }) {
  const [index, setIndex] = useState(0);

  // Reset index when responses list changes (e.g. after refresh)
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, responses.length - 1)));
  }, [responses.length]);

  if (responses.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
        No responses yet.
      </div>
    );
  }

  const resp = responses[index];
  const visibleAnswers = resp.answers.filter((a) => {
    const cfg = parseConfig(a.question.config);
    return !cfg.isPhoneNumber && !cfg.isTitle && !cfg.isMedia;
  });

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous response"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <span className="text-xs text-gray-500">
            Response {index + 1} of {responses.length}
          </span>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <Hash className="h-3 w-3 text-gray-400" />
            <span className="text-xs font-mono font-semibold text-gray-700">
              {resp.shortCode}
            </span>
          </div>
        </div>
        <button
          onClick={() => setIndex((i) => Math.min(responses.length - 1, i + 1))}
          disabled={index === responses.length - 1}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next response"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Response detail card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Phone className="h-3.5 w-3.5" />
            {resp.phoneNumber ?? "—"}
          </div>
          <div className="text-xs text-gray-400">
            Submitted {relativeTime(resp.createdAt)}
          </div>
        </div>

        {/* Answers */}
        {visibleAnswers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">
            No answers for this response.
          </p>
        ) : (
          visibleAnswers.map((answer) => (
            <div key={answer.id} className="px-4 py-3">
              <p className="text-xs font-medium text-gray-500 mb-1">
                {answer.question.label || (
                  <span className="italic">Untitled</span>
                )}
              </p>
              <p className="text-sm text-gray-800 break-words">
                {formatValue(answer.value, answer.question.type)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FormSummaryDashboard({
  responses,
  questions,
  formId,
  onRefresh,
}: FormSummaryDashboardProps) {
  const [view, setView] = useState<"summary" | "individual">("summary");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // ── SSE subscription ─────────────────────────────────────────────────────
  const stableRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 3_000))]);
    setLastUpdated(new Date());
    setRefreshing(false);
  }, [onRefresh]);

  useEffect(() => {
    const es = new EventSource(`/api/forms/${formId}/sse`);
    es.onmessage = () => stableRefresh();
    es.onerror = () => {
      // Close and reconnect after a brief pause to handle transient errors
      es.close();
    };
    return () => es.close();
  }, [formId, stableRefresh]);

  // ── Aggregation (memoised — O(R × Q) single pass) ────────────────────────
  const summaries = useMemo(() => {
    const answerMap = buildAnswerMap(
      responses as unknown as Array<{ answers: Array<Record<string, unknown>> }>
    );
    return aggregateResponses(answerMap, questions as unknown as QuestionRecord[]);
  }, [responses, questions]);

  // ── Phone stats ───────────────────────────────────────────────────────────
  const phoneCount = useMemo(
    () => responses.filter((r) => r.phoneNumber).length,
    [responses]
  );

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <StatCard
            label="Total Responses"
            value={responses.length}
            sub={responses.length > 0 ? `Last: ${relativeTime(responses[0].createdAt)}` : undefined}
          />
          {phoneCount > 0 && (
            <StatCard label="With Phone" value={phoneCount} />
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setView("summary")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                view === "summary"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Summary
            </button>
            <button
              onClick={() => setView("individual")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                view === "individual"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Individual
            </button>
          </div>

          {/* Manual refresh */}
          <button
            onClick={stableRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            title="Refresh now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Updated {relativeTime(lastUpdated.toISOString())} · auto-refreshes on
        new submissions
      </p>

      {/* ── View: Summary ───────────────────────────────────────────────── */}
      {view === "summary" && (
        <>
          {responses.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
              No responses yet. Share your form to start collecting data.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {summaries.map((summary) => (
                <QuestionCard
                  key={summary.questionId}
                  label={summary.label}
                  typeLabel={TYPE_LABELS[summary.type] ?? summary.type}
                >
                  <AnswerChart summary={summary} />
                </QuestionCard>
              ))}
              {summaries.length === 0 && (
                <p className="col-span-2 py-8 text-center text-sm text-gray-400">
                  No answerable questions found in this form.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── View: Individual ────────────────────────────────────────────── */}
      {view === "individual" && <IndividualView responses={responses} />}
    </div>
  );
}

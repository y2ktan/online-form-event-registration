"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  LayoutGrid,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Phone,
  Hash,
  Search,
  X,
  Users,
  AlertCircle,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import AnswerChart from "@/components/charts/AnswerChart";
import { parseConfig, type QuestionSummary, type SectionSummary } from "@/lib/summary-helpers";
import { QUESTION_TYPE_LABELS } from "@/lib/question-types";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SummaryData {
  sections: SectionSummary[];
  totalResponses: number;
  userProfileCount: number | null;
  respondedRegistered: number;
  notYetRegistered: number;
  newUsers: number;
  lookupConfigured: boolean;
}

interface RegUserTableData {
  headers: string[];
  rows: Record<string, string>[];
  total: number;
  page: number;
  pageSize: number;
  lookupConfigured: boolean;
  lookupColumn: string;
  respondedCount: number;
  notRespondedCount: number;
  newUsersCount: number;
}

interface FormSummaryDashboardProps {
  formId: string;
  onRefresh: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const TYPE_LABELS: Record<string, string> = QUESTION_TYPE_LABELS;
const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center min-w-[120px]">
      <p className={`text-2xl font-bold ${accent ?? "text-indigo-600"}`}>{value}</p>
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

function SummaryPieCharts({
  totalResponses,
  respondedRegistered,
  notYetRegistered,
  newUsers,
}: {
  totalResponses: number;
  respondedRegistered: number;
  notYetRegistered: number;
  newUsers: number;
}) {
  const responseData = [
    { name: "Registered Responses", value: respondedRegistered },
    { name: "New User Responses", value: newUsers },
  ].filter((item) => item.value > 0);

  const profileData = [
    { name: "Responded", value: respondedRegistered },
    { name: "Not Yet", value: notYetRegistered },
  ].filter((item) => item.value > 0);

  const renderLabel = ({ percent }: { percent?: number }) => {
    const value = Math.round((percent ?? 0) * 100);
    return value > 0 ? `${value}%` : "";
  };

  const toNumber = (
    value: number | string | Array<number | string> | ReadonlyArray<number | string> | undefined
  ): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = Number(value[0]);
      return Number.isFinite(first) ? first : 0;
    }
    return 0;
  };

  const responseTooltipFormatter = (
    value: number | string | Array<number | string> | ReadonlyArray<number | string> | undefined
  ): [string, string] => {
    const numeric = toNumber(value);
    const pct = totalResponses > 0 ? Math.round((numeric / totalResponses) * 100) : 0;
    return [`${numeric} (${pct}%)`, "Count"];
  };

  const profileTooltipFormatter = (
    value: number | string | Array<number | string> | ReadonlyArray<number | string> | undefined
  ): [string, string] => {
    const numeric = toNumber(value);
    const base = respondedRegistered + notYetRegistered;
    const pct = base > 0 ? Math.round((numeric / base) * 100) : 0;
    return [`${numeric} (${pct}%)`, "Count"];
  };

  if (responseData.length === 0 && profileData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Responses Overview</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={responseData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={78}
              label={renderLabel}
              labelLine={false}
            >
              {responseData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={responseTooltipFormatter} />
            <Legend formatter={(value) => <span className="text-xs text-gray-700">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">User Profile Overview</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={profileData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={78}
              label={renderLabel}
              labelLine={false}
            >
              {profileData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={profileTooltipFormatter} />
            <Legend formatter={(value) => <span className="text-xs text-gray-700">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Section accordion ────────────────────────────────────────────────────────

function SectionAccordion({
  section,
  open,
  onToggle,
}: {
  section: SectionSummary;
  open: boolean;
  onToggle: () => void;
}) {
  if (section.questions.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
          <h2 className="text-sm font-semibold text-gray-700">{section.title}</h2>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
            {section.questions.length} question{section.questions.length !== 1 ? "s" : ""}
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {section.questions.map((summary) => (
              <QuestionCard
                key={summary.questionId}
                label={summary.label}
                typeLabel={TYPE_LABELS[summary.type] ?? summary.type}
              >
                <AnswerChart summary={summary} />
              </QuestionCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Non-respondents panel ──────────────────────────────────────────────────

function NonRespondentsPanel({
  formId,
  totalResponses,
  userProfileCount,
  respondedRegistered,
  notYetRegistered,
  newUsersCount,
  lookupConfigured,
  questions,
  onConfigSaved,
}: {
  formId: string;
  totalResponses: number;
  userProfileCount: number;
  respondedRegistered: number;
  notYetRegistered: number;
  newUsersCount: number;
  lookupConfigured: boolean;
  questions: { id: string; label: string; type: string }[];
  onConfigSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tableData, setTableData] = useState<RegUserTableData | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "responded" | "not_responded" | "new_users">("all");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [configCol, setConfigCol] = useState("");
  const [configQid, setConfigQid] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  const fetchTable = useCallback(
    async (p: number, q: string, f: string = "all") => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          tableView: "1",
          page: String(p),
          pageSize: "50",
          filter: f,
        });
        if (q.trim()) params.set("search", q.trim());
        const res = await fetch(
          `/api/forms/${formId}/registered-user-data?${params}`
        );
        if (res.ok) {
          setTableData(await res.json());
        }
      } catch {
        // ignore
      }
      setLoading(false);
    },
    [formId]
  );

  // Fetch on open
  useEffect(() => {
    if (open && !tableData) fetchTable(1, "", filter);
  }, [open, tableData, fetchTable, filter]);

  // Debounced search
  const onSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchTable(1, val, filter);
    }, 400);
  };

  const onFilterChange = (f: "all" | "responded" | "not_responded" | "new_users") => {
    setFilter(f);
    setPage(1);
    setTableData(null); // force re-fetch
    fetchTable(1, search, f);
  };

  const goPage = (p: number) => {
    setPage(p);
    fetchTable(p, search, filter);
  };

  const totalPages = tableData
    ? Math.ceil(tableData.total / tableData.pageSize)
    : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
          <Users className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-700">
            Registered Users
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            Registered: <strong>{userProfileCount}</strong>
          </span>
          {lookupConfigured ? (
            <>
              <span className="text-green-600">
                Responded: <strong>{respondedRegistered}</strong>
              </span>
              {notYetRegistered > 0 && (
                <span className="flex items-center gap-1 text-orange-600 font-semibold">
                  <AlertCircle className="h-3 w-3" />
                  Not yet: {notYetRegistered}
                </span>
              )}
              {newUsersCount > 0 && (
                <span className="text-emerald-600 font-semibold">
                  New: {newUsersCount}
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertCircle className="h-3 w-3" />
              Lookup not configured
            </span>
          )}
        </div>
      </button>

      {/* Expandable table */}
      {open && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {/* Filter toggles */}
          <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden w-fit">
            {(
              [
                { key: "all" as const, label: "All", count: userProfileCount },
                {
                  key: "responded" as const,
                  label: "Responded",
                  count: tableData?.lookupConfigured
                    ? tableData.respondedCount
                    : respondedRegistered,
                },
                {
                  key: "not_responded" as const,
                  label: "Not Yet",
                  count: tableData?.lookupConfigured
                    ? tableData.notRespondedCount
                    : notYetRegistered,
                },
                {
                  key: "new_users" as const,
                  label: "New Users",
                  count: tableData?.lookupConfigured
                    ? tableData.newUsersCount
                    : newUsersCount,
                },
              ]
            ).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => onFilterChange(key)}
                disabled={!tableData?.lookupConfigured && key !== "all"}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === key
                    ? key === "not_responded"
                      ? "bg-orange-600 text-white"
                      : key === "responded"
                        ? "bg-green-600 text-white"
                        : key === "new_users"
                          ? "bg-emerald-600 text-white"
                          : "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={
                  !tableData?.lookupConfigured && key !== "all"
                    ? "Configure a lookup column in User Profile settings to enable this filter"
                    : undefined
                }
              >
                {label} ({count})
              </button>
            ))}
          </div>
          {tableData && !tableData.lookupConfigured && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs font-medium text-amber-800">
                  Link a spreadsheet column to a form question to track who has responded.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Spreadsheet Column</label>
                  <select
                    value={configCol}
                    onChange={(e) => setConfigCol(e.target.value)}
                    className="block w-48 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">— Select column —</option>
                    {tableData.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Form Question</label>
                  <select
                    value={configQid}
                    onChange={(e) => setConfigQid(e.target.value)}
                    className="block w-56 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">— Select question —</option>
                    {questions.map((q) => (
                      <option key={q.id} value={q.id}>{q.label} ({q.type})</option>
                    ))}
                  </select>
                </div>
                <button
                  disabled={!configCol || !configQid || configSaving}
                  onClick={async () => {
                    setConfigSaving(true);
                    try {
                      const res = await fetch(`/api/forms/${formId}/registered-user-data`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          lookupColumn: configCol,
                          lookupQuestionId: configQid,
                          mappings: { [configQid]: configCol },
                        }),
                      });
                      if (res.ok) {
                        setTableData(null);
                        onConfigSaved();
                      }
                    } catch { /* ignore */ }
                    setConfigSaving(false);
                  }}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {configSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search across all columns…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setPage(1);
                  fetchTable(1, "", filter);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {loading && (
            <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
          )}

          {!loading && tableData && tableData.rows.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
              {search
                ? `No rows match "${search}"`
                : "No registered user data."}
            </div>
          )}

          {!loading && tableData && tableData.rows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {tableData.headers.map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tableData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {tableData.headers.map((h) => (
                          <td
                            key={h}
                            className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate"
                            title={String(row[h] ?? "")}
                          >
                            {row[h] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                  <span>
                    Page {tableData.page} of {totalPages} ({tableData.total}{" "}
                    rows)
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => goPage(page - 1)}
                      disabled={page <= 1}
                      className="rounded px-2 py-1 border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => goPage(page + 1)}
                      disabled={page >= totalPages}
                      className="rounded px-2 py-1 border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Paginated Individual response view ──────────────────────────────────────

function IndividualView({ formId }: { formId: string }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [responses, setResponses] = useState<ResponseEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 50;

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/responses?formId=${formId}&page=${p}&pageSize=${pageSize}`
        );
        if (res.ok) {
          const data = await res.json();
          setResponses(data.responses);
          setTotal(data.total);
          setPage(data.page);
          setIndex(0);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    },
    [formId]
  );

  // Fetch first page on mount
  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  const totalPages = Math.ceil(total / pageSize);

  // Client-side filter within current page
  const filtered = query.trim()
    ? responses.filter((r) => {
        const q = query.trim().toLowerCase();
        if (r.shortCode?.toLowerCase().includes(q)) return true;
        if (r.phoneNumber?.toLowerCase().includes(q)) return true;
        return r.answers.some(
          (a) =>
            a.value?.toLowerCase().includes(q) ||
            a.question.label?.toLowerCase().includes(q)
        );
      })
    : responses;

  // Reset index when filter or page changes
  useEffect(() => {
    setIndex(0);
  }, [query, page]);

  if (loading && responses.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
        No responses yet.
      </div>
    );
  }

  const resp = filtered[index];
  const visibleAnswers = resp
    ? resp.answers.filter((a) => {
        const cfg = parseConfig(a.question.config);
        return !cfg.isPhoneNumber && !cfg.isTitle && !cfg.isMedia;
      })
    : [];

  return (
    <div className="space-y-4">
      {/* Search within page */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by short code, phone, question or answer…"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
          No responses match &ldquo;{query}&rdquo; on this page.
        </div>
      ) : (
        <>
          {/* Response nav within page */}
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
                Response {index + 1} of {filtered.length}
                {query && (
                  <span className="text-gray-400"> ({total} total)</span>
                )}
              </span>
              {resp && (
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <Hash className="h-3 w-3 text-gray-400" />
                  <span className="text-xs font-mono font-semibold text-gray-700">
                    {resp.shortCode}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() =>
                setIndex((i) => Math.min(filtered.length - 1, i + 1))
              }
              disabled={index === filtered.length - 1}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next response"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Response detail card */}
          {resp && (
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
          )}
        </>
      )}

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm text-xs text-gray-500">
          <button
            onClick={() => fetchPage(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded px-2 py-1 border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev page
          </button>
          <span>
            Page {page} of {totalPages} ({total} responses)
          </span>
          <button
            onClick={() => fetchPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded px-2 py-1 border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next page →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FormSummaryDashboard({
  formId,
  onRefresh,
}: FormSummaryDashboardProps) {
  const [view, setView] = useState<"summary" | "individual">("summary");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [summaryError, setSummaryError] = useState(false);

  // ── Fetch summary data from server ────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/forms/${formId}/summary`);
      if (res.ok) {
        const data: SummaryData = await res.json();
        setSummaryData(data);
        setSummaryError(false);
        // Default: all sections open on first load
        setOpenSections((prev) => {
          if (prev.size === 0) {
            return new Set(data.sections.map((s) => s.id));
          }
          return prev;
        });
      } else {
        setSummaryError(true);
      }
    } catch {
      setSummaryError(true);
    }
  }, [formId]);

  // ── SSE subscription ─────────────────────────────────────────────────────
  const stableRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      onRefresh(),
      fetchSummary(),
      new Promise((r) => setTimeout(r, 3_000)),
    ]);
    setLastUpdated(new Date());
    setRefreshing(false);
  }, [onRefresh, fetchSummary]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const es = new EventSource(`/api/forms/${formId}/sse`);
    es.onmessage = () => stableRefresh();
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [formId, stableRefresh]);

  // ── Toggle a section ──────────────────────────────────────────────────
  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalQuestions = summaryData
    ? summaryData.sections.reduce((s, sec) => s + sec.questions.length, 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <StatCard
            label="Total Responses"
            value={summaryData?.totalResponses ?? "—"}
          />
          {summaryData && summaryData.userProfileCount !== null && (
            <>
              <StatCard
                label="Registered"
                value={summaryData.userProfileCount}
                accent="text-blue-600"
              />
              <StatCard
                label="Responded"
                value={summaryData.respondedRegistered}
                accent="text-green-600"
              />
              <StatCard
                label="Not Yet"
                value={summaryData.notYetRegistered}
                accent="text-orange-600"
              />
              {summaryData.newUsers > 0 && (
                <StatCard
                  label="New Users"
                  value={summaryData.newUsers}
                  accent="text-emerald-600"
                />
              )}
            </>
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
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {refreshing ? "Refreshing…" : "Refresh"}
            </span>
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Updated {relativeTime(lastUpdated.toISOString())} · auto-refreshes on
        new submissions
      </p>

      {/* ── Non-respondents panel ───────────────────────────────────────── */}
      {summaryData && summaryData.userProfileCount !== null && (
        <NonRespondentsPanel
          formId={formId}
          totalResponses={summaryData.totalResponses}
          userProfileCount={summaryData.userProfileCount}
          respondedRegistered={summaryData.respondedRegistered}
          notYetRegistered={summaryData.notYetRegistered}
          newUsersCount={summaryData.newUsers}
          lookupConfigured={summaryData.lookupConfigured}
          questions={summaryData.sections
            .flatMap((s) => s.questions)
            .map((q) => ({ id: q.questionId, label: q.label, type: q.type }))}
          onConfigSaved={fetchSummary}
        />
      )}

      {/* ── View: Summary ───────────────────────────────────────────────── */}
      {view === "summary" && (
        <>
          {summaryError && (
            <div className="rounded-xl border-2 border-dashed border-red-200 p-8 text-center text-sm text-red-400">
              Failed to load summary. Please try refreshing.
            </div>
          )}

          {!summaryError && !summaryData && (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
              Loading summary…
            </div>
          )}

          {!summaryError &&
            summaryData &&
            summaryData.totalResponses === 0 && (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
                No responses yet. Share your form to start collecting data.
              </div>
            )}

          {!summaryError &&
            summaryData &&
            summaryData.totalResponses > 0 && (
              <div className="space-y-4">
                {summaryData.userProfileCount !== null && (
                  <SummaryPieCharts
                    totalResponses={summaryData.totalResponses}
                    respondedRegistered={summaryData.respondedRegistered}
                    notYetRegistered={summaryData.notYetRegistered}
                    newUsers={summaryData.newUsers}
                  />
                )}
                {summaryData.sections.map((section) => (
                  <SectionAccordion
                    key={section.id}
                    section={section}
                    open={openSections.has(section.id)}
                    onToggle={() => toggleSection(section.id)}
                  />
                ))}
                {totalQuestions === 0 && (
                  <p className="py-8 text-center text-sm text-gray-400">
                    No answerable questions found in this form.
                  </p>
                )}
              </div>
            )}
        </>
      )}

      {/* ── View: Individual ────────────────────────────────────────────── */}
      {view === "individual" && <IndividualView formId={formId} />}
    </div>
  );
}

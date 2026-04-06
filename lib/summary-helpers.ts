// Pure aggregation helpers for the response summary dashboard.
// No side effects, no imports from React or Next.js — safe to use in both
// client components and unit tests.

// ─── Input types ─────────────────────────────────────────────────────────────

export interface GridItem {
  id: string;
  value: string;
}

export interface QuestionRecord {
  id: string;
  type: string;
  label: string;
  /** Already-parsed config object (not a JSON string). */
  config: Record<string, unknown>;
}

/** A single grouped-count row returned by `prisma.answer.groupBy`. */
export interface GroupedCount {
  questionId: string;
  value: string;
  _count: number;
}

/** Section metadata used for section-aware summary output. */
export interface SectionMeta {
  id: string;
  title: string;
  order: number;
}

/** Section-grouped summary returned by the summary API. */
export interface SectionSummary {
  id: string;
  title: string;
  order: number;
  questions: QuestionSummary[];
}

// ─── Output types ────────────────────────────────────────────────────────────

export interface TextSummary {
  kind: "text";
  questionId: string;
  label: string;
  type: string;
  totalAnswers: number;
  uniqueCount: number;
  /** Up to 10 most-recent non-empty entries (order preserved). */
  recentEntries: string[];
}

export interface DistributionItem {
  label: string;
  count: number;
  percent: number;
}

export interface ChoiceSummary {
  kind: "choice";
  questionId: string;
  label: string;
  type: string;
  totalAnswers: number;
  /** Top-10 options by frequency (sorted desc). */
  distribution: DistributionItem[];
}

export interface GridColumnCount {
  id: string;
  label: string;
  count: number;
}

export interface GridRowSummary {
  id: string;
  label: string;
  columns: GridColumnCount[];
}

export interface GridSummary {
  kind: "grid";
  questionId: string;
  label: string;
  type: string;
  isCheckbox: boolean;
  totalAnswers: number;
  rows: GridRowSummary[];
}

export interface ScaleSummary {
  kind: "scale";
  questionId: string;
  label: string;
  type: string;
  totalAnswers: number;
  min: number;
  max: number;
  avg: number;
  distribution: { value: number; count: number }[];
}

export interface FileSummary {
  kind: "file";
  questionId: string;
  label: string;
  type: string;
  totalAnswers: number;
  /** Up to 20 most-recent file URL paths. */
  urls: string[];
}

export type QuestionSummary =
  | TextSummary
  | ChoiceSummary
  | GridSummary
  | ScaleSummary
  | FileSummary;

// ─── Type buckets ────────────────────────────────────────────────────────────

const TEXT_TYPES = new Set(["SHORT_TEXT", "PARAGRAPH", "DATE", "TIME"]);
const CHOICE_TYPES = new Set(["MULTIPLE_CHOICE", "CHECKBOX", "DROPDOWN"]);
const GRID_TYPES = new Set(["MULTIPLE_CHOICE_GRID", "CHECKBOX_GRID"]);
const SCALE_TYPES = new Set(["LINEAR_SCALE", "RATING"]);
const FILE_TYPES = new Set(["FILE_UPLOAD", "SELFIE"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseConfig(cfg: unknown): Record<string, unknown> {
  if (!cfg) return {};
  if (typeof cfg === "string") {
    try {
      return JSON.parse(cfg) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof cfg === "object") return cfg as Record<string, unknown>;
  return {};
}

// ─── Main aggregation ────────────────────────────────────────────────────────

/**
 * Aggregate raw answer values (grouped by questionId) into per-question
 * summary objects ready for display.
 *
 * @param answersByQuestion  Map<questionId, string[]> — all raw answer values
 *                           per question across all responses.
 * @param questions          Ordered list of questions for the form. Questions
 *                           marked isPhoneNumber / isTitle / isMedia are skipped.
 */
export function aggregateResponses(
  answersByQuestion: Map<string, string[]>,
  questions: QuestionRecord[]
): QuestionSummary[] {
  const summaries: QuestionSummary[] = [];

  for (const q of questions) {
    const config = parseConfig(q.config);

    // Skip decorative / system questions
    if (config.isPhoneNumber || config.isTitle || config.isMedia) continue;

    const rawValues = answersByQuestion.get(q.id) ?? [];
    const nonEmpty = rawValues.filter((v) => v.trim() !== "");

    if (TEXT_TYPES.has(q.type)) {
      const unique = new Set(nonEmpty.map((v) => v.toLowerCase()));
      summaries.push({
        kind: "text",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: nonEmpty.length,
        uniqueCount: unique.size,
        recentEntries: nonEmpty.slice(0, 10),
      });
    } else if (CHOICE_TYPES.has(q.type)) {
      const counts = new Map<string, number>();

      for (const v of nonEmpty) {
        if (q.type === "CHECKBOX") {
          let arr: unknown;
          try {
            arr = JSON.parse(v);
          } catch {
            // treat as a single plain-text value
            counts.set(v, (counts.get(v) ?? 0) + 1);
            continue;
          }
          if (Array.isArray(arr)) {
            for (const item of arr as string[]) {
              const key = String(item);
              counts.set(key, (counts.get(key) ?? 0) + 1);
            }
          }
        } else {
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }

      const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
      const distribution: DistributionItem[] = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / total) * 100),
        }));

      summaries.push({
        kind: "choice",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: nonEmpty.length,
        distribution,
      });
    } else if (GRID_TYPES.has(q.type)) {
      const grid = config.grid as
        | { rows: GridItem[]; columns: GridItem[] }
        | undefined;

      if (!grid || !Array.isArray(grid.rows) || !Array.isArray(grid.columns)) {
        // Malformed config — emit empty grid
        summaries.push({
          kind: "grid",
          questionId: q.id,
          label: q.label,
          type: q.type,
          isCheckbox: q.type === "CHECKBOX_GRID",
          totalAnswers: 0,
          rows: [],
        });
        continue;
      }

      // matrix[rowId][colId] = count
      const matrix = new Map<string, Map<string, number>>();
      for (const row of grid.rows) {
        const colMap = new Map<string, number>();
        for (const col of grid.columns) colMap.set(col.id, 0);
        matrix.set(row.id, colMap);
      }

      let answered = 0;
      for (const v of nonEmpty) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(v);
        } catch {
          continue; // skip malformed
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          continue;
        }
        answered++;
        for (const [rowId, colVal] of Object.entries(
          parsed as Record<string, unknown>
        )) {
          const colMap = matrix.get(rowId);
          if (!colMap) continue;
          const colIds: string[] = Array.isArray(colVal)
            ? (colVal as string[])
            : [String(colVal)];
          for (const colId of colIds) {
            colMap.set(colId, (colMap.get(colId) ?? 0) + 1);
          }
        }
      }

      const rows: GridRowSummary[] = grid.rows.map((row) => ({
        id: row.id,
        label: row.value,
        columns: grid.columns.map((col) => ({
          id: col.id,
          label: col.value,
          count: matrix.get(row.id)?.get(col.id) ?? 0,
        })),
      }));

      summaries.push({
        kind: "grid",
        questionId: q.id,
        label: q.label,
        type: q.type,
        isCheckbox: q.type === "CHECKBOX_GRID",
        totalAnswers: answered,
        rows,
      });
    } else if (SCALE_TYPES.has(q.type)) {
      const nums = nonEmpty
        .map((v) => parseFloat(v))
        .filter((n) => !isNaN(n));
      const countMap = new Map<number, number>();
      let sum = 0;
      for (const n of nums) {
        countMap.set(n, (countMap.get(n) ?? 0) + 1);
        sum += n;
      }
      const distribution = [...countMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([value, count]) => ({ value, count }));

      summaries.push({
        kind: "scale",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: nums.length,
        min: nums.length ? Math.min(...nums) : 0,
        max: nums.length ? Math.max(...nums) : 0,
        avg:
          nums.length
            ? Math.round((sum / nums.length) * 10) / 10
            : 0,
        distribution,
      });
    } else if (FILE_TYPES.has(q.type)) {
      summaries.push({
        kind: "file",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: nonEmpty.length,
        urls: nonEmpty.slice(0, 20),
      });
    }
    // Unknown types are silently skipped.
  }

  return summaries;
}

/**
 * Build the answersByQuestion map from a raw ResponseEntry array.
 * Accepts any object that has an `answers` array where each answer
 * exposes a `questionId` and `value` (the Prisma response always
 * includes these fields even when not typed in the client interface).
 */
export function buildAnswerMap(
  responses: Array<{
    answers: Array<Record<string, unknown>>;
  }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const response of responses) {
    for (const answer of response.answers) {
      // `questionId` is always present in the Prisma API response
      const qid =
        (answer.questionId as string | undefined) ??
        ((answer.question as Record<string, unknown> | undefined)
          ?.id as string | undefined);
      if (!qid) continue;
      const value = String(answer.value ?? "");
      if (!map.has(qid)) map.set(qid, []);
      map.get(qid)!.push(value);
    }
  }
  return map;
}

// ─── Server-side grouped-count aggregation ───────────────────────────────────

/**
 * Build QuestionSummary objects from pre-grouped answer counts
 * (as returned by `prisma.answer.groupBy`).  This avoids sending
 * millions of raw rows to the client.
 *
 * For TEXT / FILE types, the caller passes `samplesByQuestion` — a
 * Map<questionId, string[]> with up to N recent values.
 *
 * For CHOICE / SCALE / GRID types the full picture comes from groupBy
 * counts so no raw values are needed.
 *
 * @param grouped          `{ questionId, value, _count }[]` from groupBy
 * @param questions        Ordered question records
 * @param samplesByQuestion  Map of question ID → sample values (text/file)
 */
export function buildSummaryFromGrouped(
  grouped: GroupedCount[],
  questions: QuestionRecord[],
  samplesByQuestion: Map<string, string[]> = new Map()
): QuestionSummary[] {
  // Index grouped counts by questionId
  const byQuestion = new Map<string, GroupedCount[]>();
  for (const g of grouped) {
    if (!byQuestion.has(g.questionId)) byQuestion.set(g.questionId, []);
    byQuestion.get(g.questionId)!.push(g);
  }

  const summaries: QuestionSummary[] = [];

  for (const q of questions) {
    const config = parseConfig(q.config);
    if (config.isPhoneNumber || config.isTitle || config.isMedia) continue;

    const rows = byQuestion.get(q.id) ?? [];
    // Filter out empty-string values from counts
    const nonEmptyRows = rows.filter((r) => r.value.trim() !== "");
    const totalCount = nonEmptyRows.reduce((s, r) => s + r._count, 0);

    if (TEXT_TYPES.has(q.type)) {
      const unique = new Set(nonEmptyRows.map((r) => r.value.toLowerCase()));
      const samples = samplesByQuestion.get(q.id) ?? [];
      summaries.push({
        kind: "text",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: totalCount,
        uniqueCount: unique.size,
        recentEntries: samples.filter((v) => v.trim() !== "").slice(0, 10),
      });
    } else if (CHOICE_TYPES.has(q.type)) {
      // For CHECKBOX the value is a JSON array — the groupBy gives us
      // exact stored values.  We need to expand them.
      const counts = new Map<string, number>();

      for (const row of nonEmptyRows) {
        if (q.type === "CHECKBOX") {
          let arr: unknown;
          try {
            arr = JSON.parse(row.value);
          } catch {
            counts.set(row.value, (counts.get(row.value) ?? 0) + row._count);
            continue;
          }
          if (Array.isArray(arr)) {
            for (const item of arr as string[]) {
              const key = String(item);
              counts.set(key, (counts.get(key) ?? 0) + row._count);
            }
          }
        } else {
          counts.set(row.value, (counts.get(row.value) ?? 0) + row._count);
        }
      }

      const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
      const distribution: DistributionItem[] = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([label, count]) => ({
          label,
          count,
          percent: Math.round((count / total) * 100),
        }));

      summaries.push({
        kind: "choice",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: totalCount,
        distribution,
      });
    } else if (GRID_TYPES.has(q.type)) {
      const grid = config.grid as
        | { rows: GridItem[]; columns: GridItem[] }
        | undefined;

      if (!grid || !Array.isArray(grid.rows) || !Array.isArray(grid.columns)) {
        summaries.push({
          kind: "grid",
          questionId: q.id,
          label: q.label,
          type: q.type,
          isCheckbox: q.type === "CHECKBOX_GRID",
          totalAnswers: 0,
          rows: [],
        });
        continue;
      }

      const matrix = new Map<string, Map<string, number>>();
      for (const row of grid.rows) {
        const colMap = new Map<string, number>();
        for (const col of grid.columns) colMap.set(col.id, 0);
        matrix.set(row.id, colMap);
      }

      let answered = 0;
      for (const row of nonEmptyRows) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(row.value);
        } catch {
          continue;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          continue;
        answered += row._count;
        for (const [rowId, colVal] of Object.entries(
          parsed as Record<string, unknown>
        )) {
          const colMap = matrix.get(rowId);
          if (!colMap) continue;
          const colIds: string[] = Array.isArray(colVal)
            ? (colVal as string[])
            : [String(colVal)];
          for (const colId of colIds) {
            colMap.set(colId, (colMap.get(colId) ?? 0) + row._count);
          }
        }
      }

      const gridRows: GridRowSummary[] = grid.rows.map((row) => ({
        id: row.id,
        label: row.value,
        columns: grid.columns.map((col) => ({
          id: col.id,
          label: col.value,
          count: matrix.get(row.id)?.get(col.id) ?? 0,
        })),
      }));

      summaries.push({
        kind: "grid",
        questionId: q.id,
        label: q.label,
        type: q.type,
        isCheckbox: q.type === "CHECKBOX_GRID",
        totalAnswers: answered,
        rows: gridRows,
      });
    } else if (SCALE_TYPES.has(q.type)) {
      const countMap = new Map<number, number>();
      let sum = 0;
      let numTotal = 0;
      for (const row of nonEmptyRows) {
        const n = parseFloat(row.value);
        if (isNaN(n)) continue;
        countMap.set(n, (countMap.get(n) ?? 0) + row._count);
        sum += n * row._count;
        numTotal += row._count;
      }
      const distribution = [...countMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([value, count]) => ({ value, count }));
      const allNums = [...countMap.keys()];

      summaries.push({
        kind: "scale",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: numTotal,
        min: allNums.length ? Math.min(...allNums) : 0,
        max: allNums.length ? Math.max(...allNums) : 0,
        avg: numTotal ? Math.round((sum / numTotal) * 10) / 10 : 0,
        distribution,
      });
    } else if (FILE_TYPES.has(q.type)) {
      const samples = samplesByQuestion.get(q.id) ?? [];
      summaries.push({
        kind: "file",
        questionId: q.id,
        label: q.label,
        type: q.type,
        totalAnswers: totalCount,
        urls: samples.filter((v) => v.trim() !== "").slice(0, 20),
      });
    }
  }

  return summaries;
}

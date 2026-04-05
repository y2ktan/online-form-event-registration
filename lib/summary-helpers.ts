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

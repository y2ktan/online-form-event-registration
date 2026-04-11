/**
 * Pure CSV generation helpers.
 *
 * escapeCsvField — O(n) where n = field length.
 * responsesToCsv — O(R * Q) where R = responses, Q = questions.
 */

/** Escape a single CSV field (RFC 4180). */
export function escapeCsvField(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface CsvResponse {
  shortCode: string;
  phoneNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  answers: { questionId: string; value: string }[];
  isNewUser?: boolean;
}

export interface CsvQuestion {
  id: string;
  label: string;
  type: string;
  config?: Record<string, unknown> | string;
}

/**
 * Convert responses + questions into a CSV string.
 *
 * Columns: Submission ID, Phone, Submitted At, Updated At, [question labels...]
 * Time:  O(R * Q) — one pass per response to build each row.
 * Space: O(R * Q) — the output string.
 */
export function responsesToCsv(
  responses: CsvResponse[],
  questions: CsvQuestion[],
  includePhone: boolean,
  baseUrl?: string,
  includeNewUser?: boolean,
): string {
  const headers: string[] = ["Submission ID"];
  if (includePhone) headers.push("Phone");
  headers.push("Submitted At", "Updated At");
  for (const q of questions) headers.push(q.type === "SELFIE" ? "Profile Photo" : (q.label || "Untitled"));
  if (includeNewUser) headers.push("Is New User");

  const rows: string[] = [headers.map(escapeCsvField).join(",")];

  for (const resp of responses) {
    const answerMap = new Map<string, string>();
    for (const a of resp.answers) answerMap.set(a.questionId, a.value);

    const cols: string[] = [resp.shortCode];
    if (includePhone) cols.push(resp.phoneNumber || "");
    cols.push(resp.createdAt, resp.updatedAt);

    for (const q of questions) {
      const raw = answerMap.get(q.id) || "";
      cols.push(formatAnswerForCsv(raw, q.type, baseUrl, q.config));
    }
    if (includeNewUser) cols.push(resp.isNewUser ? "Yes" : "No");

    rows.push(cols.map(escapeCsvField).join(","));
  }

  // UTF-8 BOM so Excel detects encoding for non-ASCII characters
  return "\uFEFF" + rows.join("\n");
}

/** Format a stored answer value for human-readable CSV output. */
function formatAnswerForCsv(value: string, questionType: string, baseUrl?: string, config?: Record<string, unknown> | string): string {
  if (!value) return "";
  if (questionType === "SELFIE" && value.startsWith("/")) {
    return baseUrl ? `${baseUrl}${value}` : value;
  }
  if (questionType === "CHECKBOX") {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr.join("; ") : value;
    } catch {
      return value;
    }
  }
  if (questionType === "MULTIPLE_CHOICE_GRID" || questionType === "CHECKBOX_GRID") {
    try {
      const obj = JSON.parse(value);
      if (typeof obj === "object" && obj !== null) {
        const cfg = typeof config === "string" ? JSON.parse(config) : config;
        const rows: { id: string; value: string }[] = cfg?.grid?.rows || [];
        const cols: { id: string; value: string }[] = cfg?.grid?.columns || [];
        const rowMap = new Map(rows.map((r) => [r.id, r.value]));
        const colMap = new Map(cols.map((c) => [c.id, c.value]));
        return Object.entries(obj)
          .map(([rowId, val]) => {
            const rowLabel = rowMap.get(rowId) || rowId;
            if (Array.isArray(val)) {
              return `${rowLabel}: ${val.map((v) => colMap.get(v as string) || v).join(", ")}`;
            }
            return `${rowLabel}: ${colMap.get(val as string) || val}`;
          })
          .join("; ");
      }
    } catch {
      return value;
    }
  }
  return value;
}

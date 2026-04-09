/**
 * XLSX export with visual bar charts using ExcelJS.
 *
 * Sheet 1: "Raw Responses"   — same columns as CSV, styled headers, frozen row
 * Sheet 2: "Data Analytics"  — per-question summary tables with bar charts
 * Sheet 3: "User Profile"    — registered user analytics with summary chart
 *
 * Dependencies: exceljs (for styled workbook generation).
 */

import * as ExcelJS from "exceljs";
import { QUESTION_TYPE_LABELS } from "@/lib/question-types";
import type {
  SectionSummary,
  QuestionSummary,
  ChoiceSummary,
  ScaleSummary,
  GridSummary,
  TextSummary,
  FileSummary,
} from "@/lib/summary-helpers";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface XlsxResponse {
  shortCode: string;
  phoneNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  answers: { questionId: string; value: string }[];
  isNewUser?: boolean;
}

export interface XlsxQuestion {
  id: string;
  label: string;
  type: string;
  config?: Record<string, unknown> | string;
}

export interface UserProfileStats {
  userProfileCount: number;
  respondedRegistered: number;
  notYetRegistered: number;
  newUsers: number;
  totalResponses: number;
}

export interface RegisteredRow {
  [column: string]: string;
}

export interface UserProfileData {
  stats: UserProfileStats;
  headers: string[];
  rows: RegisteredRow[];
  lookupColumn: string;
  respondedValues: Set<string>;
}

// ─── Colour palette (6-char hex, no alpha) ───────────────────────────────────

const P = {
  deepBlue: "1F4E79",
  white: "FFFFFF",
  darkGray: "374151",
  indigo50: "EEF2FF",
  indigo100: "E0E7FF",
  indigo200: "C7D2FE",
  indigo600: "4F46E5",
  indigo800: "3730A3",
  gray100: "F3F4F6",
  gray300: "D1D5DB",
  gray900: "111827",
  green50: "F0FDF4",
  green100: "DCFCE7",
  green700: "15803D",
  red100: "FEE2E2",
  red700: "B91C1C",
  amber100: "FEF9C3",
  amber700: "A16207",
  purple50: "F5F3FF",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BAR_CHAR = "\u2588"; // █

/** Create a visual bar string proportional to `percent` (0-100). */
export function makeBar(percent: number, maxBlocks = 20): string {
  const n = Math.round((Math.max(0, Math.min(100, percent)) / 100) * maxBlocks);
  return BAR_CHAR.repeat(n);
}

function solidFill(hex: string): ExcelJS.Fill {
  return {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF" + hex },
  } as ExcelJS.Fill;
}

const THIN_BORDER = {
  bottom: { style: "thin" as const, color: { argb: "FF" + P.gray300 } },
};

function parseConfig(cfg: unknown): Record<string, unknown> {
  if (!cfg) return {};
  if (typeof cfg === "string") {
    try { return JSON.parse(cfg); } catch { return {}; }
  }
  if (typeof cfg === "object") return cfg as Record<string, unknown>;
  return {};
}

/** Format a raw answer value for human-readable output. */
export function formatAnswerForXlsx(
  value: string,
  questionType: string,
  baseUrl?: string,
  config?: Record<string, unknown> | string,
): string {
  if (!value) return "";
  if (questionType === "SELFIE" && value.startsWith("/")) {
    return baseUrl ? `${baseUrl}${value}` : value;
  }
  if (questionType === "CHECKBOX") {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr.join("; ") : value;
    } catch { return value; }
  }
  if (questionType === "MULTIPLE_CHOICE_GRID" || questionType === "CHECKBOX_GRID") {
    try {
      const obj = JSON.parse(value);
      if (typeof obj === "object" && obj !== null) {
        const cfg = parseConfig(config);
        const rows: { id: string; value: string }[] =
          (cfg?.grid as { rows?: { id: string; value: string }[] })?.rows || [];
        const cols: { id: string; value: string }[] =
          (cfg?.grid as { columns?: { id: string; value: string }[] })?.columns || [];
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
    } catch { return value; }
  }
  return value;
}

function typeLabel(type: string): string {
  return (QUESTION_TYPE_LABELS as Record<string, string>)[type] || type;
}

// ─── Style helpers ───────────────────────────────────────────────────────────

function styleTitleRow(ws: ExcelJS.Worksheet, row: ExcelJS.Row, cols: number): void {
  ws.mergeCells(row.number, 1, row.number, Math.max(cols, 1));
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 14, color: { argb: "FF" + P.white } };
  cell.fill = solidFill(P.deepBlue);
  cell.alignment = { vertical: "middle" };
  row.height = 30;
}

function styleSectionRow(ws: ExcelJS.Worksheet, row: ExcelJS.Row, cols: number): void {
  ws.mergeCells(row.number, 1, row.number, Math.max(cols, 1));
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 12, color: { argb: "FF" + P.white } };
  cell.fill = solidFill(P.darkGray);
  cell.alignment = { vertical: "middle" };
  row.height = 24;
}

function styleQuestionRow(ws: ExcelJS.Worksheet, row: ExcelJS.Row, cols: number): void {
  ws.mergeCells(row.number, 1, row.number, Math.max(cols, 1));
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 11, color: { argb: "FF" + P.indigo800 } };
  cell.fill = solidFill(P.indigo50);
  row.height = 22;
}

function styleTableHeader(row: ExcelJS.Row, count: number): void {
  for (let i = 1; i <= count; i++) {
    const c = row.getCell(i);
    c.font = { bold: true, size: 10, color: { argb: "FF" + P.gray900 } };
    c.fill = solidFill(P.gray100);
    c.border = THIN_BORDER as ExcelJS.Borders;
  }
}

function setBarStyle(cell: ExcelJS.Cell, colorHex: string = P.indigo600): void {
  cell.font = { size: 10, color: { argb: "FF" + colorHex } };
}

// ─── Sheet 1: Raw Responses ─────────────────────────────────────────────────

export function buildResponsesSheet(
  wb: ExcelJS.Workbook,
  responses: XlsxResponse[],
  questions: XlsxQuestion[],
  includePhone: boolean,
  baseUrl?: string,
  includeNewUser?: boolean,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("Raw Responses");

  // Header row
  const headers: string[] = ["Submission ID"];
  if (includePhone) headers.push("Phone");
  headers.push("Submitted At", "Updated At");
  for (const q of questions) {
    headers.push(q.type === "SELFIE" ? "Profile Photo" : (q.label || "Untitled"));
  }
  if (includeNewUser) headers.push("Is New User");

  const headerRow = ws.addRow(headers);
  styleTableHeader(headerRow, headers.length);
  ws.views = [{ state: "frozen" as const, ySplit: 1, xSplit: 0 }];

  // Data rows
  for (const resp of responses) {
    const answerMap = new Map<string, string>();
    for (const a of resp.answers) answerMap.set(a.questionId, a.value);

    const vals: string[] = [resp.shortCode];
    if (includePhone) vals.push(resp.phoneNumber || "");
    vals.push(resp.createdAt, resp.updatedAt);
    for (const q of questions) {
      vals.push(formatAnswerForXlsx(answerMap.get(q.id) || "", q.type, baseUrl, q.config));
    }
    if (includeNewUser) vals.push(resp.isNewUser ? "Yes" : "No");

    const dataRow = ws.addRow(vals);

    // Colour the "Is New User" cell
    if (includeNewUser) {
      const statusCell = dataRow.getCell(vals.length);
      if (resp.isNewUser) {
        statusCell.font = { bold: true, color: { argb: "FF" + P.amber700 } };
        statusCell.fill = solidFill(P.amber100);
      } else {
        statusCell.font = { color: { argb: "FF" + P.green700 } };
        statusCell.fill = solidFill(P.green100);
      }
    }
  }

  // Column widths
  let colIdx = 1;
  ws.getColumn(colIdx++).width = 15;
  if (includePhone) ws.getColumn(colIdx++).width = 15;
  ws.getColumn(colIdx++).width = 22;
  ws.getColumn(colIdx++).width = 22;
  for (let i = 0; i < questions.length; i++) ws.getColumn(colIdx++).width = 22;
  if (includeNewUser) ws.getColumn(colIdx).width = 13;

  return ws;
}

// ─── Sheet 2: Data Analytics ─────────────────────────────────────────────────

const A_COLS = 4; // Label · Count/Value · % · Chart

export function buildAnalyticsSheet(
  wb: ExcelJS.Workbook,
  sections: SectionSummary[],
  totalResponses: number,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("Data Analytics");

  // Title
  const titleRow = ws.addRow(["DATA ANALYTICS SUMMARY"]);
  styleTitleRow(ws, titleRow, A_COLS);

  const totalRow = ws.addRow(["Total Responses", totalResponses]);
  totalRow.getCell(1).font = { bold: true, size: 11 };
  totalRow.getCell(2).font = { bold: true, size: 11, color: { argb: "FF" + P.indigo600 } };
  ws.addRow([]);

  for (const section of sections) {
    const secRow = ws.addRow([`Section: ${section.title}`]);
    styleSectionRow(ws, secRow, A_COLS);
    ws.addRow([]);

    for (const q of section.questions) {
      appendQuestionSummary(ws, q);
      ws.addRow([]);
    }
  }

  // Column widths
  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 28;

  return ws;
}

function appendQuestionSummary(ws: ExcelJS.Worksheet, q: QuestionSummary): void {
  switch (q.kind) {
    case "choice": appendChoiceSummary(ws, q); break;
    case "scale":  appendScaleSummary(ws, q);  break;
    case "grid":   appendGridSummary(ws, q);   break;
    case "text":   appendTextSummary(ws, q);   break;
    case "file":   appendFileSummary(ws, q);   break;
  }
}

function appendChoiceSummary(ws: ExcelJS.Worksheet, q: ChoiceSummary): void {
  const qRow = ws.addRow([`${q.label} (${typeLabel(q.type)}) — ${q.totalAnswers} responses`]);
  styleQuestionRow(ws, qRow, A_COLS);

  const hRow = ws.addRow(["Option", "Count", "%", "Chart"]);
  styleTableHeader(hRow, A_COLS);

  for (const d of q.distribution) {
    const row = ws.addRow([d.label, d.count, `${d.percent}%`, makeBar(d.percent)]);
    setBarStyle(row.getCell(4));
    row.getCell(2).alignment = { horizontal: "right" };
  }
}

function appendScaleSummary(ws: ExcelJS.Worksheet, q: ScaleSummary): void {
  const qRow = ws.addRow([`${q.label} (${typeLabel(q.type)}) — ${q.totalAnswers} responses`]);
  styleQuestionRow(ws, qRow, A_COLS);

  const statsHdr = ws.addRow(["Statistic", "Value"]);
  styleTableHeader(statsHdr, 2);
  ws.addRow(["Min", q.min]);
  ws.addRow(["Max", q.max]);
  ws.addRow(["Average", q.avg]);
  ws.addRow([]);

  const maxCount = Math.max(...q.distribution.map((d) => d.count), 1);
  const distHdr = ws.addRow(["Value", "Count", "", "Chart"]);
  styleTableHeader(distHdr, A_COLS);

  for (const d of q.distribution) {
    const pct = (d.count / maxCount) * 100;
    const row = ws.addRow([d.value, d.count, "", makeBar(pct)]);
    setBarStyle(row.getCell(4));
    row.getCell(2).alignment = { horizontal: "right" };
  }
}

function appendGridSummary(ws: ExcelJS.Worksheet, q: GridSummary): void {
  const colCount = (q.rows[0]?.columns.length ?? 0) + 1;
  const qRow = ws.addRow([`${q.label} (${typeLabel(q.type)}) — ${q.totalAnswers} responses`]);
  styleQuestionRow(ws, qRow, Math.max(colCount, A_COLS));

  if (q.rows.length === 0) return;

  const colLabels = q.rows[0].columns.map((c) => c.label);
  const hRow = ws.addRow(["", ...colLabels]);
  styleTableHeader(hRow, colLabels.length + 1);

  let maxCount = 0;
  for (const r of q.rows)
    for (const c of r.columns) if (c.count > maxCount) maxCount = c.count;

  for (const r of q.rows) {
    const row = ws.addRow([r.label, ...r.columns.map((c) => c.count)]);
    row.getCell(1).font = { bold: true };
    for (let i = 0; i < r.columns.length; i++) {
      const count = r.columns[i].count;
      const cell = row.getCell(i + 2);
      cell.alignment = { horizontal: "center" };
      if (count > 0 && maxCount > 0) {
        const ratio = count / maxCount;
        let bg = P.purple50;
        if (ratio > 0.75) bg = P.indigo200;
        else if (ratio > 0.5) bg = P.indigo100;
        else if (ratio > 0.25) bg = P.indigo50;
        cell.fill = solidFill(bg);
      }
    }
  }
}

function appendTextSummary(ws: ExcelJS.Worksheet, q: TextSummary): void {
  const qRow = ws.addRow([`${q.label} (${typeLabel(q.type)}) — ${q.totalAnswers} responses`]);
  styleQuestionRow(ws, qRow, A_COLS);

  ws.addRow(["Unique answers", q.uniqueCount]);
  if (q.recentEntries.length > 0) {
    const lbl = ws.addRow(["Recent entries:"]);
    lbl.getCell(1).font = { italic: true, size: 10 };
    for (const entry of q.recentEntries) {
      ws.addRow([`  ${entry}`]);
    }
  }
}

function appendFileSummary(ws: ExcelJS.Worksheet, q: FileSummary): void {
  const qRow = ws.addRow([`${q.label} (${typeLabel(q.type)}) — ${q.totalAnswers} files`]);
  styleQuestionRow(ws, qRow, A_COLS);

  if (q.urls.length > 0) {
    const lbl = ws.addRow(["Recent files:"]);
    lbl.getCell(1).font = { italic: true, size: 10 };
    for (const url of q.urls) {
      ws.addRow([`  ${url}`]);
    }
  }
}

// ─── Sheet 3: User Profile ──────────────────────────────────────────────────

export function buildUserProfileSheet(
  wb: ExcelJS.Workbook,
  profile: UserProfileData,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("User Profile");
  const COLS = 4;

  // Title
  const titleRow = ws.addRow(["USER PROFILE ANALYTICS"]);
  styleTitleRow(ws, titleRow, COLS);
  ws.addRow([]);

  // ── Summary chart ──
  const sumHdr = ws.addRow(["SUMMARY"]);
  styleSectionRow(ws, sumHdr, COLS);

  const hRow = ws.addRow(["Metric", "Count", "%", "Chart"]);
  styleTableHeader(hRow, COLS);

  const { stats } = profile;
  const maxVal = Math.max(stats.userProfileCount, stats.totalResponses, 1);

  // Total Registered
  const regRow = ws.addRow(["Total Registered Users", stats.userProfileCount]);
  regRow.getCell(1).font = { bold: true };

  // Total Responses
  const trRow = ws.addRow(["Total Responses", stats.totalResponses]);
  trRow.getCell(1).font = { bold: true };

  // Responded (Registered)
  const respPct = stats.userProfileCount > 0
    ? Math.round((stats.respondedRegistered / stats.userProfileCount) * 100) : 0;
  const respRow = ws.addRow([
    "Responded (Registered)", stats.respondedRegistered,
    `${respPct}%`, makeBar((stats.respondedRegistered / maxVal) * 100),
  ]);
  respRow.getCell(1).fill = solidFill(P.green100);
  respRow.getCell(1).font = { bold: true, color: { argb: "FF" + P.green700 } };
  setBarStyle(respRow.getCell(4), P.green700);

  // Not Yet Responded
  const notPct = stats.userProfileCount > 0
    ? Math.round((stats.notYetRegistered / stats.userProfileCount) * 100) : 0;
  const notRow = ws.addRow([
    "Not Yet Responded", stats.notYetRegistered,
    `${notPct}%`, makeBar((stats.notYetRegistered / maxVal) * 100),
  ]);
  notRow.getCell(1).fill = solidFill(P.red100);
  notRow.getCell(1).font = { bold: true, color: { argb: "FF" + P.red700 } };
  setBarStyle(notRow.getCell(4), P.red700);

  // New Users (Unregistered)
  const newPct = stats.totalResponses > 0
    ? Math.round((stats.newUsers / stats.totalResponses) * 100) : 0;
  const nuRow = ws.addRow([
    "New Users (Unregistered)", stats.newUsers,
    `${newPct}%`, makeBar((stats.newUsers / maxVal) * 100),
  ]);
  nuRow.getCell(1).fill = solidFill(P.amber100);
  nuRow.getCell(1).font = { bold: true, color: { argb: "FF" + P.amber700 } };
  setBarStyle(nuRow.getCell(4), P.amber700);

  ws.addRow([]);

  // ── Detailed table ──
  if (profile.headers.length > 0 && profile.rows.length > 0) {
    const detailCols = profile.headers.length + 1;
    const dtRow = ws.addRow(["REGISTERED USERS DETAIL"]);
    styleSectionRow(ws, dtRow, detailCols);

    const detailHeaders = [...profile.headers, "Response Status"];
    const dhRow = ws.addRow(detailHeaders);
    styleTableHeader(dhRow, detailHeaders.length);

    for (const row of profile.rows) {
      const vals = profile.headers.map((h) => row[h] || "");
      const lookupVal = String(row[profile.lookupColumn] ?? "").trim().toLowerCase();
      const responded = !!(lookupVal && profile.respondedValues.has(lookupVal));
      vals.push(responded ? "✓ Responded" : "✗ Not Responded");

      const dataRow = ws.addRow(vals);
      const statusCell = dataRow.getCell(vals.length);
      if (responded) {
        statusCell.font = { bold: true, color: { argb: "FF" + P.green700 } };
        statusCell.fill = solidFill(P.green50);
      } else {
        statusCell.font = { bold: true, color: { argb: "FF" + P.red700 } };
        statusCell.fill = solidFill(P.red100);
      }
    }
  }

  // Column widths
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 28;
  for (let i = 5; i <= profile.headers.length + 1; i++) {
    ws.getColumn(i).width = 18;
  }

  return ws;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export interface XlsxExportInput {
  responses: XlsxResponse[];
  questions: XlsxQuestion[];
  includePhone: boolean;
  baseUrl?: string;
  includeNewUser: boolean;
  sections: SectionSummary[];
  totalResponses: number;
  userProfile?: UserProfileData;
}

/**
 * Generate a complete XLSX workbook buffer with styled charts.
 * Returns a Node.js Buffer ready to be sent as an HTTP response.
 */
export async function generateXlsxBuffer(input: XlsxExportInput): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AI Registration";
  wb.created = new Date();

  buildResponsesSheet(
    wb, input.responses, input.questions,
    input.includePhone, input.baseUrl, input.includeNewUser,
  );

  buildAnalyticsSheet(wb, input.sections, input.totalResponses);

  if (input.userProfile) {
    buildUserProfileSheet(wb, input.userProfile);
  }

  const buf = await wb.xlsx.writeBuffer();
  // Return a plain ArrayBuffer for TS 5.9 compatibility
  return (buf as unknown as Uint8Array).buffer.slice(0) as ArrayBuffer;
}

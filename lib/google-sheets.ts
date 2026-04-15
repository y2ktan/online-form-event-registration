/**
 * Google Sheets API helpers.
 *
 * getGoogleSheetsClient  — authenticated Sheets v4 client from stored credential
 * getGoogleCredential    — fetch + decrypt global credential
 * buildHeaderRow         — column header builder matching CSV export format
 * syncFormToSheet        — full overwrite: clear + write header + chunked data
 * testSheetAccess        — read-only validation (spreadsheets.get metadata)
 * markFormDirty          — set pendingSyncAt + increment syncVersion
 */

import { prisma } from "@/lib/prisma";
import { google, sheets_v4 } from "googleapis";
import { decryptKey } from "@/lib/google-sheets-crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 300; // rows per Sheets write batch
const MAX_CELLS = 5_000_000; // Google Sheets cell limit (leave buffer from 10M)
const CIRCUIT_BREAKER_THRESHOLD = 5;

// ─── Credential Management ──────────────────────────────────────────────────

export interface GoogleCredentialConfig {
  id: string;
  enabled: boolean;
  serviceAccountEmail: string;
  serviceAccountKey: string; // encrypted
}

/** Fetch the global Google Sheets credential. Returns null if not configured. */
export async function getGoogleCredential(): Promise<GoogleCredentialConfig | null> {
  try {
    const cred = await prisma.googleSheetsCredential.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!cred || !cred.enabled || !cred.serviceAccountKey) return null;
    return cred as GoogleCredentialConfig;
  } catch {
    return null;
  }
}

/** Build a Sheets v4 client from a service account email + private key. */
function buildSheetsClient(clientEmail: string, privateKey: string): sheets_v4.Sheets {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Create an authenticated Google Sheets v4 client from the stored credential. */
export async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets | null> {
  const cred = await getGoogleCredential();
  if (!cred) return null;

  try {
    const keyJson = JSON.parse(decryptKey(cred.serviceAccountKey));
    return buildSheetsClient(keyJson.client_email, keyJson.private_key);
  } catch (err) {
    console.error("[GoogleSheets] Failed to create client:", err);
    return null;
  }
}

/** Create a Sheets client from a raw (unencrypted) JSON key string — for test validation. */
export function getSheetsClientFromKey(keyJsonStr: string): sheets_v4.Sheets {
  const keyJson = JSON.parse(keyJsonStr);
  return buildSheetsClient(keyJson.client_email, keyJson.private_key);
}

// ─── Read-only Test ─────────────────────────────────────────────────────────

/** Test access to a spreadsheet (read-only metadata check). */
export async function testSheetAccess(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties.title",
    });
    return { success: true, title: res.data.properties?.title || "" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: msg };
  }
}

// ─── Data Building ──────────────────────────────────────────────────────────

interface QuestionMeta {
  id: string;
  label: string;
  type: string;
  config: string;
}

/** Build header row matching CSV export format. */
export function buildHeaderRow(
  questions: QuestionMeta[],
  collectPhone: boolean,
): string[] {
  const headers = ["Submission ID"];
  if (collectPhone) headers.push("Phone");
  headers.push("Submitted At", "Updated At");
  for (const q of questions) {
    headers.push(q.type === "SELFIE" ? "Profile Photo" : (q.label || "Untitled"));
  }
  return headers;
}

/** Format an answer value for the sheet (matches CSV export logic). */
function formatAnswer(value: string, questionType: string, config?: string): string {
  if (!value) return "";
  if (questionType === "SELFIE" && value.startsWith("/")) return value;
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
        const cfg = config ? JSON.parse(config) : {};
        const rows: { id: string; value: string }[] = cfg?.grid?.rows || [];
        const cols: { id: string; value: string }[] = cfg?.grid?.columns || [];
        const rowMap = new Map(rows.map((r: { id: string; value: string }) => [r.id, r.value]));
        const colMap = new Map(cols.map((c: { id: string; value: string }) => [c.id, c.value]));
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

/** Fetch form questions (ordered, excluding phone-number questions). */
async function getFormQuestions(formId: string) {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      collectPhone: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          questions: {
            orderBy: { order: "asc" },
            select: { id: true, label: true, type: true, config: true },
          },
        },
      },
    },
  });
  if (!form) return null;

  const questions: QuestionMeta[] = form.sections.flatMap((s) =>
    s.questions.filter((q) => {
      try {
        const cfg = JSON.parse(q.config);
        return !cfg?.isPhoneNumber;
      } catch { return true; }
    }),
  );

  return { questions, collectPhone: form.collectPhone };
}

// ─── Sync Engine ────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  rowCount: number;
  apiCalls: number;
  durationMs: number;
  error?: string;
}

/** Full overwrite sync: clear sheet, write header + all response data in chunks. */
export async function syncFormToSheet(
  formId: string,
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<SyncResult> {
  const start = Date.now();
  let apiCalls = 0;

  try {
    const formData = await getFormQuestions(formId);
    if (!formData) return { success: false, rowCount: 0, apiCalls, durationMs: Date.now() - start, error: "Form not found" };

    const { questions, collectPhone } = formData;
    const headers = buildHeaderRow(questions, collectPhone);
    const colCount = headers.length;

    // Count total responses for budget check
    const totalResponses = await prisma.response.count({ where: { formId } });
    const estimatedCells = (totalResponses + 1) * colCount;
    if (estimatedCells > MAX_CELLS) {
      return {
        success: false,
        rowCount: 0,
        apiCalls,
        durationMs: Date.now() - start,
        error: `Too many cells (${estimatedCells.toLocaleString()}). Limit is ${MAX_CELLS.toLocaleString()}. Reduce responses or columns.`,
      };
    }

    // Clear sheet
    const range = `'${sheetName}'`;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });
    apiCalls++;

    // Write header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    apiCalls++;

    // Write data in chunks
    let cursor: string | undefined;
    let rowOffset = 2; // row 1 is header (1-indexed in Sheets)
    let totalRows = 0;

    while (true) {
      const responses = await prisma.response.findMany({
        where: { formId },
        include: { answers: { select: { questionId: true, value: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: CHUNK_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (responses.length === 0) break;

      const rows: string[][] = responses.map((r) => {
        const answerMap = new Map<string, string>();
        for (const a of r.answers) answerMap.set(a.questionId, a.value);

        const row: string[] = [r.shortCode];
        if (collectPhone) row.push(r.phoneNumber || "");
        row.push(r.createdAt.toISOString(), r.updatedAt.toISOString());
        for (const q of questions) {
          row.push(formatAnswer(answerMap.get(q.id) || "", q.type, q.config));
        }
        return row;
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A${rowOffset}`,
        valueInputOption: "RAW",
        requestBody: { values: rows },
      });
      apiCalls++;

      totalRows += rows.length;
      rowOffset += rows.length;
      cursor = responses[responses.length - 1].id;

      if (responses.length < CHUNK_SIZE) break;
    }

    return { success: true, rowCount: totalRows, apiCalls, durationMs: Date.now() - start };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[GoogleSheets] syncFormToSheet error for form ${formId}:`, msg);
    return { success: false, rowCount: 0, apiCalls, durationMs: Date.now() - start, error: msg };
  }
}

// ─── Dirty Flag ─────────────────────────────────────────────────────────────

/** Mark a form as needing Google Sheets sync. Constant-time DB update. */
export async function markFormDirty(formId: string): Promise<void> {
  try {
    await prisma.googleSheetsSync.updateMany({
      where: { formId, enabled: true },
      data: {
        pendingSyncAt: new Date(),
        syncVersion: { increment: 1 },
      },
    });
  } catch {
    // Silently ignore — form may not have sync configured
  }
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────

/** Check if a form's sync is circuit-broken (too many failures). */
export function isCircuitBroken(failureCount: number): boolean {
  return failureCount >= CIRCUIT_BREAKER_THRESHOLD;
}

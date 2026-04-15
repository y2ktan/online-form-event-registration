import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getGoogleCredential, getSheetsClientFromKey, testSheetAccess, syncFormToSheet } from "@/lib/google-sheets";
import { decryptKey } from "@/lib/google-sheets-crypto";

async function canEditForm(formId: string, session: { userId: string; role: string }) {
  if (session.role === "ADMIN") return true;
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { authorId: true, collaborators: { select: { userId: true } } },
  });
  if (!form) return false;
  if (form.authorId === session.userId) return true;
  return form.collaborators.some((c: { userId: string }) => c.userId === session.userId);
}

// GET — fetch per-form Google Sheets sync config + status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: formId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`gsheets-form:${ip}`);
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await canEditForm(formId, session);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const sync = await prisma.googleSheetsSync.findUnique({ where: { formId } });
    const cred = await getGoogleCredential();
    const globalEnabled = !!cred?.enabled;

    if (!sync) {
      return NextResponse.json({
        globalEnabled,
        enabled: false,
        spreadsheetId: "",
        sheetName: "Sheet1",
        lastSyncedAt: null,
        pendingSyncAt: null,
        lastError: null,
        failureCount: 0,
        rowsSynced: 0,
      });
    }

    return NextResponse.json({
      globalEnabled,
      enabled: sync.enabled,
      spreadsheetId: sync.spreadsheetId,
      sheetName: sync.sheetName,
      lastSyncedAt: sync.lastSyncedAt,
      pendingSyncAt: sync.pendingSyncAt,
      lastError: sync.lastError,
      failureCount: sync.failureCount,
      rowsSynced: sync.rowsSynced,
      syncVersion: sync.syncVersion,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch config." }, { status: 500 });
  }
}

// POST — save per-form Google Sheets sync configuration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: formId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`gsheets-form:${ip}`, true);
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await canEditForm(formId, session);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const enabled = Boolean(body.enabled);
    const spreadsheetId = (body.spreadsheetId || "").trim();
    const sheetName = (body.sheetName || "Sheet1").trim();

    if (enabled && !spreadsheetId) {
      return NextResponse.json(
        { error: "Spreadsheet ID is required when enabling sync." },
        { status: 400 },
      );
    }

    const sync = await prisma.googleSheetsSync.upsert({
      where: { formId },
      create: {
        formId,
        enabled,
        spreadsheetId,
        sheetName,
        pendingSyncAt: enabled ? new Date() : null,
      },
      update: {
        enabled,
        spreadsheetId,
        sheetName,
        pendingSyncAt: enabled ? new Date() : null,
        failureCount: enabled ? 0 : undefined,
        lastError: enabled ? null : undefined,
      },
    });

    return NextResponse.json({
      enabled: sync.enabled,
      spreadsheetId: sync.spreadsheetId,
      sheetName: sync.sheetName,
      lastSyncedAt: sync.lastSyncedAt,
      pendingSyncAt: sync.pendingSyncAt,
    });
  } catch {
    return NextResponse.json({ error: "Failed to save config." }, { status: 500 });
  }
}

// PUT — actions: test access or trigger manual sync
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: formId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`gsheets-action:${ip}`, true);
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await canEditForm(formId, session);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cred = await getGoogleCredential();
  if (!cred) {
    return NextResponse.json(
      { error: "Google Sheets is not configured globally. Go to Admin → Google Sheets Sync." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action || "test";

  try {
    const keyJson = decryptKey(cred.serviceAccountKey);
    const sheets = getSheetsClientFromKey(keyJson);

    if (action === "test") {
      const spreadsheetId = (body.spreadsheetId || "").trim();
      if (!spreadsheetId) {
        return NextResponse.json({ error: "Spreadsheet ID is required." }, { status: 400 });
      }
      const result = await testSheetAccess(sheets, spreadsheetId);
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Access confirmed: "${result.title}"`,
        });
      }
      return NextResponse.json({ error: `Cannot access spreadsheet: ${result.error}` }, { status: 400 });
    }

    if (action === "sync") {
      const sync = await prisma.googleSheetsSync.findUnique({ where: { formId } });
      if (!sync || !sync.enabled) {
        return NextResponse.json({ error: "Sync is not enabled for this form." }, { status: 400 });
      }
      const result = await syncFormToSheet(formId, sheets, sync.spreadsheetId, sync.sheetName);
      if (result.success) {
        await prisma.googleSheetsSync.update({
          where: { formId },
          data: {
            lastSyncedAt: new Date(),
            lastError: null,
            failureCount: 0,
            rowsSynced: result.rowCount,
          },
        });
        return NextResponse.json({
          success: true,
          message: `Synced ${result.rowCount} rows in ${result.durationMs}ms.`,
          rowCount: result.rowCount,
        });
      }
      return NextResponse.json({ error: `Sync failed: ${result.error}` }, { status: 500 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import * as XLSX from "xlsx";
import { ensureRegisteredUserDataTable } from "./_ensure-table";

// GET — fetch current registered user data config for a form
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`reg-user-data:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await canEditForm(session.userId, session.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await ensureRegisteredUserDataTable();
    console.log(`[API] Fetching registered user data for form: ${id}`);
    const data = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
    if (!data) {
      console.log(`[API] No registered user data found for form: ${id}`);
      return NextResponse.json(null);
    }

    const rows: Record<string, string>[] = JSON.parse(data.rows);
    console.log(`[API] Found ${rows.length} rows for form: ${id}`);

    // ── tableView mode: paginated + searchable full-row list ──────────────
    const { searchParams } = new URL(request.url);
    if (searchParams.get("tableView") === "1") {
      const search = (searchParams.get("search") || "").trim().toLowerCase();
      const pageNum = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
      const pageSize = Math.min(
        Math.max(parseInt(searchParams.get("pageSize") || "50", 10), 1),
        200
      );

      const headers: string[] = JSON.parse(data.headers);

      // Filter rows by search across all column values
      const filtered = search
        ? rows.filter((row) =>
            Object.values(row).some((val) =>
              String(val).toLowerCase().includes(search)
            )
          )
        : rows;

      const total = filtered.length;
      const paged = filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize);

      return NextResponse.json({
        headers,
        rows: paged,
        total,
        page: pageNum,
        pageSize,
      });
    }

    // ── Default mode (settings UI) — unchanged ───────────────────────────
    return NextResponse.json({
      id: data.id,
      headers: JSON.parse(data.headers),
      rowCount: rows.length,
      firstRow: rows[0] || null,
      lookupColumn: data.lookupColumn,
      lookupQuestionId: data.lookupQuestionId || "",
      secondaryLookupColumn: data.secondaryLookupColumn || "",
      secondaryLookupQuestionId: data.secondaryLookupQuestionId || "",
      mappings: JSON.parse(data.mappings),
    });
  } catch (err) {
    console.error("GET /api/forms/[id]/registered-user-data error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// POST — upload an XLSX file and parse it
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log(`[API] POST registered-user-data for form: ${id}`);
  
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`reg-user-data:${ip}`);
  if (!allowed) {
    console.warn(`[API] Rate limit exceeded for IP: ${ip}`);
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    console.warn("[API] Unauthorized access attempt (no session)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await canEditForm(session.userId, session.role, id);
  if (!hasAccess) {
    console.warn(`[API] Unauthorized access attempt for user ${session.userId} on form ${id}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Verify form exists
  const form = await prisma.form.findUnique({ where: { id }, select: { id: true } });
  if (!form) {
    console.warn(`[API] Form not found: ${id}`);
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  try {
    await ensureRegisteredUserDataTable();
    console.log("[API] Parsing form data...");
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      console.warn("[API] No file found in request");
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    console.log(`[API] Received file: ${file.name}, size: ${file.size} bytes`);
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("[API] File read into buffer, parsing XLSX...");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      console.warn("[API] XLSX file has no sheets");
      return NextResponse.json({ error: "XLSX file has no sheets." }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    console.log(`[API] Processing sheet: ${sheetName}`);

    // Read as raw 2D array to auto-detect the real header row
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    console.log(`[API] Total raw rows found: ${rawRows.length}`);
    if (rawRows.length < 2) {
      return NextResponse.json({ error: "XLSX file has no data rows." }, { status: 400 });
    }

    // Find the header row: the first row with at least 2 non-empty cells
    // (skips single-cell title/banner rows)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const filled = rawRows[i].filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
      if (filled >= 2) {
        headerRowIdx = i;
        break;
      }
    }
    console.log(`[API] Detected header row at index: ${headerRowIdx}`);

    const headers: string[] = rawRows[headerRowIdx]
      .map((c) => String(c ?? "").trim())
      .filter((h) => h !== "");

    if (headers.length === 0) {
      console.warn("[API] Could not detect column headers");
      return NextResponse.json({ error: "Could not detect column headers." }, { status: 400 });
    }
    console.log(`[API] Detected headers: ${headers.join(", ")}`);

    // Convert data rows (after header row) into objects
    const rows: Record<string, string>[] = [];
    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const raw = rawRows[i];
      // Skip completely empty rows
      const hasData = raw.some((c) => c !== null && c !== undefined && String(c).trim() !== "");
      if (!hasData) continue;
      const cleaned: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        cleaned[headers[j]] = String(raw[j] ?? "").trim();
      }
      rows.push(cleaned);
    }

    console.log(`[API] Parsed ${rows.length} data rows`);
    if (rows.length === 0) {
      return NextResponse.json({ error: "XLSX file has no data rows." }, { status: 400 });
    }

    // Upsert: replace if exists, create if not
    console.log("[API] Upserting data into database...");
    const data = await (prisma as any).registeredUserData.upsert({
      where: { formId: id },
      update: {
        headers: JSON.stringify(headers),
        rows: JSON.stringify(rows),
        lookupColumn: "",
        lookupQuestionId: "",
        secondaryLookupColumn: "",
        secondaryLookupQuestionId: "",
        mappings: "{}",
      },
      create: {
        formId: id,
        headers: JSON.stringify(headers),
        rows: JSON.stringify(rows),
        lookupColumn: "",
        lookupQuestionId: "",
        secondaryLookupColumn: "",
        secondaryLookupQuestionId: "",
        mappings: "{}",
      },
    });
    console.log(`[API] Successfully saved data. ID: ${data.id}`);

    return NextResponse.json({
      id: data.id,
      headers,
      rowCount: rows.length,
      firstRow: rows[0] || null,
      lookupColumn: data.lookupColumn,
      lookupQuestionId: data.lookupQuestionId || "",
      secondaryLookupColumn: data.secondaryLookupColumn || "",
      secondaryLookupQuestionId: data.secondaryLookupQuestionId || "",
      mappings: JSON.parse(data.mappings),
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/forms/[id]/registered-user-data error:", err);
    return NextResponse.json({ error: "Failed to process XLSX file." }, { status: 500 });
  }
}

// PUT — update lookupColumn and mappings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`reg-user-data:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await canEditForm(session.userId, session.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await ensureRegisteredUserDataTable();
  } catch (_) { /* ensured in helper */ }

  const existing = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
  if (!existing) {
    return NextResponse.json({ error: "No registered user data found for this form." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const updateData: Record<string, string> = {};

    if (typeof body.lookupColumn === "string") {
      updateData.lookupColumn = body.lookupColumn;
    }
    if (typeof body.lookupQuestionId === "string") {
      updateData.lookupQuestionId = body.lookupQuestionId;
    }
    if (typeof body.secondaryLookupColumn === "string") {
      updateData.secondaryLookupColumn = body.secondaryLookupColumn;
    }
    if (typeof body.secondaryLookupQuestionId === "string") {
      updateData.secondaryLookupQuestionId = body.secondaryLookupQuestionId;
    }
    if (body.mappings && typeof body.mappings === "object") {
      updateData.mappings = JSON.stringify(body.mappings);
    }

    const data = await (prisma as any).registeredUserData.update({
      where: { formId: id },
      data: updateData,
    });

    const rows: Record<string, string>[] = JSON.parse(data.rows);

    return NextResponse.json({
      id: data.id,
      headers: JSON.parse(data.headers),
      rowCount: rows.length,
      firstRow: rows[0] || null,
      lookupColumn: data.lookupColumn,
      lookupQuestionId: data.lookupQuestionId || "",
      secondaryLookupColumn: data.secondaryLookupColumn || "",
      secondaryLookupQuestionId: data.secondaryLookupQuestionId || "",
      mappings: JSON.parse(data.mappings),
    });
  } catch (err) {
    console.error("PUT /api/forms/[id]/registered-user-data error:", err);
    return NextResponse.json({ error: "Failed to update data." }, { status: 500 });
  }
}

// DELETE — remove registered user data from a form
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`reg-user-data:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await canEditForm(session.userId, session.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await ensureRegisteredUserDataTable();
  } catch (_) { /* ensured in helper */ }

  const existing = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
  if (!existing) {
    return NextResponse.json({ error: "No registered user data found." }, { status: 404 });
  }

  await (prisma as any).registeredUserData.delete({ where: { formId: id } });
  return NextResponse.json({ success: true });
}

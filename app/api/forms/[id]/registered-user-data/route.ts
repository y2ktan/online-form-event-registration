import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import * as XLSX from "xlsx";

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
    const data = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
    if (!data) {
      return NextResponse.json(null);
    }

    const rows: Record<string, string>[] = JSON.parse(data.rows);

    return NextResponse.json({
      id: data.id,
      headers: JSON.parse(data.headers),
      rowCount: rows.length,
      firstRow: rows[0] || null,
      lookupColumn: data.lookupColumn,
      lookupQuestionId: data.lookupQuestionId || "",
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

  // Verify form exists
  const form = await prisma.form.findUnique({ where: { id }, select: { id: true } });
  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "XLSX file has no sheets." }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];

    // Read as raw 2D array to auto-detect the real header row
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
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

    const headers: string[] = rawRows[headerRowIdx]
      .map((c) => String(c ?? "").trim())
      .filter((h) => h !== "");

    if (headers.length === 0) {
      return NextResponse.json({ error: "Could not detect column headers." }, { status: 400 });
    }

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

    if (rows.length === 0) {
      return NextResponse.json({ error: "XLSX file has no data rows." }, { status: 400 });
    }

    // Upsert: replace if exists, create if not
    const data = await (prisma as any).registeredUserData.upsert({
      where: { formId: id },
      update: {
        headers: JSON.stringify(headers),
        rows: JSON.stringify(rows),
        lookupColumn: "",
        mappings: "{}",
      },
      create: {
        formId: id,
        headers: JSON.stringify(headers),
        rows: JSON.stringify(rows),
        lookupColumn: "",
        mappings: "{}",
      },
    });

    return NextResponse.json({
      id: data.id,
      headers,
      rowCount: rows.length,
      firstRow: rows[0] || null,
      lookupColumn: data.lookupColumn,
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

  const existing = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
  if (!existing) {
    return NextResponse.json({ error: "No registered user data found." }, { status: 404 });
  }

  await (prisma as any).registeredUserData.delete({ where: { formId: id } });
  return NextResponse.json({ success: true });
}

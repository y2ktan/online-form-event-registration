import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureRegisteredUserDataTable } from "../registered-user-data/_ensure-table";

// GET /api/forms/[id]/registered-user-lookup?key=VALUE
// Public endpoint — looks up a registered user row by the configured lookup column
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  // Strict rate limit to prevent data scraping
  const { allowed } = checkRateLimit(`reg-user-lookup:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const key = request.nextUrl.searchParams.get("key")?.trim();
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter." }, { status: 400 });
  }

  await ensureRegisteredUserDataTable();
  const data = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
  if (!data || !data.lookupColumn) {
    return NextResponse.json({ error: "User profile lookup not configured." }, { status: 404 });
  }

  const secondaryCol = data.secondaryLookupColumn || "";
  const secondaryKey = request.nextUrl.searchParams.get("secondaryKey")?.trim();

  // If secondary verification is configured, require the secondary key
  if (secondaryCol) {
    if (!secondaryKey) {
      return NextResponse.json({ error: "Missing secondary verification." }, { status: 400 });
    }
  }

  const rows: Record<string, string>[] = JSON.parse(data.rows);
  const mappings: Record<string, string> = JSON.parse(data.mappings);
  const lookupCol = data.lookupColumn;

  // Find matching row (case-insensitive) — must match both primary and secondary (if configured)
  const match = rows.find((row) => {
    const primaryMatch = row[lookupCol]?.toLowerCase() === key.toLowerCase();
    if (!primaryMatch) return false;
    if (secondaryCol && secondaryKey) {
      return row[secondaryCol]?.toLowerCase() === secondaryKey.toLowerCase();
    }
    return true;
  });

  if (!match) {
    return NextResponse.json({ found: false, values: {} });
  }

  // Build response: only return values for mapped questions
  const values: Record<string, string> = {};
  for (const [questionId, columnName] of Object.entries(mappings)) {
    if (match[columnName] !== undefined) {
      values[questionId] = match[columnName];
    }
  }

  return NextResponse.json({ found: true, values });
}

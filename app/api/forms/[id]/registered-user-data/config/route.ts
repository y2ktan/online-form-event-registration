import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureRegisteredUserDataTable } from "../_ensure-table";

// GET /api/forms/[id]/registered-user-data/config
// Public endpoint — returns only lookupColumn and mappings (no rows or headers)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`reg-user-config:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  // Only return config for published forms
  const form = await prisma.form.findUnique({
    where: { id },
    select: { published: true },
  });
  if (!form?.published) {
    return NextResponse.json(null, { status: 404 });
  }

  await ensureRegisteredUserDataTable();
  const data = await (prisma as any).registeredUserData.findUnique({ where: { formId: id } });
  if (!data || !data.lookupColumn) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json({
    lookupColumn: data.lookupColumn,
    lookupQuestionId: data.lookupQuestionId || null,
    mappings: JSON.parse(data.mappings),
  });
}

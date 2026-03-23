import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// GET responses - admin can search by phone number
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`responses:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone") || "";
  const formId = searchParams.get("formId") || "";

  const where: Record<string, unknown> = {};
  if (phone) {
    where.phoneNumber = { contains: phone };
  }
  if (formId) {
    where.formId = formId;
  }

  const responses = await prisma.response.findMany({
    where,
    include: {
      answers: {
        include: { question: true },
      },
      form: { select: { title: true, id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(responses);
}

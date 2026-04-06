import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// GET responses - admin sees all, collaborators see only their forms
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`responses:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone") || "";
  const formId = searchParams.get("formId") || "";
  const pageParam = parseInt(searchParams.get("page") || "", 10);
  const pageSizeParam = parseInt(searchParams.get("pageSize") || "", 10);

  // When page/pageSize are provided, enable pagination; otherwise return all (legacy)
  const paginated = !isNaN(pageParam) && pageParam > 0;
  const page = paginated ? pageParam : 1;
  const pageSize = paginated
    ? Math.min(Math.max(pageSizeParam || 50, 1), 200)
    : undefined;

  const where: Record<string, unknown> = {};
  if (phone) {
    where.phoneNumber = { contains: phone };
  }
  if (formId) {
    where.formId = formId;
  }

  // Non-admin users can only see responses for forms they collaborate on
  if (session.role !== "ADMIN") {
    const collabs = await prisma.formCollaborator.findMany({
      where: { userId: session.userId },
      select: { formId: true },
    });
    const allowedFormIds = collabs.map((c: { formId: string }) => c.formId);
    if (formId) {
      if (!allowedFormIds.includes(formId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } else {
      where.formId = { in: allowedFormIds };
    }
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
    ...(paginated ? { skip: (page - 1) * pageSize!, take: pageSize } : {}),
  });

  // Paginated mode: return envelope with total; legacy: bare array
  if (paginated) {
    const total = await prisma.response.count({ where });
    return NextResponse.json({ responses, total, page, pageSize });
  }

  return NextResponse.json(responses);
}

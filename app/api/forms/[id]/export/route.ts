import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { responsesToCsv } from "@/lib/csv";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`export:${ip}`);
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

  const form = await (prisma.form.findUnique as Function)({
    where: { id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  }) as { title: string; collectPhone: boolean; sections: { questions: { id: string; label: string; type: string; config: string }[] }[] } | null;

  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  // Flatten questions across sections in order
  const questions = form.sections.flatMap((s: { questions: { id: string; label: string; type: string; config: string }[] }) =>
    s.questions
      .filter((q: { config: string }) => {
        try {
          const cfg = typeof q.config === "string" ? JSON.parse(q.config) : q.config;
          return !cfg?.isPhoneNumber;
        } catch {
          return true;
        }
      })
      .map((q: { id: string; label: string; type: string; config: string }) => ({ id: q.id, label: q.label, type: q.type, config: q.config }))
  );

  const responses = await prisma.response.findMany({
    where: { formId: id },
    include: {
      answers: { select: { questionId: true, value: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const csvData = responses.map((r) => ({
    shortCode: r.shortCode,
    phoneNumber: r.phoneNumber,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    answers: r.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
  }));

  // Build base URL for absolute links (selfie photos)
  const baseUrl =
    process.env.APP_URL?.replace(/\/+$/, "") ||
    (() => {
      const proto = request.headers.get("x-forwarded-proto") || "https";
      const host = request.headers.get("host") || "localhost:3000";
      return `${proto}://${host}`;
    })();

  const csv = responsesToCsv(csvData, questions, form.collectPhone, baseUrl);
  const safeTitle = (form.title || "responses").replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle}.csv"`,
    },
  });
}

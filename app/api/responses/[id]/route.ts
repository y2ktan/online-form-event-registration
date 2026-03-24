import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { isGridType } from "@/lib/question-types";

interface GridItem {
  id: string;
  value: string;
}

interface QuestionConfig {
  isPhoneNumber?: boolean;
  grid?: {
    rows: GridItem[];
    columns: GridItem[];
  };
  [key: string]: unknown;
}

// GET a single response (admin or by editToken)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`response:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const editToken = searchParams.get("token");

  const response = await prisma.response.findUnique({
    where: { id },
    include: {
      answers: { include: { question: true } },
      form: {
        include: {
          questions: {
            include: { options: { orderBy: { order: "asc" } } },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!response) {
    return NextResponse.json({ error: "Response not found." }, { status: 404 });
  }

  // Allow access if admin or has valid edit token
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";
  const hasValidToken = editToken && response.editToken === editToken;

  if (!isAdmin && !hasValidToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(response);
}

// DELETE a response (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`response:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.response.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete response." },
      { status: 500 }
    );
  }
}

// PUT update a response (admin or by editToken)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`response:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { answers, editToken } = body;

    const existing = await prisma.response.findUnique({
      where: { id },
      include: {
        form: { include: { questions: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Response not found." }, { status: 404 });
    }

    // Auth check
    const session = await getSession();
    const isAdmin = session?.role === "ADMIN";
    const hasValidToken = editToken && existing.editToken === editToken;

    if (!isAdmin && !hasValidToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate required fields
    for (const question of existing.form.questions) {
      if (question.isRequired) {
        const answer = answers[question.id];
        const answerValue = typeof answer === "string" ? answer : JSON.stringify(answer);
        const config = (typeof question.config === "string" ? JSON.parse(question.config) : question.config) as QuestionConfig;

        if (isGridType(question.type as any)) {
          try {
            const gridAnswers = JSON.parse(answerValue);
            const rows = config.grid?.rows || [];
            
            if (rows.length === 0) {
              if (!answer || answerValue === "{}" || answerValue === "[]") {
                return NextResponse.json(
                  { error: `"${question.label}" is required.` },
                  { status: 400 }
                );
              }
            } else {
              for (const row of rows) {
                const rowAnswer = gridAnswers[row.id];
                if (!rowAnswer || (Array.isArray(rowAnswer) && rowAnswer.length === 0)) {
                  return NextResponse.json(
                    { error: `"${question.label}": Each row requires a response.` },
                    { status: 400 }
                  );
                }
              }
            }
          } catch (e) {
            return NextResponse.json(
              { error: `"${question.label}" is required.` },
              { status: 400 }
            );
          }
        } else {
          if (!answer || (typeof answer === "string" && !answer.trim()) || answer === "[]") {
            return NextResponse.json(
              { error: `"${question.label}" is required.` },
              { status: 400 }
            );
          }
        }
      }
    }

    // Update phone number if provided
    if (body.phoneNumber) {
      await prisma.response.update({
        where: { id },
        data: { phoneNumber: sanitize(body.phoneNumber) },
      });
    }

    // Delete old answers and create new ones
    await prisma.answer.deleteMany({ where: { responseId: id } });
    for (const [questionId, value] of Object.entries(
      answers as Record<string, unknown>
    )) {
      await prisma.answer.create({
        data: {
          responseId: id,
          questionId,
          value:
            typeof value === "string" ? sanitize(value) : JSON.stringify(value),
        },
      });
    }

    const updated = await prisma.response.findUnique({
      where: { id },
      include: {
        answers: { include: { question: true } },
        form: { select: { title: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update response error:", error);
    return NextResponse.json(
      { error: "Failed to update response." },
      { status: 500 }
    );
  }
}

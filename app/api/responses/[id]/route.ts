import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";

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
        if (!answer || (typeof answer === "string" && !answer.trim())) {
          return NextResponse.json(
            { error: `"${question.label}" is required.` },
            { status: 400 }
          );
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

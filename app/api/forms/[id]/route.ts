import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";

// GET a single form (public if published, or admin)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`form:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
      _count: { select: { responses: true } },
    },
  });

  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  // Public access only if published
  const session = await getSession();
  if (!form.published && (!session || session.role !== "ADMIN")) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  return NextResponse.json(form);
}

// UPDATE a form (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`form:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Update form metadata
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = sanitize(body.title);
    if (body.description !== undefined) updateData.description = sanitize(body.description);
    if (body.published !== undefined) updateData.published = Boolean(body.published);

    const form = await prisma.form.update({
      where: { id },
      data: updateData,
    });

    // Update questions if provided
    if (body.questions && Array.isArray(body.questions)) {
      // Delete old questions (except the locked phone number field)
      // Then re-create all questions
      await prisma.question.deleteMany({
        where: { formId: id },
      });

      for (const q of body.questions) {
        const questionData = {
          formId: id,
          type: sanitize(q.type),
          label: sanitize(q.label),
          isRequired: Boolean(q.isRequired),
          order: Number(q.order),
          config: q.config ? JSON.stringify(q.config) : "{}",
        };

        const question = await prisma.question.create({
          data: questionData,
        });

        // Create options if provided
        if (q.options && Array.isArray(q.options)) {
          for (const opt of q.options) {
            await prisma.option.create({
              data: {
                questionId: question.id,
                value: sanitize(opt.value),
                order: Number(opt.order),
                group: opt.group || "default",
              },
            });
          }
        }
      }
    }

    const updatedForm = await prisma.form.findUnique({
      where: { id },
      include: {
        questions: {
          include: { options: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(updatedForm);
  } catch (error) {
    console.error("Failed to update form:", error);
    return NextResponse.json(
      { error: "Failed to update form." },
      { status: 500 }
    );
  }
}

// DELETE a form (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`form:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.form.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete form." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
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
      sections: {
        include: {
          questions: {
            include: { options: { orderBy: { order: "asc" } } },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
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

  // Public access only if published, or if user is admin/collaborator
  const session = await getSession();
  if (!form.published) {
    if (!session) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }
    const hasAccess = await canEditForm(session.userId, session.role, id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }
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
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow admin or collaborator to edit
  const hasAccess = await canEditForm(session.userId, session.role, id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Update form metadata
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = sanitize(body.title);
    if (body.description !== undefined) updateData.description = sanitize(body.description);
    if (body.published !== undefined) updateData.published = Boolean(body.published);
    if (body.collectPhone !== undefined) updateData.collectPhone = Boolean(body.collectPhone);
    if (body.phoneDescription !== undefined) updateData.phoneDescription = sanitize(body.phoneDescription);
    if (body.phoneTitle !== undefined) updateData.phoneTitle = sanitize(body.phoneTitle);
    if (body.phonePlaceholder !== undefined) updateData.phonePlaceholder = sanitize(body.phonePlaceholder);

    await prisma.form.update({
      where: { id },
      data: updateData,
    });

    // Update sections if provided
    if (body.sections && Array.isArray(body.sections)) {
      // Delete old sections (cascades to questions in those sections)
      await prisma.question.deleteMany({ where: { formId: id } });
      await prisma.section.deleteMany({ where: { formId: id } });

      for (const s of body.sections) {
        const section = await prisma.section.create({
          data: {
            formId: id,
            title: sanitize(s.title || "Untitled Section"),
            description: sanitize(s.description || ""),
            order: Number(s.order),
            routingConfig: JSON.stringify(s.routingConfig || {}),
          },
        });

        if (s.questions && Array.isArray(s.questions)) {
          for (const q of s.questions) {
            const config = q.config || {};
            if (config.grid) {
              if (Array.isArray(config.grid.rows)) {
                config.grid.rows = config.grid.rows.map((r: any) => ({
                  ...r,
                  value: sanitize(r.value || ""),
                }));
              }
              if (Array.isArray(config.grid.columns)) {
                config.grid.columns = config.grid.columns.map((c: any) => ({
                  ...c,
                  value: sanitize(c.value || ""),
                }));
              }
            }

            const question = await prisma.question.create({
              data: {
                formId: id,
                sectionId: section.id,
                type: sanitize(q.type),
                label: sanitize(q.label),
                isRequired: Boolean(q.isRequired),
                order: Number(q.order),
                config: JSON.stringify(config),
              },
            });

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
      }
    } else if (body.questions && Array.isArray(body.questions)) {
      // Legacy: questions without sections (backwards compat)
      await prisma.question.deleteMany({ where: { formId: id } });

      // Ensure at least one section exists
      let section = await prisma.section.findFirst({ where: { formId: id }, orderBy: { order: "asc" } });
      if (!section) {
        section = await prisma.section.create({
          data: { formId: id, title: "Section 1", order: 0 },
        });
      }

      for (const q of body.questions) {
        const config = q.config || {};
        if (config.grid) {
          if (Array.isArray(config.grid.rows)) {
            config.grid.rows = config.grid.rows.map((r: any) => ({
              ...r,
              value: sanitize(r.value || ""),
            }));
          }
          if (Array.isArray(config.grid.columns)) {
            config.grid.columns = config.grid.columns.map((c: any) => ({
              ...c,
              value: sanitize(c.value || ""),
            }));
          }
        }

        const question = await prisma.question.create({
          data: {
            formId: id,
            sectionId: section.id,
            type: sanitize(q.type),
            label: sanitize(q.label),
            isRequired: Boolean(q.isRequired),
            order: Number(q.order),
            config: JSON.stringify(config),
          },
        });

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
        sections: {
          include: {
            questions: {
              include: { options: { orderBy: { order: "asc" } } },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { order: "asc" },
        },
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

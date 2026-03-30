import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/forms/[id]/copy — deep-copy a form (sections, questions, options, collaborators)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`form-copy:${ip}`);
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
    // Fetch the original form with all nested relations in one query
    const original = await (prisma as any).form.findUnique({
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
        collaborators: true,
        registeredUserData: true,
      },
    });

    if (!original) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }

    // Run the entire copy inside a transaction for atomicity
    const newForm = await prisma.$transaction(async (tx) => {
      // 1. Create the new form (always draft)
      const form = await tx.form.create({
        data: {
          title: `Copy of ${original.title}`,
          description: original.description,
          published: false,
          collectPhone: original.collectPhone,
          phoneDescription: original.phoneDescription,
          phoneTitle: original.phoneTitle,
          phonePlaceholder: original.phonePlaceholder,
          authorId: session.userId,
        },
      });

      // 2. Create all sections first to build the complete ID mapping
      const sectionMap = new Map<string, string>();

      for (const s of original.sections) {
        const newSection = await tx.section.create({
          data: {
            formId: form.id,
            title: s.title,
            description: s.description,
            order: s.order,
            routingConfig: s.routingConfig,
          },
        });
        sectionMap.set(s.id, newSection.id);
      }

      // Build a single regex to replace all old section IDs in one pass — O(L) per string
      const oldIds = [...sectionMap.keys()];
      const idPattern = oldIds.length > 0
        ? new RegExp(oldIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g")
        : null;

      function replaceSectionIds(str: string): string {
        if (!idPattern) return str;
        return str.replace(idPattern, (match) => sectionMap.get(match) || match);
      }

      // 3. Create questions with pre-patched configs + options, and patch section routing — single pass
      const questionMap = new Map<string, string>();
      for (const s of original.sections) {
        const newSectionId = sectionMap.get(s.id)!;

        // Patch section routing in the same pass (avoids a separate update loop)
        if (s.routingConfig && s.routingConfig !== "{}") {
          const patched = replaceSectionIds(s.routingConfig);
          if (patched !== s.routingConfig) {
            await tx.section.update({
              where: { id: newSectionId },
              data: { routingConfig: patched },
            });
          }
        }

        for (const q of s.questions) {
          // Pre-patch config before creation — eliminates separate question update loop
          const config = (q.config && q.config !== "{}") ? replaceSectionIds(q.config) : q.config;

          const newQuestion = await tx.question.create({
            data: {
              formId: form.id,
              sectionId: newSectionId,
              type: q.type,
              label: q.label,
              isRequired: q.isRequired,
              order: q.order,
              config,
            },
          });
          questionMap.set(q.id, newQuestion.id);

          if (q.options.length > 0) {
            await tx.option.createMany({
              data: q.options.map((opt: { value: string; order: number; group: string }) => ({
                questionId: newQuestion.id,
                value: opt.value,
                order: opt.order,
                group: opt.group,
              })),
            });
          }
        }
      }

      // 5. Copy collaborators
      if (original.collaborators.length > 0) {
        await tx.formCollaborator.createMany({
          data: original.collaborators.map((c: { userId: string; role: string }) => ({
            userId: c.userId,
            formId: form.id,
            role: c.role,
          })),
        });
      }

      // 6. Copy registered user data with remapped question IDs
      if ((original as any).registeredUserData) {
        const vd = (original as any).registeredUserData;
        const oldMappings: Record<string, string> = typeof vd.mappings === "string" ? JSON.parse(vd.mappings) : (vd.mappings || {});
        const newMappings: Record<string, string> = {};
        for (const [oldQId, colName] of Object.entries(oldMappings)) {
          const newQId = questionMap.get(oldQId);
          if (newQId) newMappings[newQId] = colName;
        }
        const newLookupQuestionId = vd.lookupQuestionId ? (questionMap.get(vd.lookupQuestionId) || "") : "";
        const newSecondaryQuestionId = vd.secondaryLookupQuestionId ? (questionMap.get(vd.secondaryLookupQuestionId) || "") : "";
        await (tx as any).registeredUserData.create({
          data: {
            formId: form.id,
            headers: vd.headers,
            rows: vd.rows,
            lookupColumn: vd.lookupColumn,
            lookupQuestionId: newLookupQuestionId,
            secondaryLookupColumn: vd.secondaryLookupColumn || "",
            secondaryLookupQuestionId: newSecondaryQuestionId,
            mappings: JSON.stringify(newMappings),
          },
        });
      }

      return form;
    });

    // Return the full new form
    const fullForm = await prisma.form.findUnique({
      where: { id: newForm.id },
      include: {
        sections: {
          include: {
            questions: { include: { options: true }, orderBy: { order: "asc" } },
          },
          orderBy: { order: "asc" },
        },
        questions: { include: { options: true }, orderBy: { order: "asc" } },
        _count: { select: { responses: true, questions: true } },
      },
    });

    return NextResponse.json(fullForm, { status: 201 });
  } catch (err) {
    console.error("POST /api/forms/[id]/copy error:", err);
    return NextResponse.json({ error: "Failed to copy form." }, { status: 500 });
  }
}

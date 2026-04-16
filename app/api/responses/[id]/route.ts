import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { isGridType } from "@/lib/question-types";
import { maskValue } from "@/lib/masking";
import { fireAndForgetMessage, buildQrEditMessage } from "@/lib/messaging";
import { markFormDirty } from "@/lib/google-sheets";

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
          sections: {
            orderBy: { order: "asc" },
            include: {
              questions: {
                include: { options: { orderBy: { order: "asc" } } },
                orderBy: { order: "asc" },
              },
            },
          },
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

  // For public (token-based) access, mask auto-generated profile field values
  const isPublicAccess = hasValidToken && !isAdmin;
  if (isPublicAccess) {
    try {
      const regUserData = await (prisma as any).registeredUserData.findUnique({
        where: { formId: response.formId },
      });
      if (regUserData?.mappings) {
        const mappings: Record<string, string> = JSON.parse(regUserData.mappings);
        const mappedQuestionIds = new Set(Object.keys(mappings));
        const maskedAnswers = (response as any).answers.map((ans: any) => {
          if (mappedQuestionIds.has(ans.questionId)) {
            return { ...ans, value: maskValue(ans.value) };
          }
          return ans;
        });
        return NextResponse.json({ ...response, answers: maskedAnswers });
      }
    } catch { /* table may not exist yet — return unmasked */ }
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
    const deleted = await prisma.response.delete({ where: { id }, select: { formId: true } });
    markFormDirty(deleted.formId).catch(() => {});
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
    const { answers, editToken, phoneNumber, visitedSectionIds } = body;

    const existing = await prisma.response.findUnique({
      where: { id },
      include: {
        answers: true,
        form: { 
          include: { 
            questions: { orderBy: { order: "asc" } },
            sections: { orderBy: { order: "asc" } }
          } 
        },
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

    const isPublicAccess = hasValidToken && !isAdmin;

    // Build set of visited section IDs for scoped validation
    const visitedSet: Set<string> | null = Array.isArray(visitedSectionIds) && visitedSectionIds.length > 0
      ? new Set(visitedSectionIds as string[])
      : null;

    // Identify phone number question IDs
    const phoneQuestionIds = new Set<string>();
    for (const question of existing.form.questions) {
      let config: any = {};
      try {
        config = typeof question.config === "string" ? JSON.parse(question.config) : (question.config ?? {});
      } catch { /* ignore */ }
      
      if (config.isPhoneNumber) {
        phoneQuestionIds.add(question.id);
        continue;
      }

      // Skip dekorative title questions
      if (config.isTitle) continue;

      // Skip questions in sections the user never visited (if provided)
      if (visitedSet && question.sectionId && !visitedSet.has(question.sectionId)) {
        continue;
      }

      const answer = answers[question.id];
      const answerValue = typeof answer === "string" ? answer : JSON.stringify(answer);

      // Validate required fields
      if (question.isRequired) {
        if (isGridType(question.type as any)) {
          try {
            const gridAnswers = JSON.parse(answerValue || "{}");
            const rows = config.grid?.rows || [];
            if (rows.length === 0) {
              if (!answer || answerValue === "{}" || answerValue === "[]") {
                return NextResponse.json({ error: `"${question.label}" is required.` }, { status: 400 });
              }
            } else if (question.type === "CHECKBOX_GRID") {
              // For Checkbox Grid, at least one selection anywhere in the grid is sufficient
              let hasAnySelection = false;
              for (const row of rows) {
                const rowAnswer = gridAnswers[row.id];
                if (Array.isArray(rowAnswer) && rowAnswer.length > 0) {
                  hasAnySelection = true;
                  break;
                }
              }
              if (!hasAnySelection) {
                return NextResponse.json({ error: `"${question.label}" is required.` }, { status: 400 });
              }
            } else {
              // For Multiple Choice Grid, every row requires a selection
              for (const row of rows) {
                const rowAnswer = gridAnswers[row.id];
                if (!rowAnswer || (Array.isArray(rowAnswer) && rowAnswer.length === 0)) {
                  return NextResponse.json({ error: `"${question.label}": Each row requires a response.` }, { status: 400 });
                }
              }
            }
          } catch {
            return NextResponse.json({ error: `"${question.label}" is required.` }, { status: 400 });
          }
        } else {
          if (!answer || (typeof answer === "string" && !answer.trim()) || answer === "[]") {
            return NextResponse.json({ error: `"${question.label}" is required.` }, { status: 400 });
          }
        }
      }
    }

    // Update phone number if provided
    if (phoneNumber !== undefined) {
      await prisma.response.update({
        where: { id },
        data: { phoneNumber: sanitize(phoneNumber) },
      });
    }

    // Identify mapped questions to handle masked values for public access
    let mappedQuestionIds = new Set<string>();
    if (isPublicAccess) {
      try {
        const regUserData = await (prisma as any).registeredUserData.findUnique({
          where: { formId: existing.formId },
        });
        if (regUserData?.mappings) {
          const mappings = JSON.parse(regUserData.mappings);
          mappedQuestionIds = new Set(Object.keys(mappings));
        }
      } catch { /* table may not exist */ }
    }

    // Filter out phone number question from answers before saving
    const filteredAnswers = Object.entries(answers as Record<string, unknown>).filter(
      ([questionId]) => !phoneQuestionIds.has(questionId)
    );

    // Delete old answers and create new ones
    await prisma.answer.deleteMany({ where: { responseId: id } });
    for (const [questionId, value] of filteredAnswers) {
      let finalValue = typeof value === "string" ? sanitize(value) : JSON.stringify(value);

      // For public access, if user sent a masked value that hasn't changed, restore the clear text
      if (isPublicAccess && mappedQuestionIds.has(questionId)) {
        const existingAnswer = existing.answers.find(a => a.questionId === questionId);
        if (existingAnswer && finalValue === maskValue(existingAnswer.value)) {
          finalValue = existingAnswer.value;
        }
      }

      await prisma.answer.create({
        data: {
          responseId: id,
          questionId,
          value: finalValue,
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

    // Fire-and-forget: send WhatsApp QR + edit link notification on update
    const updatedPhone = phoneNumber !== undefined ? sanitize(phoneNumber) : existing.phoneNumber;
    if (updatedPhone) {
      const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
      const editLink = `${origin}/edit/${id}?token=${existing.editToken}`;
      const waMessage = buildQrEditMessage(
        updated?.form?.title || "Form",
        existing.shortCode,
        editLink,
      );
      fireAndForgetMessage(waMessage, [updatedPhone]);
    }

    // Fire-and-forget: mark form dirty for Google Sheets sync
    markFormDirty(existing.formId).catch(() => {});

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update response error:", error);
    return NextResponse.json(
      { error: "Failed to update response." },
      { status: 500 }
    );
  }
}

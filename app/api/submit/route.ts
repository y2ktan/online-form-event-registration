import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`submit:${ip}`, true);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { formId, phoneNumber, answers } = body;

    if (!formId || !answers) {
      return NextResponse.json(
        { error: "Form ID and answers are required." },
        { status: 400 }
      );
    }

    // Verify form exists and is published
    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: {
        questions: { orderBy: { order: "asc" } },
      },
    });

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    if (form.collectPhone && (!phoneNumber || !sanitize(phoneNumber).trim())) {
      return NextResponse.json(
        { error: "Phone number is required." },
        { status: 400 }
      );
    }

    // Identify phone number question IDs to exclude from answer processing
    const phoneQuestionIds = new Set<string>();
    for (const question of form.questions) {
      let config: Record<string, unknown> = {};
      try {
        config = typeof question.config === "string" ? JSON.parse(question.config) : (question.config ?? {});
      } catch { /* ignore parse errors */ }
      if (config.isPhoneNumber) {
        phoneQuestionIds.add(question.id);
        continue;
      }

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

    // Filter out phone number question from answers before saving
    const filteredAnswers = Object.entries(answers as Record<string, unknown>).filter(
      ([questionId]) => !phoneQuestionIds.has(questionId)
    );

    // Create response with answers
    const response = await prisma.response.create({
      data: {
        form: { connect: { id: formId } },
        phoneNumber: form.collectPhone ? sanitize(phoneNumber) : null,
        answers: {
          create: filteredAnswers.map(
            ([questionId, value]) => ({
              question: { connect: { id: questionId } },
              value: typeof value === "string" ? sanitize(value) : JSON.stringify(value),
            })
          ),
        },
      },
      include: { answers: true },
    });

    return NextResponse.json({
      success: true,
      responseId: response.id,
      editToken: response.editToken,
    });
  } catch (error) {
    console.error("Submit error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to submit form.", details: message },
      { status: 500 }
    );
  }
}

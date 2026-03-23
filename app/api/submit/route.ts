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

    if (!formId || !phoneNumber || !answers) {
      return NextResponse.json(
        { error: "Form ID, phone number, and answers are required." },
        { status: 400 }
      );
    }

    const sanitizedPhone = sanitize(phoneNumber).trim();
    if (!sanitizedPhone) {
      return NextResponse.json(
        { error: "Valid phone number is required." },
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

    if (!form || !form.published) {
      return NextResponse.json(
        { error: "Form not found or not published." },
        { status: 404 }
      );
    }

    // Validate required fields
    for (const question of form.questions) {
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

    // Create response with answers
    const response = await prisma.response.create({
      data: {
        formId,
        phoneNumber: sanitizedPhone,
        answers: {
          create: Object.entries(answers as Record<string, unknown>).map(
            ([questionId, value]) => ({
              questionId,
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
    return NextResponse.json(
      { error: "Failed to submit form." },
      { status: 500 }
    );
  }
}

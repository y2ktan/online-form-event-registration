import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { sanitizeRichText } from "@/lib/rich-text";
import { generateFormShortCode } from "@/lib/form-short-code";
import { ensureFormShortCodes } from "@/lib/ensure-form-shortcode";

// GET all forms for the current user (owned or collaborated)
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`forms:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureFormShortCodes();
    let forms;
    if (session.role === "ADMIN") {
      // Admins see all forms
      forms = await prisma.form.findMany({
        include: {
          _count: { select: { responses: true, questions: true } },
          author: { select: { email: true, nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // Regular users see only forms they collaborate on
      forms = await prisma.form.findMany({
        where: {
          collaborators: {
            some: { userId: session.userId },
          },
        },
        include: {
          _count: { select: { responses: true, questions: true } },
          author: { select: { email: true, nickname: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json(forms);
  } catch (err) {
    console.error("GET /api/forms error:", err);
    return NextResponse.json(
      { error: "Failed to fetch forms." },
      { status: 500 }
    );
  }
}

// CREATE a new form
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`forms:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const title = sanitize(body.title || "Untitled Form");
    const description = sanitizeRichText(body.description || "");

    // Create form first
    const shortCode = await generateFormShortCode();
    const form = await prisma.form.create({
      data: {
        title,
        description,
        authorId: session.userId,
        shortCode,
      },
    });

    // Create default section
    const section = await prisma.section.create({
      data: {
        formId: form.id,
        title: "Section 1",
        order: 0,
      },
    });

    // Create the phone number question linked to both form and section
    await prisma.question.create({
      data: {
        formId: form.id,
        sectionId: section.id,
        type: "SHORT_TEXT",
        label: "Phone Number",
        isRequired: true,
        order: 0,
        config: JSON.stringify({ isPhoneNumber: true, locked: true }),
      },
    });

    // Return full form with sections and questions
    const fullForm = await prisma.form.findUnique({
      where: { id: form.id },
      include: {
        sections: {
          include: {
            questions: { include: { options: true }, orderBy: { order: "asc" } },
          },
          orderBy: { order: "asc" },
        },
        questions: { include: { options: true }, orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(fullForm, { status: 201 });
  } catch (err) {
    console.error("POST /api/forms error:", err);
    return NextResponse.json(
      { error: "Failed to create form." },
      { status: 500 }
    );
  }
}

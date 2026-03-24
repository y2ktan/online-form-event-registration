import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";

// GET collaborators for a form (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`collab:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const collaborators = await prisma.formCollaborator.findMany({
      where: { formId: id },
      include: {
        user: {
          select: { id: true, email: true, nickname: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(collaborators);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch collaborators." },
      { status: 500 }
    );
  }
}

// ADD a collaborator to a form (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: formId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`collab:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const userId = sanitize(body.userId || "").trim();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    // Verify the form exists
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }

    // Verify the user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Don't add admin as collaborator — they already have full access
    if (user.role === "ADMIN") {
      return NextResponse.json(
        { error: "Admin users already have access to all forms." },
        { status: 400 }
      );
    }

    // Check if already a collaborator
    const existing = await prisma.formCollaborator.findUnique({
      where: { userId_formId: { userId, formId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already a collaborator on this form." },
        { status: 409 }
      );
    }

    const collaborator = await prisma.formCollaborator.create({
      data: { userId, formId, role: "EDITOR" },
      include: {
        user: {
          select: { id: true, email: true, nickname: true, status: true },
        },
      },
    });

    await logAudit({
      userId: session.userId,
      action: "COLLABORATOR_ADDED",
      details: JSON.stringify({ formId, addedUserId: userId, addedEmail: user.email }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json(collaborator, { status: 201 });
  } catch (err) {
    console.error("POST collaborator error:", err);
    return NextResponse.json(
      { error: "Failed to add collaborator." },
      { status: 500 }
    );
  }
}

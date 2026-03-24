import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, generateVerificationToken, hashPassword, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { sendInvitationEmail, isSmtpConfigured } from "@/lib/mail";

// GET all users (admin only)
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`admin-users:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nickname: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { collaborations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch users." },
      { status: 500 }
    );
  }
}

// INVITE a new user (admin only)
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`admin-users:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const email = sanitize(body.email || "").trim().toLowerCase();
    const nickname = sanitize(body.nickname || "").trim();
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }

    // Create user with PENDING_ACTIVATION status and a placeholder password
    const placeholderHash = await hashPassword(crypto.randomUUID());
    const user = await prisma.user.create({
      data: {
        email,
        nickname,
        passwordHash: placeholderHash,
        role,
        status: "PENDING_ACTIVATION",
      },
    });

    // Generate verification token
    const token = await generateVerificationToken(email, "INVITATION");

    // Try to send email
    const smtpReady = await isSmtpConfigured();
    let emailSent = false;
    if (smtpReady) {
      try {
        const baseUrl = request.headers.get("origin") || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
        await sendInvitationEmail(email, token, baseUrl);
        emailSent = true;
      } catch (err) {
        console.error("Failed to send invitation email:", err);
      }
    }

    await logAudit({
      userId: session.userId,
      action: "USER_INVITED",
      details: JSON.stringify({ invitedEmail: email, role, emailSent }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json(
      {
        success: true,
        user: { id: user.id, email: user.email, role: user.role, status: user.status },
        emailSent,
        message: emailSent
          ? "Invitation email sent successfully."
          : "User created but email could not be sent. Please configure SMTP settings or share the activation link manually.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/admin/users error:", err);
    return NextResponse.json(
      { error: "Failed to invite user." },
      { status: 500 }
    );
  }
}

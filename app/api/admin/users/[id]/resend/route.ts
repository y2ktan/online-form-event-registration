import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, generateVerificationToken, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendInvitationEmail, isSmtpConfigured } from "@/lib/mail";

// POST: Resend invitation email (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`resend-invite:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const smtpReady = await isSmtpConfigured();
    if (!smtpReady) {
      return NextResponse.json(
        { error: "SMTP not configured. Please configure SMTP settings first." },
        { status: 400 }
      );
    }

    const token = await generateVerificationToken(user.email, "INVITATION");
    const baseUrl = request.headers.get("origin") || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    await sendInvitationEmail(user.email, token, baseUrl);

    await logAudit({
      userId: session.userId,
      action: "INVITATION_RESENT",
      details: JSON.stringify({ targetEmail: user.email }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({ success: true, message: "Invitation email resent." });
  } catch (err) {
    console.error("Resend invite error:", err);
    return NextResponse.json(
      { error: "Failed to resend invitation." },
      { status: 500 }
    );
  }
}

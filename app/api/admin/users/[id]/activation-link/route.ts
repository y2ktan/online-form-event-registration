import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, generateVerificationToken, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// POST: Generate activation link for a pending user (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`activation-link:${ip}`, true);
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

    if (user.status === "ACTIVATED") {
      return NextResponse.json(
        { error: "User is already activated." },
        { status: 400 }
      );
    }

    const token = await generateVerificationToken(user.email, "INVITATION");
    const baseUrl = request.headers.get("origin") || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const activationLink = `${baseUrl}/auth/set-password?token=${token}`;

    await logAudit({
      userId: session.userId,
      action: "ACTIVATION_LINK_GENERATED",
      details: JSON.stringify({ targetEmail: user.email }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({ activationLink });
  } catch (err) {
    console.error("Activation link error:", err);
    return NextResponse.json(
      { error: "Failed to generate activation link." },
      { status: 500 }
    );
  }
}

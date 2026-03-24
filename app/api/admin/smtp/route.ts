import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";

// GET current SMTP config (admin only)
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`smtp:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const config = await prisma.smtpConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!config) {
      return NextResponse.json(null);
    }

    // Mask the password for security
    return NextResponse.json({
      ...config,
      pass: config.pass ? "••••••••" : "",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch SMTP config." },
      { status: 500 }
    );
  }
}

// CREATE or UPDATE SMTP config (admin only)
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`smtp:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const host = sanitize(body.host || "").trim();
    const port = parseInt(body.port) || 587;
    const secure = Boolean(body.secure);
    const user = sanitize(body.user || "").trim();
    const pass = body.pass || "";
    const fromEmail = sanitize(body.fromEmail || "").trim();
    const fromName = sanitize(body.fromName || "Form Builder").trim();

    if (!host || !user || !fromEmail) {
      return NextResponse.json(
        { error: "Host, User, and From Email are required." },
        { status: 400 }
      );
    }

    // Find existing config
    const existing = await prisma.smtpConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      host,
      port,
      secure,
      user,
      fromEmail,
      fromName,
      // Only update password if a real value is provided (not the masked placeholder)
      ...(pass && pass !== "••••••••" ? { pass } : existing ? {} : { pass: "" }),
    };

    let config;
    if (existing) {
      config = await prisma.smtpConfig.update({
        where: { id: existing.id },
        data,
      });
    } else {
      config = await prisma.smtpConfig.create({
        data: { ...data, pass: pass || "" },
      });
    }

    await logAudit({
      userId: session.userId,
      action: "SMTP_CONFIG_UPDATED",
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({
      ...config,
      pass: config.pass ? "••••••••" : "",
    });
  } catch (err) {
    console.error("SMTP config error:", err);
    return NextResponse.json(
      { error: "Failed to save SMTP config." },
      { status: 500 }
    );
  }
}

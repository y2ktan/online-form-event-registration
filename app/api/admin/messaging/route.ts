import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import { encryptKey } from "@/lib/google-sheets-crypto";
import { sendConfirmation, getMessagingConfig } from "@/lib/messaging";

const MASK = "••••••••";

// GET current Messaging config (admin only)
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`messaging:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const config = await prisma.messagingConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!config) {
      return NextResponse.json(null);
    }

    // Mask secrets for security
    return NextResponse.json({
      ...config,
      waApiBearerToken: config.waApiBearerToken ? MASK : "",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch messaging config." },
      { status: 500 }
    );
  }
}

// CREATE or UPDATE Messaging config (admin only)
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`messaging:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();

    const enabled = Boolean(body.enabled);

    // TC_WA REST API fields
    const waApiEnabled = Boolean(body.waApiEnabled);
    const waApiBaseUrl = sanitize(body.waApiBaseUrl || "").trim();
    const waApiPort = parseInt(body.waApiPort) || 3000;
    const waApiBearerToken = body.waApiBearerToken || "";

    const existing = await prisma.messagingConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const data: Record<string, unknown> = {
      enabled,
      waApiEnabled,
      waApiBaseUrl,
      waApiPort,
    };

    // Encrypt bearer token before storage (skip if masked placeholder)
    if (waApiBearerToken && waApiBearerToken !== MASK) {
      data.waApiBearerToken = encryptKey(waApiBearerToken);
    }

    let config;
    if (existing) {
      config = await prisma.messagingConfig.update({
        where: { id: existing.id },
        data,
      });
    } else {
      config = await prisma.messagingConfig.create({
        data: {
          enabled,
          waApiEnabled,
          waApiBaseUrl,
          waApiPort,
          waApiBearerToken: waApiBearerToken && waApiBearerToken !== MASK ? encryptKey(waApiBearerToken) : "",
        },
      });
    }

    await logAudit({
      userId: session.userId,
      action: "MESSAGING_CONFIG_UPDATED",
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({
      ...config,
      waApiBearerToken: config.waApiBearerToken ? MASK : "",
    });
  } catch (err) {
    console.error("Messaging config error:", err);
    return NextResponse.json(
      { error: "Failed to save messaging config." },
      { status: 500 }
    );
  }
}

// Test connectivity (admin only) — sends a test confirmation via TC_WA REST API
export async function PUT(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`messaging-test:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const config = await getMessagingConfig();
    if (!config || !config.waApiEnabled || !config.waApiBearerToken) {
      return NextResponse.json(
        { error: "TC_WA REST API is not configured. Save configuration first." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const testPhone = sanitize(body.testPhone || "").trim();
    if (!testPhone) {
      return NextResponse.json(
        { error: "A test phone number is required." },
        { status: 400 }
      );
    }

    const origin =
      request.headers.get("origin") ||
      request.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
      "https://example.com";

    const result = await sendConfirmation(
      config,
      [{ to: testPhone, name: "test" }],
      3,
      `${origin}/f/TEST`,
      null,
      ["Test Confirmation"],
    );

    await logAudit({
      userId: session.userId,
      action: "MESSAGING_TEST_SENT",
      details: JSON.stringify({ testPhone, success: result.success }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: "Test confirmation sent successfully." });
    } else {
      return NextResponse.json(
        { error: `Send failed (${result.status}): ${result.error || result.body}` },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Messaging-Test] error:", msg);
    return NextResponse.json({ error: `Connection test failed: ${msg}` }, { status: 502 });
  }
}

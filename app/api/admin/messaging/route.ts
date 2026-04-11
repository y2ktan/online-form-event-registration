import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";

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

    // Mask the tokenId for security
    return NextResponse.json({
      ...config,
      tokenId: config.tokenId ? "••••••••" : "",
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
    const provider = sanitize(body.provider || "TzuChiWABI").trim();
    const apiBaseUrl = sanitize(body.apiBaseUrl || "").trim();
    const apiPort = parseInt(body.apiPort) || 441;
    const apiPath = sanitize(body.apiPath || "/api/sendMessage").trim();
    const tokenId = body.tokenId || "";
    const sender = sanitize(body.sender || "WhatsApp").trim();
    const requestTimeout = Math.max(1000, Math.min(parseInt(body.requestTimeout) || 10000, 60000));
    const maxRetries = Math.max(0, Math.min(parseInt(body.maxRetries) || 3, 10));
    const tlsVerify = body.tlsVerify !== false;

    if (!apiBaseUrl) {
      return NextResponse.json(
        { error: "API Base URL is required." },
        { status: 400 }
      );
    }

    const existing = await prisma.messagingConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const data: Record<string, unknown> = {
      enabled,
      provider,
      apiBaseUrl,
      apiPort,
      apiPath,
      sender,
      requestTimeout,
      maxRetries,
      tlsVerify,
    };

    // Only update tokenId if a real value is provided (not the masked placeholder)
    if (tokenId && tokenId !== "••••••••") {
      data.tokenId = tokenId;
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
          provider,
          apiBaseUrl,
          apiPort,
          apiPath,
          tokenId: tokenId && tokenId !== "••••••••" ? tokenId : "",
          sender,
          requestTimeout,
          maxRetries,
          tlsVerify,
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
      tokenId: config.tokenId ? "••••••••" : "",
    });
  } catch (err) {
    console.error("Messaging config error:", err);
    return NextResponse.json(
      { error: "Failed to save messaging config." },
      { status: 500 }
    );
  }
}

// Test connectivity (admin only) — sends a test message to a phone number
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
    const config = await prisma.messagingConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!config || !config.apiBaseUrl || !config.tokenId) {
      return NextResponse.json(
        { error: "Messaging is not configured. Save configuration first." },
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

    // Build the binary-framed message matching TzuChi WABI protocol
    const messageData = {
      tokenId: config.tokenId,
      sender: config.sender,
      message: { content: "Test message from Form Builder messaging configuration." },
      recipients: [testPhone],
    };

    const jsonString = JSON.stringify(messageData);
    const jsonBuffer = Buffer.from(jsonString, "utf8");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(jsonBuffer.byteLength, 0);
    const binaryPayload = Buffer.concat([lengthBuffer, jsonBuffer]);

    const https = await import("https");

    // Parse the base URL to extract hostname
    let hostname = config.apiBaseUrl;
    try {
      const parsed = new URL(config.apiBaseUrl);
      hostname = parsed.hostname;
    } catch {
      // If not a valid URL, treat as hostname directly
      hostname = config.apiBaseUrl.replace(/^https?:\/\//, "").split("/")[0];
    }

    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          port: config.apiPort,
          path: config.apiPath,
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": binaryPayload.length,
          },
          rejectUnauthorized: config.tlsVerify,
          timeout: config.requestTimeout,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
      req.write(binaryPayload);
      req.end();
    });

    await logAudit({
      userId: session.userId,
      action: "MESSAGING_TEST_SENT",
      details: JSON.stringify({ testPhone, status: result.status }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    if (result.status === 200) {
      return NextResponse.json({ success: true, message: "Test message sent successfully." });
    } else {
      return NextResponse.json(
        { error: `Provider returned status ${result.status}: ${result.body}` },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Connection test failed: ${msg}` }, { status: 502 });
  }
}

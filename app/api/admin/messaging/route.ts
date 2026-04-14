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
    let config = await prisma.messagingConfig.findFirst({
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

    // Allow request body to override saved config for testing unsaved changes
    if (body.apiBaseUrl) config = {
      ...config,
      apiBaseUrl: sanitize(body.apiBaseUrl).trim() || config.apiBaseUrl,
      apiPort: parseInt(body.apiPort) || config.apiPort,
      apiPath: sanitize(body.apiPath || "").trim() || config.apiPath,
      sender: sanitize(body.sender || "").trim() || config.sender,
      tlsVerify: body.tlsVerify !== undefined ? body.tlsVerify !== false : config.tlsVerify,
      requestTimeout: body.requestTimeout ? Math.max(1000, Math.min(parseInt(body.requestTimeout) || 10000, 60000)) : config.requestTimeout,
    };
    if (!testPhone) {
      return NextResponse.json(
        { error: "A test phone number is required." },
        { status: 400 }
      );
    }

    // Fetch a form title to include in the test message
    let formTitle = "Sample Form";
    try {
      const firstForm = await prisma.form.findFirst({ orderBy: { updatedAt: "desc" }, select: { title: true } });
      if (firstForm?.title) formTitle = firstForm.title;
    } catch { /* ignore */ }

    const testContent = [
      `✅ *${formTitle}*`,
      ``,
      `This is a test message from Form Builder.`,
      `Your messaging configuration is working correctly.`,
      ``,
      `📱 View your QR code:`,
      `https://example.com/f/ABC123`,
      ``,
      `✏️ Edit your response:`,
      `https://example.com/edit/sample?token=xxx`,
      ``,
      `Please keep this message for your reference.`,
    ].join("\n");

    // Build the binary-framed message matching TzuChi WABI protocol
    const messageData = {
      tokenId: config.tokenId,
      sender: config.sender,
      message: { content: testContent },
      recipients: [testPhone],
    };

    const jsonString = JSON.stringify(messageData);
    const jsonBuffer = Buffer.from(jsonString, "utf8");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(jsonBuffer.byteLength, 0);
    const binaryPayload = Buffer.concat([lengthBuffer, jsonBuffer]);

    const https = await import("https");

    // Parse the base URL to extract hostname and base path
    let hostname = config.apiBaseUrl;
    let basePath = "";
    try {
      const parsed = new URL(config.apiBaseUrl);
      hostname = parsed.hostname;
      basePath = parsed.pathname.replace(/\/$/, ""); // strip trailing slash
    } catch {
      // If not a valid URL, treat as hostname directly
      hostname = config.apiBaseUrl.replace(/^https?:\/\//, "").split("/")[0];
    }
    const fullPath = basePath + config.apiPath;

    console.log("[Messaging-Test] ── Test message START ──");
    console.log("[Messaging-Test]   testPhone:", testPhone);
    console.log("[Messaging-Test]   hostname:", hostname);
    console.log("[Messaging-Test]   port:", config.apiPort);
    console.log("[Messaging-Test]   path:", fullPath);
    console.log("[Messaging-Test]   sender:", config.sender);
    console.log("[Messaging-Test]   tlsVerify:", config.tlsVerify);
    console.log("[Messaging-Test]   timeout:", config.requestTimeout);
    console.log("[Messaging-Test]   payload length:", jsonBuffer.byteLength, "bytes");
    console.log("[Messaging-Test]   payload JSON:", jsonString);

    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          port: config.apiPort,
          path: fullPath,
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": binaryPayload.length,
          },
          rejectUnauthorized: config.tlsVerify,
          timeout: config.requestTimeout,
        },
        (res) => {
          console.log("[Messaging-Test]   response statusCode:", res.statusCode);
          console.log("[Messaging-Test]   response headers:", JSON.stringify(res.headers));
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk));
          res.on("end", () => {
            console.log("[Messaging-Test]   response body:", data);
            console.log("[Messaging-Test] ── Test message END (status", res.statusCode, ") ──");
            resolve({ status: res.statusCode || 0, body: data });
          });
        }
      );
      req.on("error", (err) => {
        console.error("[Messaging-Test]   request error:", err.message);
        console.error("[Messaging-Test]   error code:", (err as NodeJS.ErrnoException).code);
        console.log("[Messaging-Test] ── Test message END (error) ──");
        reject(err);
      });
      req.on("timeout", () => {
        console.error("[Messaging-Test]   request timed out after", config.requestTimeout, "ms");
        console.log("[Messaging-Test] ── Test message END (timeout) ──");
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
    console.error("[Messaging-Test]   catch error:", msg);
    if (err instanceof Error && err.stack) {
      console.error("[Messaging-Test]   stack:", err.stack);
    }
    return NextResponse.json({ error: `Connection test failed: ${msg}` }, { status: 502 });
  }
}

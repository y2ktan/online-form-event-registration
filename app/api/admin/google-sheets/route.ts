import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { encryptKey, decryptKey } from "@/lib/google-sheets-crypto";
import { getSheetsClientFromKey, testSheetAccess } from "@/lib/google-sheets";

// GET — fetch global Google Sheets credential (masked)
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`gsheets:${ip}`);
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const cred = await prisma.googleSheetsCredential.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!cred) return NextResponse.json(null);

    return NextResponse.json({
      id: cred.id,
      enabled: cred.enabled,
      serviceAccountEmail: cred.serviceAccountEmail,
      serviceAccountKey: cred.serviceAccountKey ? "••••••••" : "",
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch credential." }, { status: 500 });
  }
}

// POST — save/update global Google Sheets credential
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`gsheets:${ip}`, true);
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const enabled = Boolean(body.enabled);
    const rawKey = body.serviceAccountKey || "";

    // Validate the JSON key if a new one is provided (not masked placeholder)
    let serviceAccountEmail = "";
    let encryptedKey = "";

    if (rawKey && rawKey !== "••••••••") {
      try {
        const parsed = JSON.parse(rawKey);
        if (!parsed.client_email || !parsed.private_key) {
          return NextResponse.json(
            { error: "Invalid service account JSON. Must contain client_email and private_key." },
            { status: 400 },
          );
        }
        serviceAccountEmail = parsed.client_email;
        encryptedKey = encryptKey(rawKey);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON format. Please upload a valid service account key file." },
          { status: 400 },
        );
      }
    }

    const existing = await prisma.googleSheetsCredential.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const data: Record<string, unknown> = { enabled };
    if (encryptedKey) {
      data.serviceAccountEmail = serviceAccountEmail;
      data.serviceAccountKey = encryptedKey;
    }

    let cred;
    if (existing) {
      cred = await prisma.googleSheetsCredential.update({
        where: { id: existing.id },
        data,
      });
    } else {
      if (!encryptedKey) {
        return NextResponse.json(
          { error: "Service account JSON key is required." },
          { status: 400 },
        );
      }
      cred = await prisma.googleSheetsCredential.create({
        data: {
          enabled,
          serviceAccountEmail,
          serviceAccountKey: encryptedKey,
        },
      });
    }

    await logAudit({
      userId: session.userId,
      action: "GOOGLE_SHEETS_CREDENTIAL_UPDATED",
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({
      id: cred.id,
      enabled: cred.enabled,
      serviceAccountEmail: cred.serviceAccountEmail,
      serviceAccountKey: cred.serviceAccountKey ? "••••••••" : "",
    });
  } catch (err) {
    console.error("Google Sheets credential save error:", err);
    return NextResponse.json({ error: "Failed to save credential." }, { status: 500 });
  }
}

// PUT — test credential (read-only: validate auth + optionally test a specific spreadsheet)
export async function PUT(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`gsheets-test:${ip}`, true);
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const cred = await prisma.googleSheetsCredential.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!cred || !cred.serviceAccountKey) {
      return NextResponse.json(
        { error: "No credential configured. Save a service account key first." },
        { status: 400 },
      );
    }

    const keyJson = decryptKey(cred.serviceAccountKey);
    const sheets = getSheetsClientFromKey(keyJson);

    const body = await request.json().catch(() => ({}));
    const spreadsheetId = (body.spreadsheetId || "").trim();

    if (spreadsheetId) {
      const result = await testSheetAccess(sheets, spreadsheetId);
      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Connected to "${result.title}".`,
        });
      } else {
        return NextResponse.json(
          { error: `Cannot access spreadsheet: ${result.error}` },
          { status: 400 },
        );
      }
    }

    // Credential is valid — return the stored service account email directly
    return NextResponse.json({
      success: true,
      message: `Credential valid for ${cred.serviceAccountEmail}.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Test failed: ${msg}` }, { status: 502 });
  }
}

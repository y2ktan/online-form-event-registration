import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitize } from "@/lib/sanitize";
import {
  getMessagingConfig,
  sendMessage,
  sendBulk,
  buildQrEditMessage,
  buildReminderMessage,
  buildCustomMessage,
} from "@/lib/messaging";

/**
 * POST /api/forms/[id]/messaging
 *
 * Actions:
 *   resend       — resend QR + edit link to a specific response
 *   reminder     — send reminder to all registered users who haven't submitted
 *   bulkReminder — send reminder to ALL registered users
 *   custom       — send a custom message to all users who HAVE submitted
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: formId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`messaging-action:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const config = await getMessagingConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Messaging is not configured or disabled. Go to Admin → Messaging Settings." },
      { status: 400 },
    );
  }

  const body = await request.json();
  const action: string = body.action;
  const origin =
    request.headers.get("origin") ||
    request.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
    "";

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: { id: true, title: true, shortCode: true },
  });
  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  // ── resend: send QR + edit link to a single response ──────────────────────
  if (action === "resend") {
    const responseId: string = body.responseId;
    if (!responseId) {
      return NextResponse.json({ error: "responseId is required." }, { status: 400 });
    }

    const resp = await prisma.response.findUnique({
      where: { id: responseId },
      select: { id: true, phoneNumber: true, shortCode: true, editToken: true, formId: true },
    });
    if (!resp || resp.formId !== formId) {
      return NextResponse.json({ error: "Response not found." }, { status: 404 });
    }
    if (!resp.phoneNumber) {
      return NextResponse.json({ error: "Response has no phone number." }, { status: 400 });
    }

    const editLink = `${origin}/edit/${resp.id}?token=${resp.editToken}`;
    const content = buildQrEditMessage(form.title, resp.shortCode, editLink);
    const result = await sendMessage(config, content, [resp.phoneNumber]);

    return NextResponse.json({
      success: result.success,
      message: result.success ? "Message sent." : `Send failed: ${result.error || result.body}`,
    });
  }

  // ── bulkResend: send QR + edit link to ALL respondents ─────────────────────
  if (action === "bulkResend") {
    const responses = await prisma.response.findMany({
      where: { formId, phoneNumber: { not: null } },
      select: { id: true, phoneNumber: true, shortCode: true, editToken: true },
    });
    const withPhone = responses.filter((r) => r.phoneNumber);
    if (!withPhone.length) {
      return NextResponse.json({ success: true, message: "No respondents with phone numbers found.", sent: 0, failed: 0 });
    }

    const customTpl = typeof body.message === "string" ? body.message.trim() : "";
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < withPhone.length; i += 5) {
      const batch = withPhone.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((r) => {
          const editLink = `${origin}/edit/${r.id}?token=${r.editToken}`;
          const qrLink = form.shortCode ? `${origin}/f/${form.shortCode}` : `${origin}/form/${formId}`;
          const content = customTpl
            ? `\u2705 *${form.title}*\n\n${customTpl.replace(/\{shortCode\}/g, r.shortCode).replace(/\{editLink\}/g, editLink).replace(/\{qrLink\}/g, qrLink)}`
            : buildQrEditMessage(form.title, r.shortCode, editLink);
          return sendMessage(config, content, [r.phoneNumber!]);
        }),
      );
      for (const res of results) {
        if (res.status === "fulfilled" && res.value.success) sent++;
        else failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sent}/${withPhone.length}, ${failed} failed.`,
      total: withPhone.length, sent, failed,
    });
  }

  // ── reminder: non-submitters only ─────────────────────────────────────────
  if (action === "reminder") {
    const phones = await getNonSubmitterPhones(formId);
    if (!phones.length) {
      return NextResponse.json({ success: true, message: "No non-submitters with phone numbers found.", sent: 0, failed: 0 });
    }

    const formLink = form.shortCode
      ? `${origin}/f/${form.shortCode}`
      : `${origin}/form/${formId}`;
    const customTpl = typeof body.message === "string" ? body.message.trim() : "";
    const content = customTpl
      ? `\uD83D\uDCCB *Reminder: ${form.title}*\n\n${customTpl.replace(/\{formLink\}/g, formLink)}`
      : buildReminderMessage(form.title, formLink);
    const result = await sendBulk(config, content, phones);

    return NextResponse.json({
      success: true,
      message: `Sent ${result.sent}/${result.total}, ${result.failed} failed.`,
      ...result,
    });
  }

  // ── bulkReminder: ALL registered users ────────────────────────────────────
  if (action === "bulkReminder") {
    const phones = await getAllRegisteredPhones(formId);
    if (!phones.length) {
      return NextResponse.json({ success: true, message: "No registered users with phone numbers found.", sent: 0, failed: 0 });
    }

    const formLink = form.shortCode
      ? `${origin}/f/${form.shortCode}`
      : `${origin}/form/${formId}`;
    const customTpl = typeof body.message === "string" ? body.message.trim() : "";
    const content = customTpl
      ? `\uD83D\uDCCB *Reminder: ${form.title}*\n\n${customTpl.replace(/\{formLink\}/g, formLink)}`
      : buildReminderMessage(form.title, formLink);
    const result = await sendBulk(config, content, phones);

    return NextResponse.json({
      success: true,
      message: `Sent ${result.sent}/${result.total}, ${result.failed} failed.`,
      ...result,
    });
  }

  // ── custom: custom message to submitted users ─────────────────────────────
  if (action === "custom") {
    const customText = sanitize(body.message || "").trim();
    if (!customText) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    const responses = await prisma.response.findMany({
      where: { formId, phoneNumber: { not: null } },
      select: { phoneNumber: true },
    });
    const phones = responses
      .map((r) => r.phoneNumber)
      .filter((p): p is string => !!p);

    if (!phones.length) {
      return NextResponse.json({ success: true, message: "No submitted users with phone numbers found.", sent: 0, failed: 0 });
    }

    const content = buildCustomMessage(form.title, customText);
    const result = await sendBulk(config, content, phones);

    return NextResponse.json({
      success: true,
      message: `Sent ${result.sent}/${result.total}, ${result.failed} failed.`,
      ...result,
    });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ─── Helper: get phone numbers of registered users who haven't submitted ─────

async function getNonSubmitterPhones(formId: string): Promise<string[]> {
  try {
    const regData = await (prisma as any).registeredUserData.findUnique({
      where: { formId },
    });
    if (!regData) return [];

    const headers: string[] = JSON.parse(regData.headers);
    const rows: Record<string, string>[] = JSON.parse(regData.rows);
    const lookupCol = regData.lookupColumn;
    const lookupQid = regData.lookupQuestionId;

    if (!lookupCol || !lookupQid) return [];

    // Find which registered users already submitted
    const answers = await prisma.answer.findMany({
      where: { questionId: lookupQid, response: { formId } },
      select: { value: true },
    });
    const respondedValues = new Set(
      answers.map((a) => a.value.trim().toLowerCase()),
    );

    // Find phone column — look for header containing "phone" or "hp" or "tel"
    const phoneCol = headers.find((h) =>
      /phone|hp|handphone|tel|mobile|whatsapp|wa/i.test(h),
    );
    if (!phoneCol) return [];

    // Collect phones of non-submitters
    return rows
      .filter((row) => {
        const lookupVal = String(row[lookupCol] ?? "").trim().toLowerCase();
        return lookupVal && !respondedValues.has(lookupVal);
      })
      .map((row) => String(row[phoneCol] ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Helper: get all registered user phones ──────────────────────────────────

async function getAllRegisteredPhones(formId: string): Promise<string[]> {
  try {
    const regData = await (prisma as any).registeredUserData.findUnique({
      where: { formId },
    });
    if (!regData) return [];

    const headers: string[] = JSON.parse(regData.headers);
    const rows: Record<string, string>[] = JSON.parse(regData.rows);

    const phoneCol = headers.find((h) =>
      /phone|hp|handphone|tel|mobile|whatsapp|wa/i.test(h),
    );
    if (!phoneCol) return [];

    return rows
      .map((row) => String(row[phoneCol] ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

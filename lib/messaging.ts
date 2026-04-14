/**
 * Shared WhatsApp / messaging helpers.
 *
 * sendMessage     — sends a single message via the configured provider
 * sendBulk        — sends to multiple recipients (batched, fire-and-forget safe)
 * buildQrEditMsg  — compose the standard QR + edit-link message body
 * getMessagingConfig — fetch global config (cached per request)
 */

import { prisma } from "@/lib/prisma";
import https from "https";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessagingConfig {
  id: string;
  enabled: boolean;
  provider: string;
  apiBaseUrl: string;
  apiPort: number;
  apiPath: string;
  tokenId: string;
  sender: string;
  requestTimeout: number;
  maxRetries: number;
  tlsVerify: boolean;
}

export interface SendResult {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Fetches the global messaging config. Returns null if not configured/enabled. */
export async function getMessagingConfig(): Promise<MessagingConfig | null> {
  try {
    const config = await prisma.messagingConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!config || !config.enabled || !config.apiBaseUrl || !config.tokenId) {
      return null;
    }
    return config as MessagingConfig;
  } catch {
    return null;
  }
}

// ─── Low-level send ───────────────────────────────────────────────────────────

/** Send a single message to one or more recipients using the TzuChi WABI binary protocol. */
export async function sendMessage(
  config: MessagingConfig,
  content: string,
  recipients: string[],
): Promise<SendResult> {
  if (!recipients.length || !content) {
    return { success: false, error: "No recipients or empty content" };
  }

  const messageData = {
    tokenId: config.tokenId,
    sender: config.sender,
    message: { content },
    recipients,
  };

  const jsonString = JSON.stringify(messageData);
  const jsonBuffer = Buffer.from(jsonString, "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(jsonBuffer.byteLength, 0);
  const binaryPayload = Buffer.concat([lengthBuffer, jsonBuffer]);

  let hostname: string;
  let basePath = "";
  try {
    const parsed = new URL(config.apiBaseUrl);
    hostname = parsed.hostname;
    basePath = parsed.pathname.replace(/\/$/, ""); // strip trailing slash
  } catch {
    hostname = config.apiBaseUrl.replace(/^https?:\/\//, "").split("/")[0];
  }
  const fullPath = basePath + config.apiPath;

  console.log("[Messaging] ── sendMessage START ──");
  console.log("[Messaging]   hostname:", hostname);
  console.log("[Messaging]   port:", config.apiPort);
  console.log("[Messaging]   path:", fullPath);
  console.log("[Messaging]   sender:", config.sender);
  console.log("[Messaging]   recipients:", recipients);
  console.log("[Messaging]   tlsVerify:", config.tlsVerify);
  console.log("[Messaging]   timeout:", config.requestTimeout);
  console.log("[Messaging]   payload length:", jsonBuffer.byteLength, "bytes");
  console.log("[Messaging]   payload JSON:", jsonString);

  return new Promise<SendResult>((resolve) => {
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
        console.log("[Messaging]   response statusCode:", res.statusCode);
        console.log("[Messaging]   response headers:", JSON.stringify(res.headers));
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => {
          console.log("[Messaging]   response body:", data);
          console.log("[Messaging] ── sendMessage END (status", res.statusCode, ") ──");
          resolve({
            success: res.statusCode === 200,
            status: res.statusCode ?? 0,
            body: data,
          });
        });
      },
    );
    req.on("error", (err) => {
      console.error("[Messaging]   request error:", err.message);
      console.error("[Messaging]   error code:", (err as NodeJS.ErrnoException).code);
      console.log("[Messaging] ── sendMessage END (error) ──");
      resolve({ success: false, error: err.message });
    });
    req.on("timeout", () => {
      console.error("[Messaging]   request timed out after", config.requestTimeout, "ms");
      console.log("[Messaging] ── sendMessage END (timeout) ──");
      req.destroy();
      resolve({ success: false, error: "Request timed out" });
    });
    req.write(binaryPayload);
    req.end();
  });
}

// ─── Bulk send (fire-and-forget safe, bounded concurrency) ────────────────────

const MAX_CONCURRENCY = 5;

/** Send a message to many phone numbers in parallel batches. Returns per-recipient results. */
export async function sendBulk(
  config: MessagingConfig,
  content: string,
  phoneNumbers: string[],
): Promise<{ total: number; sent: number; failed: number }> {
  const unique = [...new Set(phoneNumbers.filter(Boolean))];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < unique.length; i += MAX_CONCURRENCY) {
    const batch = unique.slice(i, i + MAX_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((phone) => sendMessage(config, content, [phone])),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.success) sent++;
      else failed++;
    }
  }

  return { total: unique.length, sent, failed };
}

// ─── Message builders ─────────────────────────────────────────────────────────

/** Build the standard QR code + edit link WhatsApp message. */
export function buildQrEditMessage(
  formTitle: string,
  shortCode: string,
  editLink: string,
): string {
  const qrPageUrl = editLink.replace(/\/edit\//, "/f/").replace(/\?token=.*$/, "").replace(/\/[^/]+$/, `/${shortCode}`);
  return [
    `✅ *${formTitle}*`,
    ``,
    `Your submission ID: *${shortCode}*`,
    ``,
    `📱 View your QR code:`,
    qrPageUrl,
    ``,
    `✏️ Edit your response:`,
    editLink,
    ``,
    `Please keep this message for your reference.`,
  ].join("\n");
}

/** Build a reminder message for users who haven't submitted yet. */
export function buildReminderMessage(
  formTitle: string,
  formLink: string,
): string {
  return [
    `📋 *Reminder: ${formTitle}*`,
    ``,
    `You have not yet submitted your response for this form.`,
    ``,
    `🔗 Submit now:`,
    formLink,
    ``,
    `Thank you for your cooperation.`,
  ].join("\n");
}

/** Build a custom engagement message. */
export function buildCustomMessage(
  formTitle: string,
  customText: string,
): string {
  return [
    `📢 *${formTitle}*`,
    ``,
    customText,
  ].join("\n");
}

// ─── Fire-and-forget helper for use in API routes ─────────────────────────────

/**
 * Send a WhatsApp message without blocking the API response.
 * Logs errors to console but never throws.
 */
export function fireAndForgetMessage(
  content: string,
  recipients: string[],
): void {
  (async () => {
    try {
      const config = await getMessagingConfig();
      if (!config) return;
      const result = await sendMessage(config, content, recipients);
      if (!result.success) {
        console.error("[Messaging] Send failed:", result.error || result.body);
      }
    } catch (err) {
      console.error("[Messaging] Fire-and-forget error:", err);
    }
  })();
}

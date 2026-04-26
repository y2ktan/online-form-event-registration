/**
 * Shared WhatsApp / messaging helpers.
 *
 * sendConfirmation         — sends confirmation via TC_WA REST API
 * uploadWaMedia            — uploads media via TC_WA REST API
 * deleteWaMedia            — deletes media via TC_WA REST API
 * fireAndForgetConfirmation — async non-blocking wrapper
 * getMessagingConfig       — fetch global config (cached per request)
 */

import { prisma } from "@/lib/prisma";
import { decryptKey } from "@/lib/google-sheets-crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessagingConfig {
  id: string;
  enabled: boolean;
  // TC_WA REST API fields
  waApiEnabled: boolean;
  waApiBaseUrl: string;
  waApiPort: number;
  waApiBearerToken: string; // decrypted at runtime
}

export interface SendResult {
  success: boolean;
  status?: number;
  body?: string;
  error?: string;
}

export interface ConfirmationRecipient {
  to: string;
  name: string;
}

const REQUEST_TIMEOUT = 30000; // ms

// ─── Config ───────────────────────────────────────────────────────────────────

/** Fetches the global messaging config. Returns null if not configured/enabled. */
export async function getMessagingConfig(): Promise<MessagingConfig | null> {
  try {
    const config = await prisma.messagingConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!config || !config.enabled || !config.waApiEnabled || !config.waApiBearerToken) {
      return null;
    }
    // Decrypt WA API bearer token
    let bearerToken = "";
    try {
      bearerToken = decryptKey(config.waApiBearerToken).replace(/^Bearer\s+/i, "").trim();
    } catch {
      console.error("[Messaging] Failed to decrypt WA API bearer token");
      return null;
    }
    return {
      ...config,
      waApiBearerToken: bearerToken,
    } as MessagingConfig;
  } catch {
    return null;
  }
}

// ─── TC_WA REST API: send-confirmation ────────────────────────────────────────

/** Build the base URL for the TC_WA REST API. */
function waApiUrl(config: MessagingConfig, path: string): string {
  const base = config.waApiBaseUrl.replace(/\/$/, "");
  const proto = base.startsWith("http") ? "" : "http://";
  return `${proto}${base}:${config.waApiPort}${path}`;
}

/**
 * Send a WhatsApp confirmation via the TC_WA REST API.
 * POST /api/confirmation/send-confirmation
 */
export async function sendConfirmation(
  config: MessagingConfig,
  recipients: ConfirmationRecipient[],
  templateNumber: number,
  confirmationUrl: string,
  headerMediaId?: string | null,
  events?: string[],
): Promise<SendResult> {
  if (!recipients.length) {
    return { success: false, error: "No recipients" };
  }

  const url = waApiUrl(config, "/api/confirmation/send-confirmation");
  const payload: Record<string, unknown> = {
    recipients,
    templateNumber,
    confirmationUrl,
  };
  if (headerMediaId) payload.headerMediaId = headerMediaId;
  if (events?.length) payload.events = events;

  console.log("[WA-API] ── sendConfirmation START ──");
  console.log("[WA-API]   url:", url);
  console.log("[WA-API]   bearer length:", config.waApiBearerToken.length);
  console.log("[WA-API]   bearer first20:", config.waApiBearerToken.slice(0, 20));
  console.log("[WA-API]   bearer last20:", config.waApiBearerToken.slice(-20));
  console.log("[WA-API]   bearer has whitespace:", /\s/.test(config.waApiBearerToken));
  console.log("[WA-API]   recipients:", recipients.length);
  console.log("[WA-API]   templateNumber:", templateNumber);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.waApiBearerToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    const body = await res.text();
    console.log("[WA-API]   status:", res.status);
    console.log("[WA-API]   body:", body);
    console.log("[WA-API] ── sendConfirmation END ──");
    return { success: res.ok, status: res.status, body };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WA-API]   error:", msg);
    console.log("[WA-API] ── sendConfirmation END (error) ──");
    return { success: false, error: msg };
  }
}

/**
 * Upload media to the TC_WA REST API.
 * POST /api/media/upload (multipart/form-data)
 * Returns the media ID from the response.
 */
export async function uploadWaMedia(
  config: MessagingConfig,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  const url = waApiUrl(config, "/api/media/upload");

  const formData = new FormData();
  const fileArrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
  new Uint8Array(fileArrayBuffer).set(fileBuffer);
  const blob = new Blob([fileArrayBuffer], { type: mimeType });
  formData.append("files", blob, filename);

  console.log("[WA-API] ── uploadMedia START ──");
  console.log("[WA-API]   url:", url);
  console.log("[WA-API]   filename:", filename);
  console.log("[WA-API]   size:", fileBuffer.length);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.waApiBearerToken}`,
      },
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.text();
    console.log("[WA-API]   status:", res.status);
    console.log("[WA-API]   body:", body);
    console.log("[WA-API] ── uploadMedia END ──");

    if (!res.ok) {
      return { success: false, error: `Upload failed (${res.status}): ${body}` };
    }
    const data = JSON.parse(body);
    const mediaId = data?.results?.[0]?.id;
    if (!mediaId) {
      return { success: false, error: "No media ID in response" };
    }
    return { success: true, mediaId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WA-API]   error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Delete media from the TC_WA REST API.
 * DELETE /api/media/{id}
 */
export async function deleteWaMedia(
  config: MessagingConfig,
  mediaId: string,
): Promise<{ success: boolean; status?: number; error?: string }> {
  const url = waApiUrl(config, `/api/media/${encodeURIComponent(mediaId)}`);

  console.log("[WA-API] ── deleteMedia START ──");
  console.log("[WA-API]   url:", url);

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.waApiBearerToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    const body = await res.text();
    console.log("[WA-API]   status:", res.status);
    console.log("[WA-API]   body:", body);
    console.log("[WA-API] ── deleteMedia END ──");
    if (!res.ok) {
      return { success: false, status: res.status, error: `Delete failed (${res.status}): ${body}` };
    }
    return { success: true, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WA-API]   error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Fire-and-forget: send confirmation without blocking the API response.
 */
export function fireAndForgetConfirmation(
  recipients: ConfirmationRecipient[],
  templateNumber: number,
  confirmationUrl: string,
  headerMediaId?: string | null,
  events?: string[],
): void {
  (async () => {
    try {
      const config = await getMessagingConfig();
      if (!config || !config.waApiEnabled || !config.waApiBearerToken) return;
      const result = await sendConfirmation(config, recipients, templateNumber, confirmationUrl, headerMediaId, events);
      if (!result.success) {
        console.error("[WA-API] Confirmation send failed:", result.error || result.body);
      }
    } catch (err) {
      console.error("[WA-API] Fire-and-forget confirmation error:", err);
    }
  })();
}

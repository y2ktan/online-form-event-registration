/**
 * Pure helpers for submission notification emails.
 *
 * parseNotifyEmails — O(n) where n = string length.
 * buildNotificationHtml — O(A) where A = number of answers.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse and validate a comma-separated email string. Returns only valid emails. */
export function parseNotifyEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => EMAIL_RE.test(e));
}

export interface NotificationAnswer {
  label: string;
  value: string;
  type: string;
}

/** Build an HTML email body for a new submission notification. */
export function buildNotificationHtml(
  formTitle: string,
  shortCode: string,
  phoneNumber: string | null,
  answers: NotificationAnswer[],
  formUrl?: string,
): string {
  const answerRows = answers
    .map(
      (a) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-weight:500">${esc(a.label)}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563">${esc(formatValue(a.value, a.type))}</td></tr>`
    )
    .join("");

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827">
  <h2 style="color:#4f46e5">New Submission</h2>
  <p>A new response was submitted to <strong>${esc(formTitle)}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f9fafb"><td style="padding:6px 12px;font-weight:600;color:#374151">Submission ID</td><td style="padding:6px 12px;font-family:monospace;letter-spacing:2px;color:#4f46e5;font-weight:700">${esc(shortCode)}</td></tr>
    ${phoneNumber ? `<tr><td style="padding:6px 12px;font-weight:600;color:#374151">Phone</td><td style="padding:6px 12px;color:#4b5563">${esc(phoneNumber)}</td></tr>` : ""}
    ${answerRows}
  </table>
  ${formUrl ? `<p><a href="${esc(formUrl)}" style="color:#4f46e5">View in dashboard</a></p>` : ""}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px">This is an automated notification from Form Builder.</p>
</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatValue(value: string, type: string): string {
  if (!value) return "—";
  if (type === "CHECKBOX") {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) ? arr.join(", ") : value;
    } catch {
      return value;
    }
  }
  if (type === "MULTIPLE_CHOICE_GRID" || type === "CHECKBOX_GRID") {
    try {
      const obj = JSON.parse(value);
      if (typeof obj === "object" && obj !== null) {
        return Object.entries(obj)
          .map(([row, val]) => `${row}: ${val}`)
          .join(", ");
      }
    } catch {
      return value;
    }
  }
  return value;
}

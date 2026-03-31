/**
 * WCAG-compliant value masking for auto-filled profile fields.
 * Uses fixed-length masking to prevent length-based guessing.
 */

export function maskValue(value: string): string {
  if (!value) return value;
  const len = value.length;
  if (len <= 2) return "*".repeat(len);

  // Check for email pattern
  if (value.includes("@")) {
    const atIdx = value.indexOf("@");
    const local = value.slice(0, atIdx);
    const domain = value.slice(atIdx);
    if (local.length <= 2) return "*".repeat(local.length) + domain;
    return local[0] + "*".repeat(Math.min(local.length - 1, 5)) + domain;
  }

  // Default: show first and last character, mask middle with fixed length
  return value[0] + "*".repeat(Math.min(len - 2, 6)) + value[len - 1];
}

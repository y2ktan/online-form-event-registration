import { prisma } from "./prisma";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generates a unique 6-character alphanumeric short code for a form.
 * Retries if a collision occurs.
 */
export async function generateFormShortCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }

    const existing = await prisma.form.findFirst({
      where: { shortCode: code },
    });

    if (!existing) {
      return code;
    }

    attempts++;
  }

  throw new Error("Failed to generate a unique form short code after multiple attempts.");
}

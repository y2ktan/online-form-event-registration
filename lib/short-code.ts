import { prisma } from "./prisma";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generates a unique 6-character alphanumeric short code for a specific form.
 * Retries if a collision occurs within the same formId.
 */
export async function generateShortCode(formId: string): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }

    // Check for collision within the same form
    const existing = await prisma.response.findFirst({
      where: {
        formId: formId,
        shortCode: code,
      },
    });

    if (!existing) {
      return code;
    }

    attempts++;
  }

  throw new Error("Failed to generate a unique short code after multiple attempts.");
}

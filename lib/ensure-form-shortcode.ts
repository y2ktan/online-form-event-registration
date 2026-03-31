import { prisma } from "./prisma";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

let ensured = false;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

/**
 * Ensures the shortCode column exists on the Form table and backfills
 * any forms that are missing a short code.
 */
export async function ensureFormShortCodes() {
  if (ensured) return;
  try {
    // Add column if it doesn't exist (SQLite will throw if it already exists)
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Form" ADD COLUMN "shortCode" TEXT;`
      );
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Form_shortCode_key" ON "Form"("shortCode");`
      );
    } catch (_) {
      /* column already exists */
    }

    // Backfill forms without a short code
    const formsWithout: Array<{ id: string }> = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "Form" WHERE "shortCode" IS NULL;`
    );

    for (const f of formsWithout) {
      let code = randomCode();
      let attempts = 0;
      while (attempts < 10) {
        const existing: Array<{ id: string }> = await prisma.$queryRawUnsafe(
          `SELECT "id" FROM "Form" WHERE "shortCode" = ?;`,
          code
        );
        if (existing.length === 0) break;
        code = randomCode();
        attempts++;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "Form" SET "shortCode" = ? WHERE "id" = ?;`,
        code,
        f.id
      );
    }

    ensured = true;
    if (formsWithout.length > 0) {
      console.log(`[API] Backfilled short codes for ${formsWithout.length} form(s).`);
    }
  } catch (err) {
    console.error("[API] Failed to ensure form short codes:", err);
  }
}

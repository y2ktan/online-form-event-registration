import { prisma } from "@/lib/prisma";

let tableEnsured = false;

export async function ensureRegisteredUserDataTable() {
  if (tableEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RegisteredUserData" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "formId" TEXT NOT NULL,
        "headers" TEXT NOT NULL DEFAULT '[]',
        "rows" TEXT NOT NULL DEFAULT '[]',
        "lookupColumn" TEXT NOT NULL DEFAULT '',
        "lookupQuestionId" TEXT NOT NULL DEFAULT '',
        "secondaryLookupColumn" TEXT NOT NULL DEFAULT '',
        "secondaryLookupQuestionId" TEXT NOT NULL DEFAULT '',
        "mappings" TEXT NOT NULL DEFAULT '{}',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RegisteredUserData_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    // Add new columns to existing tables (safe: SQLite ignores if column exists)
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "RegisteredUserData" ADD COLUMN "secondaryLookupColumn" TEXT NOT NULL DEFAULT '';`);
    } catch (_) { /* column already exists */ }
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "RegisteredUserData" ADD COLUMN "secondaryLookupQuestionId" TEXT NOT NULL DEFAULT '';`);
    } catch (_) { /* column already exists */ }
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredUserData_formId_key" ON "RegisteredUserData"("formId");
    `);
    tableEnsured = true;
    console.log("[API] RegisteredUserData table ensured.");
  } catch (err) {
    console.error("[API] Failed to ensure RegisteredUserData table:", err);
  }
}

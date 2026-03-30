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
        "mappings" TEXT NOT NULL DEFAULT '{}',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RegisteredUserData_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredUserData_formId_key" ON "RegisteredUserData"("formId");
    `);
    tableEnsured = true;
    console.log("[API] RegisteredUserData table ensured.");
  } catch (err) {
    console.error("[API] Failed to ensure RegisteredUserData table:", err);
  }
}

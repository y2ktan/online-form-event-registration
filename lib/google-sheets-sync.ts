/**
 * Google Sheets background sync processor.
 *
 * processPendingSyncs — picks up dirty forms and syncs them to Google Sheets.
 * Called by the cron endpoint or dev-mode interval.
 */

import { prisma } from "@/lib/prisma";
import {
  getGoogleSheetsClient,
  syncFormToSheet,
  isCircuitBroken,
  type SyncResult,
} from "@/lib/google-sheets";

const MAX_CONCURRENT = 2;

/** Process all forms that need syncing. Returns summary. */
export async function processPendingSyncs(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  // Find forms needing sync:
  // enabled, has pending sync, and pendingSyncAt > lastSyncedAt (or never synced)
  const dirtyForms = await prisma.googleSheetsSync.findMany({
    where: {
      enabled: true,
      pendingSyncAt: { not: null },
      OR: [
        { lastSyncedAt: null },
        // SQLite doesn't support field comparison in where, so we fetch and filter
      ],
    },
    orderBy: { pendingSyncAt: "asc" },
    take: MAX_CONCURRENT * 2, // fetch a few extra in case some are circuit-broken
  });

  // Filter: pendingSyncAt > lastSyncedAt, and not circuit-broken
  const toSync = dirtyForms
    .filter((f) => {
      if (isCircuitBroken(f.failureCount)) return false;
      if (!f.pendingSyncAt) return false;
      if (!f.lastSyncedAt) return true;
      return f.pendingSyncAt > f.lastSyncedAt;
    })
    .slice(0, MAX_CONCURRENT);

  if (toSync.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  // Process concurrently (bounded)
  const results = await Promise.allSettled(
    toSync.map(async (syncConfig) => {
      const version = syncConfig.syncVersion;
      console.log(
        `[GoogleSheets-Sync] Starting sync for form=${syncConfig.formId} v${version}`,
      );

      let result: SyncResult;
      try {
        result = await syncFormToSheet(
          syncConfig.formId,
          sheets,
          syncConfig.spreadsheetId,
          syncConfig.sheetName,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        result = { success: false, rowCount: 0, apiCalls: 0, durationMs: 0, error: msg };
      }

      // Log the sync attempt
      try {
        await prisma.googleSheetsSyncLog.create({
          data: {
            formId: syncConfig.formId,
            syncVersion: version,
            success: result.success,
            rowCount: result.rowCount,
            durationMs: result.durationMs,
            apiCalls: result.apiCalls,
            error: result.error || null,
          },
        });
      } catch {
        // Don't fail the sync if logging fails
      }

      if (result.success) {
        await prisma.googleSheetsSync.update({
          where: { id: syncConfig.id },
          data: {
            lastSyncedAt: new Date(),
            pendingSyncAt: null,
            lastError: null,
            failureCount: 0,
            rowsSynced: result.rowCount,
          },
        });
        console.log(
          `[GoogleSheets-Sync] OK form=${syncConfig.formId} rows=${result.rowCount} dur=${result.durationMs}ms api=${result.apiCalls}`,
        );
      } else {
        await prisma.googleSheetsSync.update({
          where: { id: syncConfig.id },
          data: {
            lastError: result.error || "Unknown error",
            failureCount: { increment: 1 },
          },
        });
        console.error(
          `[GoogleSheets-Sync] FAIL form=${syncConfig.formId} err=${result.error}`,
        );
      }

      return result;
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.success) succeeded++;
    else failed++;
  }

  // Prune old sync logs (keep last 50 per form)
  try {
    const formIds = [...new Set(toSync.map((f) => f.formId))];
    for (const fid of formIds) {
      const logs = await prisma.googleSheetsSyncLog.findMany({
        where: { formId: fid },
        orderBy: { createdAt: "desc" },
        skip: 50,
        select: { id: true },
      });
      if (logs.length > 0) {
        await prisma.googleSheetsSyncLog.deleteMany({
          where: { id: { in: logs.map((l) => l.id) } },
        });
      }
    }
  } catch {
    // Non-critical
  }

  return { processed: toSync.length, succeeded, failed };
}

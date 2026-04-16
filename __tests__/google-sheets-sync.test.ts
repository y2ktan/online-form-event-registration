import { beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const prisma = {
    googleSheetsSync: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    googleSheetsSyncLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const getGoogleSheetsClient = vi.fn();
  const syncFormToSheet = vi.fn();
  const isCircuitBroken = vi.fn((count: number) => count >= 5);

  return { prisma, getGoogleSheetsClient, syncFormToSheet, isCircuitBroken };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mocked.prisma,
}));

vi.mock("@/lib/google-sheets", () => ({
  getGoogleSheetsClient: mocked.getGoogleSheetsClient,
  syncFormToSheet: mocked.syncFormToSheet,
  isCircuitBroken: mocked.isCircuitBroken,
}));

import { processPendingSyncs } from "../lib/google-sheets-sync";

describe("processPendingSyncs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.prisma.googleSheetsSyncLog.findMany.mockResolvedValue([]);
    mocked.prisma.googleSheetsSyncLog.deleteMany.mockResolvedValue({ count: 0 });
    mocked.prisma.googleSheetsSyncLog.create.mockResolvedValue({});
    mocked.prisma.googleSheetsSync.update.mockResolvedValue({});
  });

  test("returns zero summary when Google credential/client is unavailable", async () => {
    mocked.getGoogleSheetsClient.mockResolvedValue(null);

    const result = await processPendingSyncs();

    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(mocked.prisma.googleSheetsSync.findMany).not.toHaveBeenCalled();
  });

  test("syncs eligible forms, skips circuit-broken, and records results", async () => {
    mocked.getGoogleSheetsClient.mockResolvedValue({ client: "fake" });

    const now = new Date("2026-04-16T10:00:00.000Z");
    mocked.prisma.googleSheetsSync.findMany.mockResolvedValue([
      {
        id: "s1",
        formId: "f1",
        enabled: true,
        spreadsheetId: "sheet1",
        sheetName: "Sheet1",
        lastSyncedAt: null,
        pendingSyncAt: now,
        syncVersion: 3,
        failureCount: 0,
      },
      {
        id: "s2",
        formId: "f2",
        enabled: true,
        spreadsheetId: "sheet2",
        sheetName: "Sheet1",
        lastSyncedAt: new Date("2026-04-16T09:00:00.000Z"),
        pendingSyncAt: now,
        syncVersion: 7,
        failureCount: 1,
      },
      {
        id: "s3",
        formId: "f3",
        enabled: true,
        spreadsheetId: "sheet3",
        sheetName: "Sheet1",
        lastSyncedAt: null,
        pendingSyncAt: now,
        syncVersion: 2,
        failureCount: 5,
      },
    ]);

    mocked.syncFormToSheet.mockImplementation(async (formId: string) => {
      if (formId === "f1") {
        return { success: true, rowCount: 21, apiCalls: 3, durationMs: 42 };
      }
      return { success: false, rowCount: 0, apiCalls: 1, durationMs: 15, error: "quota" };
    });

    const result = await processPendingSyncs();

    expect(result).toEqual({ processed: 2, succeeded: 1, failed: 1 });
    expect(mocked.syncFormToSheet).toHaveBeenCalledTimes(2);
    expect(mocked.syncFormToSheet).toHaveBeenCalledWith("f1", expect.anything(), "sheet1", "Sheet1");
    expect(mocked.syncFormToSheet).toHaveBeenCalledWith("f2", expect.anything(), "sheet2", "Sheet1");

    expect(mocked.prisma.googleSheetsSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({
          pendingSyncAt: null,
          failureCount: 0,
          rowsSynced: 21,
        }),
      }),
    );

    expect(mocked.prisma.googleSheetsSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s2" },
        data: expect.objectContaining({
          lastError: "quota",
          failureCount: { increment: 1 },
        }),
      }),
    );

    expect(mocked.prisma.googleSheetsSyncLog.create).toHaveBeenCalledTimes(2);
    expect(mocked.isCircuitBroken).toHaveBeenCalledWith(5);
  });

  test("prunes old logs beyond the latest 50 entries", async () => {
    mocked.getGoogleSheetsClient.mockResolvedValue({ client: "fake" });

    mocked.prisma.googleSheetsSync.findMany.mockResolvedValue([
      {
        id: "s1",
        formId: "f1",
        enabled: true,
        spreadsheetId: "sheet1",
        sheetName: "Sheet1",
        lastSyncedAt: null,
        pendingSyncAt: new Date("2026-04-16T10:00:00.000Z"),
        syncVersion: 1,
        failureCount: 0,
      },
    ]);

    mocked.syncFormToSheet.mockResolvedValue({
      success: true,
      rowCount: 3,
      apiCalls: 1,
      durationMs: 10,
    });

    mocked.prisma.googleSheetsSyncLog.findMany.mockResolvedValue([
      { id: "log-1" },
      { id: "log-2" },
    ]);

    const result = await processPendingSyncs();

    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(mocked.prisma.googleSheetsSyncLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["log-1", "log-2"] } },
    });
  });
});

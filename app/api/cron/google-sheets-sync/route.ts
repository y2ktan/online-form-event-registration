import { NextRequest, NextResponse } from "next/server";
import { processPendingSyncs } from "@/lib/google-sheets-sync";

/**
 * GET /api/cron/google-sheets-sync
 *
 * Background sync worker — processes forms with pending Google Sheets sync.
 * Protected by a secret token passed as a query parameter or Authorization header.
 *
 * Call via cron job every 30 seconds:
 *   curl "https://your-domain/api/cron/google-sheets-sync?token=YOUR_SECRET"
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 500 });
  }

  const token =
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingSyncs();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Google Sheets sync cron error:", err);
    return NextResponse.json(
      { error: "Sync processing failed." },
      { status: 500 },
    );
  }
}

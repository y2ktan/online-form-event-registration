import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMessagingConfig, deleteWaMedia } from "@/lib/messaging";

/** DELETE: remove a media item from TC_WA */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`media-delete:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const config = await getMessagingConfig();
  if (!config || !config.waApiEnabled || !config.waApiBearerToken) {
    return NextResponse.json(
      { error: "WA API is not configured. Save configuration first." },
      { status: 400 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Media id is required." }, { status: 400 });
  }

  const result = await deleteWaMedia(config, id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

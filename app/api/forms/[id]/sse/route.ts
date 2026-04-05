import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, canEditForm } from "@/lib/auth";

// Required for Next.js App Router streaming responses
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events endpoint that emits `{"count": N}` whenever the
 * response count for a form changes.  The client uses this signal to
 * trigger a refetch of the full response list — the payload itself is
 * minimal so the stream stays lightweight.
 *
 * Auth: same canEditForm() check as the CSV export route.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: formId } = await params;

  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const hasAccess = await canEditForm(session.userId, session.role, formId);
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Stream ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let lastCount = -1;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // client already disconnected
        }
      };

      const check = async () => {
        try {
          const count = await prisma.response.count({
            where: { formId },
          });
          if (count !== lastCount) {
            lastCount = count;
            send(JSON.stringify({ count }));
          }
        } catch {
          // DB error — close stream gracefully
          if (intervalId) clearInterval(intervalId);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      // Send initial count immediately, then poll every 5 s
      void check();
      intervalId = setInterval(check, 5_000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        if (intervalId) clearInterval(intervalId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },

    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevent Vercel / nginx from buffering the stream
      "X-Accel-Buffering": "no",
    },
  });
}

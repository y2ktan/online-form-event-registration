import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, logAudit } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// DELETE a collaborator from a form (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: formId, userId } = await params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { allowed } = checkRateLimit(`collab:${ip}`, true);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const collab = await prisma.formCollaborator.findUnique({
      where: { userId_formId: { userId, formId } },
      include: { user: { select: { email: true } } },
    });

    if (!collab) {
      return NextResponse.json({ error: "Collaborator not found." }, { status: 404 });
    }

    await prisma.formCollaborator.delete({
      where: { userId_formId: { userId, formId } },
    });

    await logAudit({
      userId: session.userId,
      action: "COLLABORATOR_REMOVED",
      details: JSON.stringify({ formId, removedUserId: userId, removedEmail: collab.user.email }),
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove collaborator." },
      { status: 500 }
    );
  }
}

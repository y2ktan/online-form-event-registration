import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: {
  userId: string;
  email: string;
  role: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: string; email: string; role: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function generateVerificationToken(
  email: string,
  type: "INVITATION" | "PASSWORD_RESET"
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await prisma.verificationToken.create({
    data: { email, token, type, expiresAt },
  });

  return token;
}

export async function verifyVerificationToken(
  token: string,
  type: "INVITATION" | "PASSWORD_RESET"
) {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record || record.type !== type || record.used || record.expiresAt < new Date()) {
    return null;
  }

  return record;
}

export async function invalidateVerificationToken(token: string) {
  await prisma.verificationToken.update({
    where: { token },
    data: { used: true },
  });
}

export async function canEditForm(
  userId: string,
  role: string,
  formId: string
): Promise<boolean> {
  if (role === "ADMIN") return true;

  const collab = await prisma.formCollaborator.findUnique({
    where: { userId_formId: { userId, formId } },
  });

  return !!collab;
}

export async function logAudit({
  userId,
  action,
  details,
  ipAddress,
  userAgent,
}: {
  userId?: string;
  action: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      action,
      details: details || "",
      ipAddress: ipAddress || "",
      userAgent: userAgent || "",
    },
  });
}

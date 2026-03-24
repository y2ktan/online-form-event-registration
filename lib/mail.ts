import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

async function getSmtpConfig() {
  const config = await prisma.smtpConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  return config;
}

async function getTransporter() {
  const config = await getSmtpConfig();
  if (!config) {
    throw new Error("SMTP not configured. Please configure SMTP settings in Admin > Settings.");
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function sendInvitationEmail(
  email: string,
  token: string,
  baseUrl: string
) {
  const config = await getSmtpConfig();
  if (!config) throw new Error("SMTP not configured.");

  const transporter = await getTransporter();
  const activationUrl = `${baseUrl}/auth/set-password?token=${token}`;

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: email,
    subject: "You've been invited to Form Builder",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Form Builder</h2>
        <p>You've been invited to join Form Builder. Click the link below to set your password and activate your account.</p>
        <p style="margin: 24px 0;">
          <a href="${activationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Set Your Password
          </a>
        </p>
        <p style="color: #6B7280; font-size: 14px;">This link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrl: string
) {
  const config = await getSmtpConfig();
  if (!config) throw new Error("SMTP not configured.");

  const transporter = await getTransporter();
  const resetUrl = `${baseUrl}/auth/set-password?token=${token}&type=reset`;

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: email,
    subject: "Reset Your Password - Form Builder",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>A password reset was requested for your account. Click the link below to set a new password.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #6B7280; font-size: 14px;">This link expires in 24 hours. If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function isSmtpConfigured(): Promise<boolean> {
  const config = await getSmtpConfig();
  return !!config;
}

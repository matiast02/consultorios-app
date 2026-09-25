// Emails para definir o restablecer la contraseña: la invitación al crear un
// usuario y el «olvidé mi contraseña». Los dos usan el mismo link de un solo
// uso (`/reset-password?token=…`, solo el hash en `ResetToken`) y el proveedor
// de email configurado en lib/notifications/email.ts. Nunca llevan la
// contraseña ni datos clínicos.

import { prisma } from "@/lib/prisma";
import { generateResetToken } from "@/lib/reset-token";
import { sendEmail, type EmailSendResult } from "@/lib/notifications/email";

/** La invitación dura más: el usuario nuevo puede tardar en entrar. */
export const INVITE_LINK_TTL_MS = 72 * 60 * 60 * 1000;
export const RESET_LINK_TTL_MS = 60 * 60 * 1000;

export function appBaseUrl(): string {
  const base =
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

/**
 * Emite un link de definición de contraseña para `email`: anula los tokens
 * anteriores sin usar, guarda solo el hash del nuevo y devuelve la URL.
 */
export async function issuePasswordSetupLink(email: string, ttlMs: number): Promise<string> {
  await prisma.resetToken.updateMany({ where: { email, used: false }, data: { used: true } });
  const { token, hash } = generateResetToken();
  await prisma.resetToken.create({
    data: { email, token: hash, expires: new Date(Date.now() + ttlMs) },
  });
  return `${appBaseUrl()}/reset-password?token=${token}`;
}

async function clinicDisplayName(): Promise<string> {
  const row = await prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { name: true } });
  return row?.name?.trim() || "el consultorio";
}

function greeting(name: string | null | undefined): string {
  const n = name?.trim();
  return n ? `Hola ${n},` : "Hola,";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function html(paragraphs: string[], link: string, cta: string): string {
  const ps = paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join("");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:560px">${ps}<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#0d4f4d;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(cta)}</a></p><p style="margin:0;font-size:13px;color:#6b7280">Si el botón no funciona, copiá este enlace en el navegador:<br>${escapeHtml(link)}</p></div>`;
}

export interface PasswordEmailUser {
  email: string;
  name?: string | null;
}

/** Usuario recién creado por el admin: link para definir su contraseña (72 h). */
export async function sendInvitationEmail(user: PasswordEmailUser): Promise<EmailSendResult> {
  const [clinic, link] = await Promise.all([clinicDisplayName(), issuePasswordSetupLink(user.email, INVITE_LINK_TTL_MS)]);
  const paragraphs = [
    greeting(user.name),
    `Te crearon una cuenta en ${clinic}. Para elegir tu contraseña y empezar a usar el sistema entrá en el siguiente enlace. Vence en 72 horas.`,
    "Si no esperabas este mensaje, ignoralo.",
  ];
  return sendEmail({
    to: user.email,
    subject: `Tu cuenta en ${clinic}`,
    text: `${paragraphs.join("\n\n")}\n\n${link}`,
    html: html(paragraphs, link, "Definir mi contraseña"),
  });
}

/** «Olvidé mi contraseña»: link de restablecimiento (1 h). */
export async function sendPasswordResetEmail(user: PasswordEmailUser): Promise<EmailSendResult> {
  const [clinic, link] = await Promise.all([clinicDisplayName(), issuePasswordSetupLink(user.email, RESET_LINK_TTL_MS)]);
  const paragraphs = [
    greeting(user.name),
    `Recibimos un pedido para restablecer la contraseña de tu cuenta en ${clinic}. El enlace vence en 1 hora y sirve una sola vez.`,
    "Si no fuiste vos, ignorá este mensaje: tu contraseña no cambia.",
  ];
  return sendEmail({
    to: user.email,
    subject: `Restablecer contraseña · ${clinic}`,
    text: `${paragraphs.join("\n\n")}\n\n${link}`,
    html: html(paragraphs, link, "Restablecer contraseña"),
  });
}

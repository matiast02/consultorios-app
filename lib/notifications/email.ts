// Envío de email con proveedor configurable por entorno.
//
//   EMAIL_PROVIDER = "resend" | "smtp" | "console"   (si falta, se infiere)
//   EMAIL_FROM     = "Consultorio <no-reply@tu-dominio.com>"
//   RESEND_API_KEY = …                                → proveedor resend (API HTTP, sin dependencia)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE ("true"/"false") → proveedor smtp
//
// Sin configuración se usa "console": no envía nada, imprime el mensaje en el
// log (solo en desarrollo; en producción devuelve error para que quede FAILED
// y visible, en vez de fingir que se envió).
//
// Privacidad: los emails que salen de acá nunca llevan contenido clínico.

import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  ok: boolean;
  provider: EmailProviderName;
  messageId?: string;
  error?: string;
}

export type EmailProviderName = "resend" | "smtp" | "console";

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Consultorio <no-reply@localhost>";
}

// ─── Proveedores ─────────────────────────────────────────────────────────────

const consoleProvider: EmailProvider = {
  name: "console",
  async send(message) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        provider: "console",
        error: "Sin proveedor de email configurado (EMAIL_PROVIDER / RESEND_API_KEY / SMTP_HOST)",
      };
    }
    console.log(
      `[email:console] → ${message.to}\n  Asunto: ${message.subject}\n  ${message.text.replace(/\n/g, "\n  ")}`,
    );
    return { ok: true, provider: "console", messageId: `console-${Date.now()}` };
  },
};

const resendProvider: EmailProvider = {
  name: "resend",
  async send(message) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, provider: "resend", error: "RESEND_API_KEY no configurada" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress(),
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, provider: "resend", error: `Resend ${res.status}: ${body.slice(0, 200)}` };
      }
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, provider: "resend", messageId: json.id };
    } catch (e) {
      return { ok: false, provider: "resend", error: e instanceof Error ? e.message : String(e) };
    }
  },
};

let smtpTransport: Transporter | null = null;

const smtpProvider: EmailProvider = {
  name: "smtp",
  async send(message) {
    const host = process.env.SMTP_HOST;
    if (!host) return { ok: false, provider: "smtp", error: "SMTP_HOST no configurado" };
    try {
      smtpTransport ??= nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
          : undefined,
      });
      const info = await smtpTransport.sendMail({
        from: fromAddress(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { ok: true, provider: "smtp", messageId: info.messageId };
    } catch (e) {
      return { ok: false, provider: "smtp", error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Selección ───────────────────────────────────────────────────────────────

export function resolveEmailProviderName(): EmailProviderName {
  const explicit = process.env.EMAIL_PROVIDER;
  if (explicit === "resend" || explicit === "smtp" || explicit === "console") return explicit;
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "console";
}

export function getEmailProvider(): EmailProvider {
  switch (resolveEmailProviderName()) {
    case "resend":
      return resendProvider;
    case "smtp":
      return smtpProvider;
    default:
      return consoleProvider;
  }
}

/** true si hay un proveedor real (no consola). */
export function isEmailConfigured(): boolean {
  return resolveEmailProviderName() !== "console";
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  return getEmailProvider().send(message);
}

// Mensajes de recordatorio de turno (email y WhatsApp).
//
// Privacidad: el mensaje solo lleva nombre de pila, fecha, hora, profesional y
// dirección. Nunca motivo de consulta, tipo de consulta ni nada clínico.
//
// Plantilla configurable por consultorio (ClinicSettings.reminderTemplate) con
// placeholders: {paciente} {fecha} {hora} {profesional} {consultorio} {direccion} {link}

export interface ReminderMessageInput {
  patientFirstName: string;
  start: Date;
  medicShortName: string;
  clinicName: string | null;
  address: string | null;
  confirmationLink: string | null;
  template?: string | null;
}

export const DEFAULT_REMINDER_TEMPLATE =
  "Hola {paciente}, te recordamos tu turno del {fecha} a las {hora} con {profesional} en {consultorio}.\n" +
  "{direccion}\n" +
  "Confirmá o cancelá acá: {link}\n" +
  "Si no podés asistir, avisanos para liberar el horario. ¡Gracias!";

const AR_TZ = "America/Argentina/Buenos_Aires";

export function formatReminderDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: AR_TZ });
}

export function formatReminderTime(d: Date): string {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: AR_TZ });
}

export function renderReminderText(input: ReminderMessageInput): string {
  const template = input.template?.trim() || DEFAULT_REMINDER_TEMPLATE;
  const values: Record<string, string> = {
    paciente: input.patientFirstName,
    fecha: formatReminderDate(input.start),
    hora: formatReminderTime(input.start),
    profesional: input.medicShortName,
    consultorio: input.clinicName ?? "el consultorio",
    direccion: input.address ? `Dirección: ${input.address}` : "",
    link: input.confirmationLink ?? "",
  };
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function reminderEmailSubject(input: Pick<ReminderMessageInput, "start" | "clinicName">): string {
  return `Recordatorio de turno · ${formatReminderDate(input.start)} ${formatReminderTime(input.start)}${
    input.clinicName ? ` · ${input.clinicName}` : ""
  }`;
}

/** Versión HTML mínima (texto con saltos + link clickeable). */
export function reminderEmailHtml(text: string, confirmationLink: string | null): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const button = confirmationLink
    ? `<p style="margin-top:16px"><a href="${confirmationLink}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar o cancelar turno</a></p>`
    : "";
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped}${button}</div>`;
}

/** Normaliza un teléfono argentino a dígitos E.164 sin "+" para wa.me (549 + área + número). */
export function toWhatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1); // 0387… → 387…
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2)}`;
  // Quitar el "15" de celulares viejos (387 15 … → 387 …)
  digits = digits.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2");
  if (digits.length >= 10 && digits.length <= 11) return `549${digits}`;
  return null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = toWhatsappDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

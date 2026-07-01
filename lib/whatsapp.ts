// Helpers para construir links wa.me y mensajes prellenados del formulario público.

export function buildWhatsappLink(number: string, message?: string | null): string {
  const digits = number.replace(/\D/g, "");
  const txt = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${digits}${txt}`;
}

export function defaultPrefill(req: {
  fullName?: string | null;
  specialization?: string | null;
  preferredDay?: string | null;
  customGreeting?: string | null;
}): string {
  const greet = req.customGreeting?.trim() || "Hola, quería solicitar un turno";
  const parts: string[] = [greet + "."];
  if (req.fullName) parts.push(`Soy ${req.fullName}.`);
  if (req.specialization) parts.push(`Especialidad: ${req.specialization}.`);
  if (req.preferredDay) parts.push(`Día preferido: ${req.preferredDay}.`);
  return parts.join(" ");
}

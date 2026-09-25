// Formato del número de sala (compartido por servidor y cliente; sin Prisma).

/** "7" → "07". Dos dígitos alcanzan para un consultorio; no se trunca si hay más. */
export function formatTicketNumber(n: number): string {
  return String(n).padStart(2, "0");
}

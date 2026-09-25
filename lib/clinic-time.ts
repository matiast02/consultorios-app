// Hora del consultorio.
//
// El proceso puede correr en UTC (contenedor) mientras el consultorio vive en
// Argentina. Todo lo que se calcula "por día" —hoy el número de sala; a futuro
// días bloqueados, filtros por mes, etc. (ROADMAP E5)— debe usar esta zona y no
// la del servidor. Ver docs/SALA-DE-ESPERA.md §2.

export const CLINIC_TIME_ZONE = "America/Argentina/Buenos_Aires";

// en-CA formatea como YYYY-MM-DD.
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` del instante dado, según el día del consultorio. */
export function clinicDateKey(at: Date = new Date()): string {
  return dateKeyFormatter.format(at);
}

/** `YYYY-MM-DD` de hoy en el consultorio. */
export function clinicToday(): string {
  return clinicDateKey(new Date());
}

// Feed de la pantalla pública /sala (módulo waiting_room).
//
// Devuelve SOLO números, consultorios y horas: nunca nombres ni ids de
// pacientes. Lee la tabla WaitingTicket y nada más.

import { prisma } from "@/lib/prisma";
import { clinicDateKey } from "@/lib/clinic-time";
import { WAITING_ROOM_MODULE } from "./tickets";

/** Un llamado deja de mostrarse pasados estos minutos desde el último aviso. */
export const FEED_WINDOW_MINUTES = 30;
/** Cuántos llamados anteriores acompañan al actual. */
export const FEED_RECENT = 4;

export interface DisplayCall {
  /** Id del ticket (no identifica a nadie); sirve para detectar un llamado nuevo. */
  id: string;
  number: number;
  room: string | null;
  /** Último llamado (ISO). */
  calledAt: string;
  callCount: number;
}

export interface DisplayFeed {
  now: string;
  current: DisplayCall | null;
  recent: DisplayCall[];
  /** Personas con número que todavía no fueron llamadas. */
  waitingCount: number;
}

export async function buildDisplayFeed(now: Date = new Date()): Promise<DisplayFeed> {
  const date = clinicDateKey(now);
  const since = new Date(now.getTime() - FEED_WINDOW_MINUTES * 60_000);

  const [rows, waitingCount, hidden] = await Promise.all([
    prisma.waitingTicket.findMany({
      where: {
        date,
        lastCalledAt: { gte: since },
        // Abiertos o ya atendidos; un «no se presentó» (ABSENT), un retiro o una
        // anulación desaparecen de la pantalla de inmediato.
        OR: [{ closedAt: null }, { closedReason: "ATTENDED" }],
      },
      orderBy: { lastCalledAt: "desc" },
      take: 25,
      select: { id: true, number: true, room: true, calledAt: true, lastCalledAt: true, callCount: true, medicId: true },
    }),
    prisma.waitingTicket.count({ where: { date, calledAt: null, closedAt: null } }),
    // Profesionales con el módulo deshabilitado (Administración → Módulos): llaman a viva voz.
    prisma.userModuleAccess.findMany({
      where: { module: WAITING_ROOM_MODULE, enabled: false },
      select: { userId: true },
    }),
  ]);

  const hiddenMedics = new Set(hidden.map((h) => h.userId));
  const calls: DisplayCall[] = rows
    .filter((r) => !r.medicId || !hiddenMedics.has(r.medicId))
    .slice(0, FEED_RECENT + 1)
    .map((r) => ({
      id: r.id,
      number: r.number,
      room: r.room,
      calledAt: (r.lastCalledAt ?? r.calledAt ?? now).toISOString(),
      callCount: r.callCount,
    }));

  return {
    now: now.toISOString(),
    current: calls[0] ?? null,
    recent: calls.slice(1),
    waitingCount,
  };
}

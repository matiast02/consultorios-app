// Sala de espera (módulo `waiting_room`): número de sala.
//
// Ticket diario que recepción entrega al registrar la llegada (turno o walk-in).
// Identifica al paciente en la pantalla pública sin exponer su nombre; no
// promete orden de atención (con varios médicos en paralelo el 07 puede pasar
// antes que el 05). Ver docs/SALA-DE-ESPERA.md.
//
// Concurrencia: el correlativo se toma con `SELECT MAX(...) FOR UPDATE` dentro
// de la transacción del llamador (InnoDB serializa a los emisores del mismo
// día) y `@@unique([date, number])` es la red de seguridad: ante P2002 se
// relee el máximo (la lectura con FOR UPDATE ve lo último confirmado, incluso
// en REPEATABLE READ) y se reintenta.

import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { clinicToday } from "@/lib/clinic-time";

export { formatTicketNumber } from "./format";

export const WAITING_ROOM_MODULE = "waiting_room";

/**
 * Cliente o transacción interactiva (`tx` de `prisma.$transaction`). El cliente
 * está extendido (`$extends` en lib/prisma.ts), así que `Prisma.TransactionClient`
 * no le calza: se tipa por lo que el servicio realmente usa.
 */
type Db = Pick<typeof prisma, "waitingTicket" | "shift" | "$queryRaw">;

export type TicketSummary = { id: string; number: number; date: string };
export type TicketCloseReason = "ATTENDED" | "ABSENT" | "LEFT" | "VOID";

type TicketTarget = {
  shiftId?: string | null;
  walkInId?: string | null;
  /** Profesional que atiende; null en walk-ins sin turno asignado. */
  medicId?: string | null;
};

const SUMMARY = { id: true, number: true, date: true } as const;
const MAX_ATTEMPTS = 3;

/** Módulo activo a nivel consultorio (el override por usuario se aplica solo a la pantalla). */
export function waitingRoomEnabled(): Promise<boolean> {
  return isModuleEnabled(WAITING_ROOM_MODULE);
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

async function nextNumber(db: Db, date: string): Promise<number> {
  // MAX() de un INT llega como BigInt desde MySQL.
  const rows = await db.$queryRaw<Array<{ max: bigint | number | null }>>`
    SELECT MAX(\`number\`) AS max FROM \`WaitingTicket\` WHERE \`date\` = ${date} FOR UPDATE`;
  const max = rows[0]?.max;
  return (max == null ? 0 : Number(max)) + 1;
}

/**
 * Emite el próximo número del día para un turno o un walk-in.
 * Con `reuseId` renumera esa fila (ticket de otro día que se reabre) en vez de crear una.
 */
export async function issueTicket(
  db: Db,
  target: TicketTarget,
  opts: { reuseId?: string } = {},
): Promise<TicketSummary> {
  const date = clinicToday();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const number = await nextNumber(db, date);
    try {
      if (opts.reuseId) {
        return await db.waitingTicket.update({
          where: { id: opts.reuseId },
          data: {
            date,
            number,
            medicId: target.medicId ?? null,
            issuedAt: new Date(),
            calledAt: null,
            lastCalledAt: null,
            callCount: 0,
            room: null,
            closedAt: null,
            closedReason: null,
          },
          select: SUMMARY,
        });
      }
      return await db.waitingTicket.create({
        data: {
          date,
          number,
          shiftId: target.shiftId ?? null,
          walkInId: target.walkInId ?? null,
          medicId: target.medicId ?? null,
        },
        select: SUMMARY,
      });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < MAX_ATTEMPTS) continue;
      throw e;
    }
  }
  /* istanbul ignore next -- el loop siempre retorna o lanza */
  throw new Error("No se pudo emitir el número de sala");
}

type ExistingTicket = {
  id: string;
  number: number;
  date: string;
  closedAt: Date | null;
};

/**
 * Un turno/walk-in tiene a lo sumo un ticket. Repetir la llegada devuelve el
 * mismo número; deshacerla y volver a registrarla lo reabre (mismo número);
 * si el ticket era de otro día se renumera para hoy.
 */
async function ensureTicket(
  db: Db,
  existing: ExistingTicket | null,
  target: TicketTarget,
): Promise<TicketSummary> {
  if (!existing) return issueTicket(db, target);
  const today = clinicToday();
  if (existing.date !== today) return issueTicket(db, target, { reuseId: existing.id });
  if (existing.closedAt === null) {
    return { id: existing.id, number: existing.number, date: existing.date };
  }
  return db.waitingTicket.update({
    where: { id: existing.id },
    data: { closedAt: null, closedReason: null, medicId: target.medicId ?? null },
    select: SUMMARY,
  });
}

const EXISTING = { id: true, number: true, date: true, closedAt: true } as const;

export async function ensureTicketForShift(
  db: Db,
  target: { shiftId: string; medicId: string | null },
): Promise<TicketSummary> {
  const existing = await db.waitingTicket.findUnique({ where: { shiftId: target.shiftId }, select: EXISTING });
  return ensureTicket(db, existing, target);
}

export async function ensureTicketForWalkIn(db: Db, target: { walkInId: string }): Promise<TicketSummary> {
  const existing = await db.waitingTicket.findUnique({ where: { walkInId: target.walkInId }, select: EXISTING });
  return ensureTicket(db, existing, { walkInId: target.walkInId, medicId: null });
}

/** Cierra el ticket abierto del turno (si hay). El número no se reutiliza. */
export async function closeTicketForShift(db: Db, shiftId: string, reason: TicketCloseReason): Promise<void> {
  await db.waitingTicket.updateMany({
    where: { shiftId, closedAt: null },
    data: { closedAt: new Date(), closedReason: reason },
  });
}

export async function closeTicketForWalkIn(db: Db, walkInId: string, reason: TicketCloseReason): Promise<void> {
  await db.waitingTicket.updateMany({
    where: { walkInId, closedAt: null },
    data: { closedAt: new Date(), closedReason: reason },
  });
}

export const voidTicketForShift = (db: Db, shiftId: string) => closeTicketForShift(db, shiftId, "VOID");
export const voidTicketForWalkIn = (db: Db, walkInId: string) => closeTicketForWalkIn(db, walkInId, "VOID");

/**
 * El walk-in recibió un turno: el ticket pasa a ese turno con el mismo número.
 * Si el turno ya tenía número propio, el del walk-in se anula.
 */
export async function moveTicketToShift(
  db: Db,
  args: { walkInId: string; shiftId: string },
): Promise<TicketSummary | null> {
  const ticket = await db.waitingTicket.findUnique({ where: { walkInId: args.walkInId }, select: EXISTING });
  if (!ticket || ticket.closedAt) return null;
  const taken = await db.waitingTicket.findUnique({ where: { shiftId: args.shiftId }, select: { id: true } });
  if (taken && taken.id !== ticket.id) {
    await db.waitingTicket.update({
      where: { id: ticket.id },
      data: { closedAt: new Date(), closedReason: "VOID" },
    });
    return null;
  }
  const shift = await db.shift.findUnique({ where: { id: args.shiftId }, select: { userId: true } });
  return db.waitingTicket.update({
    where: { id: ticket.id },
    data: { shiftId: args.shiftId, medicId: shift?.userId ?? null },
    select: SUMMARY,
  });
}

/** Números abiertos de hoy, indexados por turno y por walk-in (para el dashboard de recepción). */
export async function openTicketsByTarget(
  date: string = clinicToday(),
): Promise<{ byShift: Map<string, number>; byWalkIn: Map<string, number> }> {
  const rows = await prisma.waitingTicket.findMany({
    where: { date, closedAt: null },
    select: { number: true, shiftId: true, walkInId: true },
  });
  const byShift = new Map<string, number>();
  const byWalkIn = new Map<string, number>();
  for (const r of rows) {
    if (r.shiftId) byShift.set(r.shiftId, r.number);
    if (r.walkInId) byWalkIn.set(r.walkInId, r.number);
  }
  return { byShift, byWalkIn };
}

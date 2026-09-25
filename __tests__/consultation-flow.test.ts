import { describe, it, expect } from "vitest";
import { consultationPhase, minutesSince, resolveActiveShift } from "@/lib/consultation-flow";
import type { ShiftStatus } from "@/types";

// Turno «activo» de la ficha del paciente (barra «Consulta en curso» del médico).

const NOW = new Date("2026-09-25T14:00:00.000Z"); // el test corre en la TZ de la máquina: mismo día local

type S = {
  id: string;
  userId: string;
  start: string;
  status: ShiftStatus;
  arrivedAt?: string | null;
  consultationStartedAt?: string | null;
};

function shift(id: string, partial: Partial<S> = {}): S {
  return {
    id,
    userId: "medic-1",
    start: new Date(NOW.getTime() + 60 * 60000).toISOString(), // en una hora, mismo día
    status: "CONFIRMED",
    ...partial,
  };
}

describe("consultationPhase", () => {
  it("distingue agendado, en sala, en consulta y finalizado", () => {
    expect(consultationPhase({ status: "PENDING" })).toBe("scheduled");
    expect(consultationPhase({ status: "CONFIRMED", arrivedAt: "2026-09-25T13:50:00Z" })).toBe("waiting");
    expect(
      consultationPhase({ status: "CONFIRMED", arrivedAt: "2026-09-25T13:50:00Z", consultationStartedAt: "2026-09-25T14:00:00Z" }),
    ).toBe("inConsultation");
    expect(consultationPhase({ status: "FINISHED", consultationStartedAt: "2026-09-25T14:00:00Z" })).toBe("finished");
  });

  it("cancelado o ausente no tienen fase", () => {
    expect(consultationPhase({ status: "CANCELLED", arrivedAt: "2026-09-25T13:50:00Z" })).toBeNull();
    expect(consultationPhase({ status: "ABSENT" })).toBeNull();
  });
});

describe("resolveActiveShift", () => {
  it("sin turnos de hoy del médico → null (ajenos y de otros días no cuentan)", () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60000).toISOString();
    const shifts = [
      shift("ayer", { start: yesterday, arrivedAt: yesterday, consultationStartedAt: yesterday }),
      shift("ajeno", { userId: "medic-2", arrivedAt: NOW.toISOString() }),
    ];
    expect(resolveActiveShift(shifts, { medicId: "medic-1", now: NOW })).toBeNull();
  });

  it("prioriza en consulta > en sala > agendado, y entre iguales el más temprano", () => {
    const early = new Date(NOW.getTime() + 30 * 60000).toISOString();
    const shifts = [
      shift("agendado"),
      shift("agendado-temprano", { start: early }),
      shift("en-sala", { arrivedAt: NOW.toISOString() }),
      shift("en-consulta", { arrivedAt: NOW.toISOString(), consultationStartedAt: NOW.toISOString() }),
    ];
    expect(resolveActiveShift(shifts, { medicId: "medic-1", now: NOW })?.shift.id).toBe("en-consulta");
    expect(resolveActiveShift(shifts.slice(0, 3), { medicId: "medic-1", now: NOW })?.shift.id).toBe("en-sala");
    const onlyScheduled = resolveActiveShift(shifts.slice(0, 2), { medicId: "medic-1", now: NOW });
    expect(onlyScheduled).toEqual({ shift: shifts[1], phase: "scheduled" });
  });

  it("un turno finalizado no se elige solo, pero sí si vino por URL", () => {
    const done = shift("done", { status: "FINISHED", consultationStartedAt: NOW.toISOString() });
    expect(resolveActiveShift([done], { medicId: "medic-1", now: NOW })).toBeNull();
    expect(resolveActiveShift([done], { medicId: "medic-1", preferredId: "done", now: NOW })).toEqual({
      shift: done,
      phase: "finished",
    });
  });

  it("el turno de la URL gana aunque haya otro en consulta; si no sirve, cae al automático", () => {
    const inConsult = shift("en-consulta", { arrivedAt: NOW.toISOString(), consultationStartedAt: NOW.toISOString() });
    const scheduled = shift("agendado");
    const shifts = [inConsult, scheduled];
    expect(resolveActiveShift(shifts, { medicId: "medic-1", preferredId: "agendado", now: NOW })?.shift.id).toBe("agendado");
    // URL con un turno ajeno, cancelado o inexistente: se ignora.
    const cancelled = shift("cancelado", { status: "CANCELLED" });
    expect(
      resolveActiveShift([...shifts, cancelled], { medicId: "medic-1", preferredId: "cancelado", now: NOW })?.shift.id,
    ).toBe("en-consulta");
    expect(resolveActiveShift(shifts, { medicId: "medic-1", preferredId: "nada", now: NOW })?.shift.id).toBe("en-consulta");
  });
});

describe("minutesSince", () => {
  it("redondea a minutos y nunca es negativo", () => {
    expect(minutesSince(new Date(NOW.getTime() - 12.4 * 60000).toISOString(), NOW)).toBe(12);
    expect(minutesSince(new Date(NOW.getTime() + 5 * 60000).toISOString(), NOW)).toBe(0);
  });
});

"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Loader2, Phone, Search, Ticket, UserPlus, UserSquare2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTicketNumber } from "@/lib/waiting-room/format";
import type { Patient, WaitingTicketSummary } from "@/types";
import { formatTime } from "@/lib/format";

interface RegisterArrivalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Today's shifts (any status) used to allow the secretary to mark a SCHEDULED patient as arrived
   * by simply picking from the list.
   */
  todayShifts: Array<{
    id: string;
    start: string;
    patient?: { id: string; firstName: string; lastName: string } | null;
    medicShortName: string;
    arrivedAt?: string | null;
  }>;
  onArrived: () => void;
  /** Walk-in con ficha recién registrado: el orquestador abre el diálogo de turno con el paciente. */
  onAssignShift?: (walkIn: { id: string; patientId: string }) => void;
}

type Mode = "scheduled" | "walkin";

/** Llegada registrada: número de sala (módulo waiting_room) y, si es un walk-in con ficha, la opción de asignarle turno. */
interface DoneState {
  number: number | null;
  who: string;
  walkIn?: { id: string; patientId: string };
}

export function RegisterArrivalDialog({
  open,
  onOpenChange,
  todayShifts,
  onArrived,
  onAssignShift,
}: RegisterArrivalDialogProps) {
  const [mode, setMode] = useState<Mode>("scheduled");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);

  // Walk-in form state
  const [walkInPatients, setWalkInPatients] = useState<Patient[]>([]);
  const [walkInSearch, setWalkInSearch] = useState("");
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telephone, setTelephone] = useState("");
  const [note, setNote] = useState("");

  function resetForm() {
    setMode("scheduled");
    setSearch("");
    setSelectedPatient(null);
    setFirstName("");
    setLastName("");
    setTelephone("");
    setNote("");
    setWalkInSearch("");
    setWalkInPatients([]);
  }

  // Reset when closed
  useEffect(() => {
    if (!open) {
      resetForm();
      setDone(null);
    }
  }, [open]);

  // Search patients for walk-in mode
  useEffect(() => {
    if (mode !== "walkin") return;
    const handler = setTimeout(async () => {
      if (walkInSearch.trim().length < 2) {
        setWalkInPatients([]);
        return;
      }
      setWalkInLoading(true);
      try {
        const res = await fetch(
          `/api/patients?search=${encodeURIComponent(walkInSearch)}&limit=12`,
        );
        if (res.ok) {
          const json = await res.json();
          setWalkInPatients(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        // ignore
      } finally {
        setWalkInLoading(false);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [mode, walkInSearch]);

  const filteredScheduled = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = todayShifts.filter((s) => !s.arrivedAt);
    if (!q) return list;
    return list.filter((s) => {
      const pn = `${s.patient?.firstName ?? ""} ${s.patient?.lastName ?? ""}`.toLowerCase();
      return pn.includes(q) || s.medicShortName.toLowerCase().includes(q);
    });
  }, [todayShifts, search]);

  /**
   * Con número de sala (módulo activo) o walk-in con ficha, el diálogo queda abierto
   * mostrando el número y/o la opción de asignar turno; si no, se cierra.
   */
  function finish(
    ticket: WaitingTicketSummary | null | undefined,
    who: string,
    walkIn?: { id: string; patientId: string },
  ) {
    onArrived();
    if (ticket || (walkIn && onAssignShift)) {
      setDone({ number: ticket?.number ?? null, who, walkIn });
    } else {
      onOpenChange(false);
    }
  }

  async function markScheduledArrived(shift: (typeof todayShifts)[number]) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/shifts/${shift.id}/arrival`, { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json().catch(() => null);
      toast.success("Paciente registrado en sala");
      finish(
        json?.data?.ticket ?? null,
        shift.patient ? `${shift.patient.lastName}, ${shift.patient.firstName}` : "Paciente",
      );
    } catch {
      toast.error("No se pudo registrar la llegada");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWalkIn() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Nombre y apellido son obligatorios");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/walk-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient?.id ?? null,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          telephone: telephone.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json().catch(() => null);
      toast.success("Walk-in registrado");
      const walkInId: string | undefined = json?.data?.id;
      finish(
        json?.data?.ticket ?? null,
        `${lastName.trim()}, ${firstName.trim()}`,
        selectedPatient && walkInId ? { id: walkInId, patientId: selectedPatient.id } : undefined,
      );
    } catch {
      toast.error("No se pudo registrar el walk-in");
    } finally {
      setSubmitting(false);
    }
  }

  function pickExisting(p: Patient) {
    setSelectedPatient(p);
    setFirstName(p.firstName);
    setLastName(p.lastName);
    setTelephone(p.telephone ?? "");
    setWalkInSearch("");
    setWalkInPatients([]);
  }

  const doneDescription = done?.number != null
    ? "Llegada registrada. Decile el número al paciente: con él lo van a llamar a consultorio."
    : "Llegada registrada.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar llegada</DialogTitle>
          <DialogDescription>
            {done ? doneDescription : "Marcá un paciente con turno como llegado, o registralo como walk-in."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div
            className="flex flex-col items-center py-4 text-center"
            role="status"
            aria-live="polite"
            data-testid="arrival-done"
          >
            {done.number != null ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Ticket className="h-3.5 w-3.5" />
                  Número de sala
                </div>
                <div className="mt-2 font-mono text-[84px] font-black leading-none tabular-nums text-[#0d4f4d]">
                  {formatTicketNumber(done.number)}
                </div>
              </>
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-7 w-7" />
              </div>
            )}
            <p className="mt-4 text-sm font-medium text-foreground">{done.who}</p>
            {done.walkIn && (
              <p className="mt-1 text-xs text-muted-foreground">
                Está en sala sin turno. Si le asignás uno ahora, queda bajo su profesional con el mismo número.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {done.walkIn && onAssignShift && (
                <button
                  type="button"
                  autoFocus
                  onClick={() => onAssignShift(done.walkIn!)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0d4f4d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d]"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Asignar turno ahora
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setDone(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground/80 transition hover:bg-muted"
              >
                <UserPlus className="h-4 w-4" />
                Registrar otra llegada
              </button>
              <button
                type="button"
                autoFocus={!(done.walkIn && onAssignShift)}
                onClick={() => onOpenChange(false)}
                className={
                  done.walkIn && onAssignShift
                    ? "inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground/80 transition hover:bg-muted"
                    : "inline-flex items-center gap-2 rounded-lg bg-[#0d4f4d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d]"
                }
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="inline-flex w-full items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5 text-sm font-medium">
              <button
                type="button"
                onClick={() => setMode("scheduled")}
                className={
                  mode === "scheduled"
                    ? "flex-1 rounded-md bg-card px-3 py-1.5 text-foreground shadow-sm"
                    : "flex-1 rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
                }
              >
                <span className="inline-flex items-center gap-2">
                  <UserSquare2 className="h-3.5 w-3.5" />
                  Con turno
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("walkin")}
                className={
                  mode === "walkin"
                    ? "flex-1 rounded-md bg-card px-3 py-1.5 text-foreground shadow-sm"
                    : "flex-1 rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
                }
              >
                <span className="inline-flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5" />
                  Walk-in
                </span>
              </button>
            </div>

            {mode === "scheduled" ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar paciente o médico…"
                    className="w-full rounded-lg border bg-card pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/30"
                  />
                </div>

                <div className="max-h-[340px] overflow-y-auto rounded-lg border">
                  {filteredScheduled.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No quedan turnos por marcar como llegados.
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {filteredScheduled.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30"
                        >
                          <div className="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            {formatTime(s.start)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">
                              {s.patient
                                ? `${s.patient.lastName}, ${s.patient.firstName}`
                                : "Paciente"}
                            </div>
                            <div className="truncate text-[11.5px] text-muted-foreground">
                              {s.medicShortName}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => markScheduledArrived(s)}
                            className="rounded-md bg-[#0d4f4d] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d] disabled:opacity-50"
                          >
                            Registrar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Patient picker */}
                <div>
                  <label className="text-[11.5px] font-medium text-muted-foreground">
                    Buscar paciente existente (opcional)
                  </label>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={walkInSearch}
                      onChange={(e) => setWalkInSearch(e.target.value)}
                      placeholder="Apellido, DNI…"
                      className="w-full rounded-lg border bg-card pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/30"
                    />
                    {walkInLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {walkInPatients.length > 0 && (
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-card text-sm shadow-sm">
                      {walkInPatients.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pickExisting(p)}
                            className="w-full px-3 py-1.5 text-left hover:bg-muted/40"
                          >
                            <span className="font-medium">{p.lastName}, {p.firstName}</span>
                            {p.dni && <span className="ml-2 text-xs text-muted-foreground">DNI {p.dni}</span>}
                            {p.os?.name && <span className="ml-2 text-xs text-muted-foreground">· {p.os.name}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedPatient && (
                    <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300" data-testid="walkin-selected-patient">
                      Ficha: {selectedPatient.lastName}, {selectedPatient.firstName}
                      {selectedPatient.dni ? ` · DNI ${selectedPatient.dni}` : ""}
                      {selectedPatient.os?.name ? ` · ${selectedPatient.os.name}` : " · sin obra social"}
                      {" — al registrarlo vas a poder asignarle turno."}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11.5px] font-medium text-muted-foreground">Nombre *</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-card px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] font-medium text-muted-foreground">Apellido *</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 w-full rounded-lg border bg-card px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11.5px] font-medium text-muted-foreground">Teléfono</label>
                  <div className="relative mt-1">
                    <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={telephone}
                      onChange={(e) => setTelephone(e.target.value)}
                      placeholder="+54 11 …"
                      className="w-full rounded-lg border bg-card pl-8 pr-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11.5px] font-medium text-muted-foreground">Motivo / nota</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Ej: Pide renovación de receta crónica…"
                    className="mt-1 w-full resize-none rounded-lg border bg-card px-3 py-1.5 text-sm"
                  />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitWalkIn}
                  className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0d4f4d] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d] disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Registrar walk-in
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


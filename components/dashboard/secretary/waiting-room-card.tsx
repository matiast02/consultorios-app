"use client";

import {
  CalendarPlus,
  Check,
  LogOut,
  Pencil,
  Phone,
  User as UserIcon,
  UserPlus,
  UserRoundCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { WaitingRoomItem } from "@/types";

interface WaitingRoomCardProps {
  items: WaitingRoomItem[];
  onMarkSeen: (shiftId: string) => void;
  onMarkAbsent: (shiftId: string) => void;
  onCall: (item: WaitingRoomItem) => void;
  onEdit: (item: WaitingRoomItem) => void;
  onAssignShift: (walkInId: string) => void;
  onWalkInLeft: (walkInId: string) => void;
  onViewPatient: (patientId: string) => void;
  onRegisterArrival: () => void;
}

function initials(firstName: string, lastName: string): string {
  return `${(lastName[0] ?? "").toUpperCase()}${(firstName[0] ?? "").toUpperCase()}`;
}

function bucketBg(minutes: number): { text: string; chip: string } {
  if (minutes > 15) return { text: "text-rose-600", chip: "text-rose-700" };
  if (minutes >= 10) return { text: "text-amber-600", chip: "text-amber-700" };
  return { text: "text-muted-foreground", chip: "text-muted-foreground" };
}

function avatarColor(seed: string): string {
  // Deterministic palette based on a string seed
  const palette = [
    "bg-rose-100 text-rose-700",
    "bg-orange-100 text-orange-700",
    "bg-amber-100 text-amber-700",
    "bg-lime-100 text-lime-700",
    "bg-emerald-100 text-emerald-700",
    "bg-teal-100 text-teal-700",
    "bg-sky-100 text-sky-700",
    "bg-violet-100 text-violet-700",
    "bg-pink-100 text-pink-700",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function WaitingRoomCard({
  items,
  onMarkSeen,
  onMarkAbsent,
  onCall,
  onEdit,
  onAssignShift,
  onWalkInLeft,
  onViewPatient,
  onRegisterArrival,
}: WaitingRoomCardProps) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" />
          Sala de espera
          <span className="grid min-w-[22px] place-items-center rounded-full bg-[#0d4f4d] px-1.5 py-0.5 text-[10.5px] font-bold leading-none tabular-nums text-white">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onRegisterArrival}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0d4f4d] transition hover:text-[#0a3f3d]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Registrar llegada
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Sala de espera vacía</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuando llegue un paciente, registralo desde el botón de arriba.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((it) => {
            const isWalkIn = it.kind === "walkin";
            const isNext = it.isNext;
            const bucket = bucketBg(it.minutesWaiting);
            const avatar = avatarColor(`${it.patient.lastName}${it.patient.firstName}`);
            return (
              <li
                key={it.id}
                className={`relative px-5 py-3.5 ${isNext ? "bg-[#0d4f4d]/[0.03]" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatar}`}
                  >
                    {initials(it.patient.firstName, it.patient.lastName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Header row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-foreground">
                        {it.patient.lastName}
                        <span className="text-muted-foreground">, {it.patient.firstName}</span>
                      </span>
                      {isNext && !isWalkIn && (
                        <span className="rounded-md bg-[#0d4f4d] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white">
                          Próximo
                        </span>
                      )}
                      {isWalkIn && (
                        <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-violet-700">
                          Walk-in
                        </span>
                      )}
                    </div>

                    {/* Subtitle */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
                      {it.shift ? (
                        <>
                          <span>
                            Turno{" "}
                            <span className="tabular-nums">
                              {formatTime(it.shift.start)}
                            </span>
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                            {it.shift.medicColor && (
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: it.shift.medicColor }}
                              />
                            )}
                            {it.shift.medicShortName}
                          </span>
                          {it.shift.consultationTypeName && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{it.shift.consultationTypeName}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <span>Sin turno</span>
                          {it.patient.telephone && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span>Tel {it.patient.telephone}</span>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Walk-in note */}
                    {isWalkIn && it.note && (
                      <div className="mt-2 rounded-md border bg-muted/30 px-3 py-1.5 text-[12.5px] text-foreground/80">
                        {it.note}
                      </div>
                    )}

                    {/* Action bar */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {!isWalkIn && (
                        <>
                          <button
                            type="button"
                            onClick={() => onMarkSeen(it.id)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#0d4f4d] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-[#0a3f3d]"
                          >
                            <Check className="h-3 w-3" />
                            Pasó a consulta
                          </button>
                          <button
                            type="button"
                            onClick={() => onCall(it)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition hover:bg-muted"
                          >
                            <Phone className="h-3 w-3" />
                            Llamar
                          </button>
                          <button
                            type="button"
                            onClick={() => onMarkAbsent(it.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[12px] font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            <XCircle className="h-3 w-3" />
                            Marcar ausente
                          </button>
                        </>
                      )}

                      {isWalkIn && (
                        <>
                          <button
                            type="button"
                            onClick={() => onAssignShift(it.id)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#0d4f4d] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-[#0a3f3d]"
                          >
                            <CalendarPlus className="h-3 w-3" />
                            Asignar turno
                          </button>
                          {it.patient.id && (
                            <button
                              type="button"
                              onClick={() => onViewPatient(it.patient.id!)}
                              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground/80 transition hover:bg-muted"
                            >
                              <UserIcon className="h-3 w-3" />
                              Ver ficha
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onWalkInLeft(it.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[12px] font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            <LogOut className="h-3 w-3" />
                            Retiró
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => onEdit(it)}
                        aria-label="Editar"
                        className="ml-auto grid h-7 w-7 place-items-center rounded-md border bg-card text-foreground/60 transition hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Waiting time pill */}
                  <div className={`shrink-0 text-right ${bucket.text}`}>
                    <div className="text-xl font-bold tabular-nums leading-none">
                      {it.minutesWaiting}
                    </div>
                    <div className={`mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] ${bucket.chip}`}>
                      Min en Sala
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p. m." : "a. m.";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Avoid TS warning about unused icon if branch never used
void UserRoundCheck;

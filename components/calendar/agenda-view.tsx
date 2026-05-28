"use client";

import { Mail, MoreHorizontal, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Shift } from "@/types";
import {
  STATE_BADGE_CLASS,
  STATE_DOT_CLASS,
  STATE_LABEL,
  fmtDayShort,
  formatTime,
  isSameDay,
  shiftToState,
} from "./calendar-helpers";

interface AgendaViewProps {
  /** Already filtered + sorted shifts in the agenda window. */
  shifts: Shift[];
  today: Date;
  onSelectShift: (s: Shift) => void;
}

export function AgendaView({ shifts, today, onSelectShift }: AgendaViewProps) {
  // Group by day key (YYYY-MM-DD) using local time to avoid TZ drift.
  const groups: { day: Date; items: Shift[] }[] = [];
  const indexByKey = new Map<string, number>();
  for (const s of shifts) {
    const d = new Date(s.start);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = groups.push({ day: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] }) - 1;
      indexByKey.set(key, idx);
    }
    groups[idx].items.push(s);
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-[10px] border bg-card p-10 text-center text-muted-foreground shadow-xs">
        No hay turnos en este rango.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border bg-card shadow-xs">
      {groups.map((g) => {
        const finalizados = g.items.filter((t) => shiftToState(t) === "finalizado").length;
        const proximos = g.items.filter((t) => {
          const st = shiftToState(t);
          return st === "pendiente" || st === "confirmado" || st === "sobreturno";
        }).length;
        const ausentes = g.items.filter((t) => shiftToState(t) === "ausente").length;
        const isToday = isSameDay(g.day, today);

        return (
          <section key={g.day.toISOString()} className="border-b last:border-b-0">
            <header className="sticky top-0 z-[2] flex items-baseline justify-between border-b bg-muted/50 px-5 py-3 backdrop-blur">
              <div className="text-[13px] font-bold tracking-tight text-foreground first-letter:uppercase">
                {fmtDayShort(g.day)}
                {isToday && (
                  <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-primary-foreground">
                    Hoy
                  </span>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground">
                <strong className="font-bold text-foreground">{g.items.length}</strong> turnos
                {" · "}
                {finalizados} finalizados · {proximos} próximos
                {ausentes > 0 ? ` · ${ausentes} ausentes` : ""}
              </div>
            </header>
            <table className="w-full border-collapse">
              <tbody>
                {g.items.map((s) => {
                  const startDate = new Date(s.start);
                  const endDate = new Date(s.end);
                  const durationMin = Math.round(
                    (endDate.getTime() - startDate.getTime()) / 60000
                  );
                  const state = shiftToState(s);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onSelectShift(s)}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                    >
                      <td className="w-[120px] whitespace-nowrap border-b px-3.5 py-2.5 text-[12.5px] align-middle">
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatTime(startDate)} – {formatTime(endDate)}
                        </span>
                        <span className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                          {durationMin}&apos;
                        </span>
                      </td>
                      <td className="w-[120px] border-b px-3.5 py-2.5 align-middle">
                        <Badge
                          variant="outline"
                          className={`gap-1 border px-1.5 py-0 text-[10.5px] font-semibold ${STATE_BADGE_CLASS[state]}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT_CLASS[state]}`} />
                          {STATE_LABEL[state]}
                        </Badge>
                      </td>
                      <td className="border-b px-3.5 py-2.5 text-[12.5px] align-middle">
                        <span className="font-semibold text-foreground">
                          {s.patient
                            ? `${s.patient.lastName}, ${s.patient.firstName}`
                            : "Paciente"}
                        </span>
                        {(s.patient?.os?.name || s.consultationType?.name) && (
                          <span className="ml-2 text-[12px] font-medium text-muted-foreground">
                            {s.patient?.os?.name}
                            {s.patient?.os?.name && s.consultationType?.name ? " · " : ""}
                            {s.consultationType?.name}
                          </span>
                        )}
                      </td>
                      <td className="border-b px-3.5 py-2.5 text-[12.5px] text-foreground/80 align-middle">
                        {s.observations || (
                          <span className="text-muted-foreground/70">—</span>
                        )}
                      </td>
                      <td
                        className="w-[100px] border-b px-3.5 py-2.5 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionBtn
                          title="Llamar"
                          disabled={!s.patient?.telephone}
                          onClick={() =>
                            s.patient?.telephone &&
                            window.open(`tel:${s.patient.telephone}`)
                          }
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </ActionBtn>
                        <ActionBtn
                          title="WhatsApp"
                          disabled={!s.patient?.telephone}
                          onClick={() => {
                            if (!s.patient?.telephone) return;
                            const phone = s.patient.telephone.replace(/[^\d+]/g, "");
                            window.open(`https://wa.me/${phone.replace(/^\+/, "")}`);
                          }}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </ActionBtn>
                        <ActionBtn title="Más acciones" onClick={() => onSelectShift(s)}>
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </ActionBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function ActionBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="ml-0.5 inline-grid h-[26px] w-[26px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      {children}
    </button>
  );
}

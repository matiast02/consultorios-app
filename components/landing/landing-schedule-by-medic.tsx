"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { DAY_SHORT_LABELS, formatRange } from "@/lib/clinic-hours-format";

interface Range {
  from: string;
  to: string;
}
interface DaySlot {
  dayOfWeek: number;
  am: Range | null;
  pm: Range | null;
}
export interface MedicWeeklySchedule {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  image: string | null;
  licenseNumber: string | null;
  specialization: { id: string; name: string; color: string | null } | null;
  days: DaySlot[];
}

interface Props {
  medics: MedicWeeklySchedule[];
}

function displayName(m: MedicWeeklySchedule): string {
  if (m.firstName || m.lastName) return `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
  return m.name ?? "Profesional";
}

function shortRange(r: Range): string {
  // "08:00 – 13:00" → "08 – 13"  (eliminamos ":00" si los minutos son cero).
  const from = r.from.endsWith(":00") ? r.from.slice(0, 2) : r.from;
  const to = r.to.endsWith(":00") ? r.to.slice(0, 2) : r.to;
  return `${from} – ${to}`;
}

export function LandingScheduleByMedic({ medics }: Props) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    function applyHash() {
      const hash = window.location.hash;
      if (hash.startsWith("#sched-")) {
        const id = hash.slice("#sched-".length);
        setHighlighted(id);
        // Limpia el highlight luego de unos segundos para que sea sólo un "pulse".
        const t = window.setTimeout(() => setHighlighted(null), 3500);
        return () => window.clearTimeout(t);
      }
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  if (medics.length === 0) return null;
  const anyHasSchedule = medics.some((m) => m.days.some((d) => d.am || d.pm));
  if (!anyHasSchedule) return null;

  return (
    <section
      className="px-7 py-[88px]"
      id="horarios-por-profesional"
      style={{ background: "var(--section-tint)" }}
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 max-w-[640px]">
          <span
            className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
          >
            <Calendar className="h-[15px] w-[15px]" />
            Por profesional
          </span>
          <h2
            className="mb-3.5 mt-[18px] text-[clamp(28px,4vw,42px)] font-bold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--ink)", textWrap: "balance" }}
          >
            Quién atiende cada día
          </h2>
          <p className="text-[18px]" style={{ color: "var(--muted)" }}>
            Los bloques en celeste son turnos de mañana y los cálidos, de tarde.
          </p>
        </div>

        <div
          className="overflow-hidden rounded-[18px] border bg-white shadow-[0_4px_14px_rgba(10,34,48,0.06)]"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th
                    className="px-3.5 py-4 text-left text-[12.5px] font-semibold uppercase tracking-[0.04em]"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--muted)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    Profesional
                  </th>
                  {DAY_SHORT_LABELS.map((d) => (
                    <th
                      key={d}
                      className="px-3.5 py-4 text-center text-[12.5px] font-semibold uppercase tracking-[0.04em]"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--muted)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {medics.map((m, idx) => {
                  const isHighlighted = highlighted === m.id;
                  return (
                    <tr
                      key={m.id}
                      id={`sched-${m.id}`}
                      className="transition-colors duration-500 scroll-mt-24"
                      style={{
                        background: isHighlighted ? "var(--primary-soft)" : "transparent",
                      }}
                    >
                      <td
                        className="min-w-[200px] px-3.5 py-4 text-left"
                        style={{ borderBottom: idx === medics.length - 1 ? "0" : "1px solid var(--border)" }}
                      >
                        <div className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                          {displayName(m)}
                        </div>
                        <div className="text-[13px]" style={{ color: "var(--muted)" }}>
                          {m.specialization?.name ? (
                            <>
                              <span
                                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                                style={{
                                  background: m.specialization.color ?? "var(--primary)",
                                }}
                              />
                              {m.specialization.name}
                            </>
                          ) : (
                            "Profesional"
                          )}
                          {m.licenseNumber && <span> · {m.licenseNumber}</span>}
                        </div>
                      </td>

                      {m.days.map((d) => (
                        <td
                          key={d.dayOfWeek}
                          className="px-3.5 py-4 text-center"
                          style={{
                            borderBottom: idx === medics.length - 1 ? "0" : "1px solid var(--border)",
                          }}
                        >
                          {!d.am && !d.pm ? (
                            <span className="text-[14px]" style={{ color: "var(--muted-2)" }}>
                              —
                            </span>
                          ) : (
                            <span className="inline-flex flex-col gap-1">
                              {d.am && (
                                <span
                                  className="rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-semibold leading-none"
                                  style={{
                                    background: "var(--primary-soft)",
                                    color: "var(--primary-deep)",
                                  }}
                                  title={formatRange(d.am.from, d.am.to) ?? undefined}
                                >
                                  {shortRange(d.am)}
                                </span>
                              )}
                              {d.pm && (
                                <span
                                  className="rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-semibold leading-none"
                                  style={{
                                    background: "var(--accent-soft)",
                                    color: "oklch(0.45 0.1 55)",
                                  }}
                                  title={formatRange(d.pm.from, d.pm.to) ?? undefined}
                                >
                                  {shortRange(d.pm)}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-5 text-[13px]" style={{ color: "var(--muted)" }}>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: "var(--primary-soft)" }}
            />
            Turno mañana
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: "var(--accent-soft)" }}
            />
            Turno tarde
          </span>
        </div>
      </div>
    </section>
  );
}

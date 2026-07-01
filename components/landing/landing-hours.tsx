import { Clock, ArrowRight } from "lucide-react";
import type { ClinicHoursDay } from "@/types";
import { DAY_SHORT_LABELS, formatRange } from "@/lib/clinic-hours-format";

interface Props {
  hours: ClinicHoursDay[];
  enabled: boolean;
}

export function LandingHours({ hours, enabled }: Props) {
  if (!enabled) return null;
  const allClosed = hours.every((h) => h.closed);
  if (allClosed) return null;

  // Asegurar orden 0..6
  const byDow = new Map(hours.map((h) => [h.dayOfWeek, h]));
  const ordered = Array.from({ length: 7 }, (_, dow) =>
    byDow.get(dow) ?? { id: `placeholder-${dow}`, dayOfWeek: dow, closed: true, amOpen: null, amClose: null, pmOpen: null, pmClose: null }
  );

  return (
    <section
      className="px-7 py-[88px]"
      id="horarios"
      style={{ background: "var(--section-tint)" }}
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-12 max-w-[640px] text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
          >
            <Clock className="h-[15px] w-[15px]" />
            Horarios de atención
          </span>
          <h2
            className="mb-3.5 mt-[18px] text-[clamp(28px,4vw,42px)] font-bold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--ink)", textWrap: "balance" }}
          >
            Cuándo estamos abiertos
          </h2>
          <p className="text-[18px]" style={{ color: "var(--muted)" }}>
            Horario general del consultorio.
          </p>
        </div>

        <div className="week-strip">
          {ordered.map((d) => {
            const am = formatRange(d.amOpen, d.amClose);
            const pm = formatRange(d.pmOpen, d.pmClose);
            return (
              <div
                key={d.id}
                className="rounded-xl border p-4 text-center"
                style={{
                  background: d.closed ? "var(--surface-2)" : "var(--surface)",
                  borderColor: "var(--border)",
                  borderStyle: d.closed ? "dashed" : "solid",
                }}
              >
                <div
                  className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.03em]"
                  style={{ color: "var(--ink)" }}
                >
                  {DAY_SHORT_LABELS[d.dayOfWeek]}
                </div>
                {d.closed ? (
                  <div className="text-[14px] font-medium" style={{ color: "var(--muted-2)" }}>
                    Cerrado
                  </div>
                ) : (
                  <div className="text-[14px] font-semibold" style={{ color: "var(--primary-deep)" }}>
                    {am && <span className="block">{am}</span>}
                    {pm && <span className="block">{pm}</span>}
                    {!am && !pm && (
                      <span className="block" style={{ color: "var(--muted-2)" }}>
                        —
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-[34px] text-center">
          <a
            href="#contacto"
            className="inline-flex items-center gap-2.5 rounded-full px-[22px] py-[13px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)] transition-all hover:-translate-y-0.5"
            style={{ background: "var(--primary)" }}
          >
            Solicitar un turno
            <ArrowRight className="h-[18px] w-[18px]" />
          </a>
        </div>
      </div>
    </section>
  );
}

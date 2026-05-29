import { ArrowRight, Shield, Clock as ClockIcon, Users as UsersIcon, Check } from "lucide-react";

interface Props {
  medicCount: number;
  specCount: number;
  weeklyShortLabel: string | null; // "Lun a Vie · Sáb por la mañana" — derived
  hasInsurances: boolean;
}

export function LandingHero({ medicCount, specCount, weeklyShortLabel, hasInsurances }: Props) {
  return (
    <section className="overflow-hidden px-7 py-[70px] md:py-20" id="inicio">
      <div className="mx-auto grid max-w-[1180px] items-center gap-14 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
          >
            <Shield className="h-[15px] w-[15px]" />
            Atención médica de confianza
          </span>

          <h1
            className="my-[22px] text-[clamp(38px,5.6vw,64px)] font-bold leading-[1.03] tracking-[-0.035em]"
            style={{ color: "var(--ink)", textWrap: "balance" }}
          >
            Cuidamos tu salud con un{" "}
            <em className="not-italic" style={{ color: "var(--primary)" }}>
              equipo cercano
            </em>{" "}
            y horarios pensados para vos.
          </h1>

          <p
            className="mb-8 max-w-[520px] text-[19px]"
            style={{ color: "var(--muted)", textWrap: "pretty" }}
          >
            Conocé a nuestros profesionales, mirá los días y horarios de atención y reservá tu turno en minutos.
          </p>

          <div className="flex flex-wrap gap-[13px]">
            <a
              href="#contacto"
              className="inline-flex items-center gap-2.5 rounded-full px-[22px] py-[13px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(10,138,158,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(10,138,158,0.34)]"
              style={{ background: "var(--primary)" }}
            >
              Solicitar un turno
              <ArrowRight className="h-[18px] w-[18px]" />
            </a>
            <a
              href="#equipo"
              className="inline-flex items-center gap-2 rounded-full border bg-white px-[22px] py-[13px] text-[15px] font-semibold transition-all hover:-translate-y-0.5 hover:border-[color:var(--primary)] hover:text-[color:var(--primary-deep)]"
              style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
            >
              Ver el equipo
            </a>
          </div>

          <div
            className="mt-[34px] flex flex-wrap items-center gap-[22px] border-t pt-[26px]"
            style={{ borderColor: "var(--border)" }}
          >
            {weeklyShortLabel && (
              <div className="flex items-center gap-[9px] text-[14.5px] font-medium" style={{ color: "var(--ink-2)" }}>
                <ClockIcon className="h-[18px] w-[18px]" style={{ color: "var(--primary)" }} />
                {weeklyShortLabel}
              </div>
            )}
            {medicCount > 0 && (
              <div className="flex items-center gap-[9px] text-[14.5px] font-medium" style={{ color: "var(--ink-2)" }}>
                <UsersIcon className="h-[18px] w-[18px]" style={{ color: "var(--primary)" }} />
                {medicCount} profesional{medicCount === 1 ? "" : "es"}
                {specCount > 0 && ` · ${specCount} especialidad${specCount === 1 ? "" : "es"}`}
              </div>
            )}
            {hasInsurances && (
              <div className="flex items-center gap-[9px] text-[14.5px] font-medium" style={{ color: "var(--ink-2)" }}>
                <Check className="h-[18px] w-[18px]" style={{ color: "var(--primary)" }} />
                Atendemos las principales obras sociales
              </div>
            )}
          </div>
        </div>

        <div className="relative max-w-[480px]">
          <div
            className="overflow-hidden rounded-[26px] border shadow-[0_30px_70px_rgba(7,32,46,0.14)]"
            style={{ borderColor: "var(--border)", aspectRatio: "4 / 4.4" }}
          >
            <div className="ph h-full w-full" data-label="foto recepción / consultorio" />
          </div>

          <div
            className="absolute -right-4 top-[26px] flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_16px_40px_rgba(10,34,48,0.10)]"
            style={{ background: "var(--navy)" }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "#5ee0ad", boxShadow: "0 0 0 4px rgba(94,224,173,0.25)" }}
            />
            Turnos abiertos esta semana
          </div>

          <div
            className="absolute -left-7 bottom-[34px] flex max-w-[260px] items-center gap-[13px] rounded-[18px] border bg-white p-4 shadow-[0_16px_40px_rgba(10,34,48,0.10)]"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="grid h-[42px] w-[42px] place-items-center rounded-xl"
              style={{ background: "var(--primary-soft)", color: "var(--primary-deep)" }}
            >
              <ClockIcon className="h-[21px] w-[21px]" />
            </span>
            <div>
              <strong className="block text-[15px]" style={{ color: "var(--ink)" }}>
                Reservá tu turno
              </strong>
              <span className="text-[13px]" style={{ color: "var(--muted)" }}>
                Te respondemos el mismo día
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

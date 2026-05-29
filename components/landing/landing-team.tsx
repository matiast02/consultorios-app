import Image from "next/image";
import { ArrowRight, BadgeCheck, Clock } from "lucide-react";
import type { PublicMedic } from "@/types";

interface Props {
  medics: PublicMedic[];
}

function displayName(m: PublicMedic): string {
  if (m.firstName || m.lastName) {
    return `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
  }
  return m.name ?? "Profesional";
}

export function LandingTeam({ medics }: Props) {
  if (medics.length === 0) return null;

  const featured = medics.slice(0, 8);

  return (
    <section className="px-7 py-[88px]" id="equipo">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[560px]">
            <span
              className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
            >
              <BadgeCheck className="h-[15px] w-[15px]" />
              Nuestro equipo
            </span>
            <h2
              className="mb-3.5 mt-[18px] text-[clamp(28px,4vw,42px)] font-bold leading-[1.1] tracking-[-0.03em]"
              style={{ color: "var(--ink)", textWrap: "balance" }}
            >
              Profesionales que te acompañan
            </h2>
            <p className="text-[18px]" style={{ color: "var(--muted)" }}>
              Conocé al equipo del consultorio.
            </p>
          </div>
        </div>

        <div className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((m) => (
            <article
              key={m.id}
              className="flex flex-col overflow-hidden rounded-[18px] border bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(10,34,48,0.10)]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="relative" style={{ aspectRatio: "4 / 4.2", background: "var(--surface-2)" }}>
                {m.image ? (
                  <Image
                    src={m.image}
                    alt={displayName(m)}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="ph h-full w-full" data-label="foto" />
                )}
                {m.specialization && (
                  <span
                    className="absolute bottom-3 left-3 rounded-full px-[11px] py-[5px] text-[12px] font-semibold shadow-[0_1px_2px_rgba(10,34,48,0.05)] backdrop-blur"
                    style={{
                      background: "rgba(255,255,255,0.92)",
                      color: m.specialization.color ?? "var(--primary-deep)",
                    }}
                  >
                    {m.specialization.name}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-[18px]">
                <h3 className="text-[17.5px] font-bold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                  {displayName(m)}
                </h3>
                {m.licenseNumber && (
                  <div className="flex items-center gap-[7px] text-[13px]" style={{ color: "var(--muted)" }}>
                    <BadgeCheck className="h-[14px] w-[14px]" />
                    {m.licenseNumber}
                  </div>
                )}
                {m.bio && (
                  <p className="line-clamp-3 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                    {m.bio}
                  </p>
                )}
                <div
                  className="mt-auto flex items-center justify-between border-t pt-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--ink-2)" }}>
                    <Clock className="h-[14px] w-[14px]" style={{ color: "var(--primary)" }} />
                    Consultá horarios
                  </span>
                  <a
                    href="#contacto"
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-[7px] text-[12.5px] font-semibold transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary-deep)]"
                    style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
                  >
                    Turno <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

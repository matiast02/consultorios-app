"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, BadgeCheck, Clock, X } from "lucide-react";
import type { PublicMedic, PublicSpecialization } from "@/types";

interface Props {
  medics: PublicMedic[];
  specializations: PublicSpecialization[];
}

function displayName(m: PublicMedic): string {
  if (m.firstName || m.lastName) {
    return `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim();
  }
  return m.name ?? "Profesional";
}

export function LandingTeam({ medics, specializations }: Props) {
  // Sync con el hash: si la URL trae #equipo-<specId>, filtramos.
  // Patrón replicado de landing-schedule-by-medic.tsx.
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);

  useEffect(() => {
    // Reconocemos sólo el patrón #equipo-{specId} con id no vacío.
    function isEquipoSpecHash(h: string): boolean {
      return h.startsWith("#equipo-") && h.length > "#equipo-".length;
    }

    function scrollToEquipo() {
      const target = document.getElementById("equipo");
      if (!target) return;
      // requestAnimationFrame para esperar al re-render con el filtro aplicado.
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    function applyHash() {
      const h = window.location.hash;
      if (isEquipoSpecHash(h)) {
        setSelectedSpecId(h.slice("#equipo-".length));
      } else if (h === "" || h === "#" || h === "#equipo") {
        // El usuario navegó al tope de la sección Equipo o salió del hash.
        setSelectedSpecId(null);
      }
      // Otros hashes (#sched-*, #contacto, #especialidades, ...) NO tocan
      // el filtro — preservamos el estado y no causamos re-layout.
    }

    // Click delegado: garantiza el scroll incluso si clickeás la misma
    // especialidad dos veces (en ese caso `hashchange` no dispara).
    function onClickAnywhere(e: MouseEvent) {
      const anchor = (e.target as HTMLElement | null)?.closest?.(
        'a[href^="#equipo-"]'
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (isEquipoSpecHash(href)) scrollToEquipo();
    }

    function onHashChange() {
      const h = window.location.hash;
      applyHash();
      // Sólo scrolleamos cuando el hash apunta a una especialidad — un cambio
      // a #sched-X o #contacto debe respetar el destino natural del browser.
      if (isEquipoSpecHash(h)) scrollToEquipo();
    }

    applyHash();
    if (isEquipoSpecHash(window.location.hash)) scrollToEquipo();

    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClickAnywhere);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClickAnywhere);
    };
  }, []);

  const activeSpec: PublicSpecialization | null = selectedSpecId
    ? specializations.find((s) => s.id === selectedSpecId) ?? null
    : null;

  // Si el hash apunta a una especialidad que no existe (ej. id viejo), no filtramos.
  const effectiveFilterId = activeSpec ? activeSpec.id : null;

  const filtered = effectiveFilterId
    ? medics.filter((m) => m.specialization?.id === effectiveFilterId)
    : medics.slice(0, 8);

  function clearFilter() {
    // Limpiamos el hash sin scrollear: replaceState evita un nuevo entry en el history.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#equipo");
    }
    setSelectedSpecId(null);
  }

  if (medics.length === 0) return null;

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

        {/* Chip de filtro activo */}
        {activeSpec && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold"
              style={{
                background: activeSpec.color ? `${activeSpec.color}1a` : "var(--primary-soft)",
                borderColor: activeSpec.color ?? "var(--primary)",
                color: activeSpec.color ?? "var(--primary-deep)",
              }}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: activeSpec.color ?? "var(--primary)" }}
              />
              {activeSpec.name}
              <span className="font-normal opacity-70">
                · {filtered.length} profesional{filtered.length === 1 ? "" : "es"}
              </span>
            </div>
            <button
              type="button"
              onClick={clearFilter}
              className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[12.5px] font-semibold transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary-deep)]"
              style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
            >
              <X className="h-3.5 w-3.5" />
              Ver todos
            </button>
          </div>
        )}

        {/* Empty state defensivo */}
        {activeSpec && filtered.length === 0 ? (
          <div
            className="rounded-[18px] border bg-white p-10 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-[15px]" style={{ color: "var(--muted)" }}>
              No hay profesionales asignados a <strong style={{ color: "var(--ink)" }}>{activeSpec.name}</strong> todavía.
            </p>
          </div>
        ) : (
          <div className="grid gap-[22px] sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((m) => (
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
                    className="mt-auto flex items-center justify-between gap-2 border-t pt-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <a
                      href="#contacto"
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-[12.5px] font-semibold text-white shadow-[0_8px_20px_rgba(10,138,158,0.18)] transition hover:-translate-y-0.5"
                      style={{ background: "var(--primary)" }}
                    >
                      Turno
                    </a>
                    <a
                      href={`#sched-${m.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-[7px] text-[12.5px] font-semibold transition hover:border-[color:var(--primary)] hover:text-[color:var(--primary-deep)]"
                      style={{ borderColor: "var(--border-strong)", color: "var(--ink-2)" }}
                    >
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                      Horarios
                      <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

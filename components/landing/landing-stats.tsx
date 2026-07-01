interface Props {
  yearsOfService: number | null;
  medicCount: number;
  specCount: number;
  patientsServedDisplay: string | null;
}

export function LandingStats({ yearsOfService, medicCount, specCount, patientsServedDisplay }: Props) {
  const items: { num: string; lbl: string }[] = [];
  if (yearsOfService) items.push({ num: `+${yearsOfService}`, lbl: "años de trayectoria" });
  if (medicCount > 0)
    items.push({ num: String(medicCount), lbl: `profesional${medicCount === 1 ? "" : "es"} matriculado${medicCount === 1 ? "" : "s"}` });
  if (specCount > 0)
    items.push({ num: String(specCount), lbl: `especialidad${specCount === 1 ? "" : "es"}` });
  if (patientsServedDisplay) items.push({ num: patientsServedDisplay, lbl: "pacientes atendidos" });

  if (items.length === 0) return null;

  return (
    <section className="px-7 py-[88px] text-[#e7f1f3]" style={{ background: "var(--navy)" }}>
      <div className="mx-auto max-w-[1180px]">
        <div className={`grid gap-7 ${items.length === 1 ? "grid-cols-1" : items.length === 2 ? "sm:grid-cols-2" : items.length === 3 ? "sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
          {items.map((s) => (
            <div key={s.lbl} className="text-center">
              <div className="text-[clamp(34px,5vw,48px)] font-bold leading-none tracking-[-0.03em] text-white">
                {s.num}
              </div>
              <div className="mt-2 text-[15px]" style={{ color: "#a9c6cd" }}>
                {s.lbl}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

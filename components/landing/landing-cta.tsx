export function LandingCta() {
  return (
    <section className="px-7 pb-[88px]">
      <div className="mx-auto max-w-[1180px]">
        <div
          className="relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-[26px] px-14 py-14 text-white"
          style={{
            background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-deep) 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(600px 300px at 90% 0%, rgba(255,255,255,0.14), transparent 60%)",
            }}
          />
          <div className="relative">
            <h2 className="mb-2.5 text-[clamp(26px,3.6vw,36px)] font-bold tracking-[-0.03em]">
              ¿Listo para tu próxima consulta?
            </h2>
            <p className="max-w-[440px] text-[17px]" style={{ color: "rgba(255,255,255,0.85)" }}>
              Reservá tu turno online o escribinos por WhatsApp. Te respondemos el mismo día.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            <a
              href="#contacto"
              className="inline-flex items-center gap-2 rounded-full bg-white px-[22px] py-[13px] text-[15px] font-semibold transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(10,34,48,0.10)]"
              style={{ color: "var(--primary-deep)" }}
            >
              Solicitar turno
            </a>
            <a
              href="#contacto"
              className="inline-flex items-center gap-2 rounded-full border px-[22px] py-[13px] text-[15px] font-semibold text-white transition hover:bg-white/10"
              style={{ borderColor: "rgba(255,255,255,0.4)" }}
            >
              Cómo llegar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

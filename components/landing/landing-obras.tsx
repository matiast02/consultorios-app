import { Shield, Check } from "lucide-react";

interface Props {
  insurances: { id: string; name: string }[];
}

export function LandingObras({ insurances }: Props) {
  if (insurances.length === 0) return null;

  return (
    <section className="px-7 py-[88px]" id="obras">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-12 max-w-[640px] text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
          >
            <Shield className="h-[15px] w-[15px]" />
            Obras sociales
          </span>
          <h2
            className="mb-3.5 mt-[18px] text-[clamp(28px,4vw,42px)] font-bold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--ink)", textWrap: "balance" }}
          >
            Trabajamos con tu cobertura
          </h2>
          <p className="text-[18px]" style={{ color: "var(--muted)" }}>
            Estas son las obras sociales y prepagas que atendemos. Consultá por la tuya al reservar.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {insurances.map((os) => (
            <span
              key={os.id}
              className="inline-flex items-center gap-2.5 rounded-full border bg-white px-[19px] py-[11px] text-[15px] font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--ink-2)" }}
            >
              <Check className="h-4 w-4" style={{ color: "var(--primary)" }} />
              {os.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

import {
  Stethoscope,
  Heart,
  Baby,
  Bone,
  Sparkles,
  Activity,
  Brain,
  Apple,
  Eye,
  Ear,
  Pill,
  GraduationCap,
  ArrowRight,
} from "lucide-react";
import type { PublicSpecialization } from "@/types";

// Mapeo nombre → ícono. Si no matchea, fallback a Stethoscope.
const ICON_BY_NAME: Record<string, typeof Stethoscope> = {
  cardiología: Heart,
  cardiologia: Heart,
  "clínica médica": Stethoscope,
  "clinica medica": Stethoscope,
  clínica: Stethoscope,
  pediatría: Baby,
  pediatria: Baby,
  traumatología: Bone,
  traumatologia: Bone,
  dermatología: Sparkles,
  dermatologia: Sparkles,
  ginecología: Activity,
  ginecologia: Activity,
  psicología: Brain,
  psicologia: Brain,
  psiquiatría: Brain,
  psiquiatria: Brain,
  nutrición: Apple,
  nutricion: Apple,
  oftalmología: Eye,
  oftalmologia: Eye,
  otorrinolaringología: Ear,
  otorrinolaringologia: Ear,
  farmacología: Pill,
  farmacologia: Pill,
};

function iconFor(name: string) {
  const k = name.toLowerCase().trim();
  return ICON_BY_NAME[k] ?? GraduationCap;
}

interface Props {
  specializations: PublicSpecialization[];
}

export function LandingSpecialties({ specializations }: Props) {
  if (specializations.length === 0) return null;

  return (
    <section
      className="px-7 py-[88px]"
      id="especialidades"
      style={{ background: "var(--section-tint)" }}
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-12 max-w-[640px] text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
          >
            <GraduationCap className="h-[15px] w-[15px]" />
            Especialidades
          </span>
          <h2
            className="mb-3.5 mt-[18px] text-[clamp(28px,4vw,42px)] font-bold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--ink)", textWrap: "balance" }}
          >
            Atención integral en un solo lugar
          </h2>
          <p className="text-[18px]" style={{ color: "var(--muted)", textWrap: "pretty" }}>
            Cubrimos las consultas más frecuentes con profesionales matriculados en cada área.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {specializations.map((s) => {
            const Icon = iconFor(s.name);
            const tint = s.color ?? "var(--primary-deep)";
            return (
              <a
                key={s.id}
                href={`#equipo-${s.id}`}
                aria-label={`Ver profesionales de ${s.name}`}
                className="group block cursor-pointer rounded-[18px] border bg-white p-6 transition-all duration-200 hover:-translate-y-[3px] hover:shadow-[0_16px_40px_rgba(10,34,48,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--primary)]"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="mb-4 grid h-12 w-12 place-items-center rounded-[14px]"
                  style={{
                    background: s.color ? `${s.color}1a` : "var(--primary-soft)",
                    color: tint,
                  }}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3
                  className="mb-1 text-[17px] font-semibold tracking-[-0.01em]"
                  style={{ color: "var(--ink)" }}
                >
                  {s.name}
                </h3>
                <p className="text-[14px]" style={{ color: "var(--muted)" }}>
                  {s.medicCount} profesional{s.medicCount === 1 ? "" : "es"} en esta especialidad
                </p>
                <span
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ color: "var(--primary-deep)" }}
                >
                  Ver profesionales
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

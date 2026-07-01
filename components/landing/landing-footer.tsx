import { Stethoscope, Shield } from "lucide-react";

interface Props {
  clinicName: string;
  contactEmail: string | null;
  phoneDisplay: string | null;
  whatsappPrimary: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  weeklySummary: string[]; // ["Lun a Vie · 8 a 20 h", "Sábados · 8 a 13 h", "Domingos · cerrado"]
}

export function LandingFooter({
  clinicName,
  contactEmail,
  phoneDisplay,
  whatsappPrimary,
  addressLine1,
  addressLine2,
  weeklySummary,
}: Props) {
  const year = 2026;
  const phoneOrWa = phoneDisplay || whatsappPrimary;

  return (
    <footer className="px-7 pb-[30px] pt-[60px]" style={{ background: "var(--navy)", color: "#b9d2d9" }}>
      <div className="mx-auto max-w-[1180px]">
        <div
          className="grid gap-9 border-b pb-10"
          style={{ borderColor: "rgba(255,255,255,0.08)", gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
        >
          <div>
            <a href="#inicio" className="mb-3.5 flex items-center gap-[11px] font-bold tracking-tight text-[18px] text-white">
              <span
                className="grid h-[38px] w-[38px] place-items-center rounded-[11px] text-white"
                style={{
                  background: "linear-gradient(150deg, var(--primary), var(--primary-deep))",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12), 0 6px 14px rgba(10,138,158,0.3)",
                }}
              >
                <Stethoscope className="h-[21px] w-[21px]" />
              </span>
              {clinicName}
            </a>
            <p className="max-w-[300px] text-[14.5px]" style={{ color: "#8fb0b9" }}>
              Centro médico con atención integral. Profesionales matriculados, turnos ágiles y trato cercano.
            </p>
          </div>

          <div>
            <h5 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7fa3ac" }}>
              Navegación
            </h5>
            <div className="flex flex-col gap-2.5">
              <a href="#inicio" className="text-[14.5px] transition hover:text-white">Inicio</a>
              <a href="#equipo" className="text-[14.5px] transition hover:text-white">Equipo</a>
              <a href="#horarios" className="text-[14.5px] transition hover:text-white">Horarios</a>
              <a href="#contacto" className="text-[14.5px] transition hover:text-white">Contacto</a>
            </div>
          </div>

          {(addressLine1 || phoneOrWa || contactEmail) && (
            <div>
              <h5 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7fa3ac" }}>
                Contacto
              </h5>
              <div className="flex flex-col gap-2.5">
                {addressLine1 && (
                  <span className="text-[14.5px]">
                    {addressLine1}
                    {addressLine2 && <><br />{addressLine2}</>}
                  </span>
                )}
                {phoneOrWa && (
                  <a href={`tel:${phoneOrWa.replace(/\D/g, "")}`} className="text-[14.5px] transition hover:text-white">
                    {phoneOrWa}
                  </a>
                )}
                {contactEmail && (
                  <a href={`mailto:${contactEmail}`} className="text-[14.5px] transition hover:text-white">
                    {contactEmail}
                  </a>
                )}
              </div>
            </div>
          )}

          {weeklySummary.length > 0 && (
            <div>
              <h5 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7fa3ac" }}>
                Horario
              </h5>
              <div className="flex flex-col gap-2.5">
                {weeklySummary.map((line) => (
                  <span key={line} className="text-[14.5px]">{line}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 text-[13px]" style={{ color: "#6f939c" }}>
          <div className="flex items-center gap-2">
            <Shield className="h-[15px] w-[15px]" />
            Cumplimos la Ley 25.326 de Protección de Datos Personales.
          </div>
          <span>© {year} {clinicName}. Todos los derechos reservados.</span>
        </div>
      </div>
    </footer>
  );
}

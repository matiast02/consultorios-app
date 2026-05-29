import { MapPin, Phone, Mail, Clock } from "lucide-react";

interface Props {
  addressLine1: string | null;
  addressLine2: string | null;
  phoneDisplay: string | null;
  whatsappPrimary: string | null;
  whatsappSecondary: string | null;
  contactEmail: string | null;
  weeklySummary: string | null;
}

interface Row {
  label: string;
  body: React.ReactNode;
  icon: typeof MapPin;
}

export function LandingContactInfo({
  addressLine1,
  addressLine2,
  phoneDisplay,
  whatsappPrimary,
  whatsappSecondary,
  contactEmail,
  weeklySummary,
}: Props) {
  const rows: Row[] = [];

  if (addressLine1) {
    rows.push({
      label: "Dirección",
      icon: MapPin,
      body: (
        <>
          {addressLine1}
          {addressLine2 && (
            <>
              <br />
              {addressLine2}
            </>
          )}
        </>
      ),
    });
  }

  if (phoneDisplay || whatsappPrimary) {
    rows.push({
      label: "Teléfono / WhatsApp",
      icon: Phone,
      body: (
        <span className="flex flex-col">
          {phoneDisplay && (
            <a href={`tel:${phoneDisplay.replace(/\D/g, "")}`} className="hover:underline">
              {phoneDisplay}
            </a>
          )}
          {whatsappPrimary && !phoneDisplay && (
            <a href={`tel:+${whatsappPrimary}`} className="hover:underline">
              +{whatsappPrimary}
            </a>
          )}
          {whatsappSecondary && (
            <a href={`tel:+${whatsappSecondary}`} className="hover:underline">
              +{whatsappSecondary}
            </a>
          )}
        </span>
      ),
    });
  }

  if (contactEmail) {
    rows.push({
      label: "Email",
      icon: Mail,
      body: (
        <a href={`mailto:${contactEmail}`} className="hover:underline">
          {contactEmail}
        </a>
      ),
    });
  }

  if (weeklySummary) {
    rows.push({
      label: "Horario de atención",
      icon: Clock,
      body: weeklySummary,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <div
            key={r.label}
            className="flex items-start gap-4 rounded-xl border bg-white px-5 py-[18px]"
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              style={{ background: "var(--primary-soft)", color: "var(--primary-deep)" }}
            >
              <Icon className="h-[21px] w-[21px]" />
            </span>
            <div>
              <h4
                className="mb-[3px] text-[13px] font-semibold uppercase tracking-[0.04em]"
                style={{ color: "var(--muted)" }}
              >
                {r.label}
              </h4>
              <p className="text-[16px] font-medium" style={{ color: "var(--ink)" }}>
                {r.body}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

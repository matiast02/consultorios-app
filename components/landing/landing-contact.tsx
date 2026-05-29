import { LandingContactInfo } from "./landing-contact-info";
import { LandingContactForm } from "./landing-contact-form";
import { LandingMap } from "./landing-map";
import type { ClinicSettings, PublicSpecialization } from "@/types";

interface Props {
  settings: ClinicSettings;
  specializations: PublicSpecialization[];
  healthInsurances: { id: string; name: string }[];
  weeklySummary: string | null;
}

export function LandingContact({ settings, specializations, healthInsurances, weeklySummary }: Props) {
  const showInfo =
    settings.addressLine1 ||
    settings.phoneDisplay ||
    settings.whatsappPrimary ||
    settings.contactEmail ||
    weeklySummary;
  const showMap = settings.showMap && settings.mapLat != null && settings.mapLng != null;
  const showForm = settings.showContactForm;

  if (!showInfo && !showMap && !showForm) return null;

  return (
    <section className="px-7 py-[88px]" id="contacto">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-12 max-w-[640px] text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-[13px] py-1.5 text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--primary-deep)", background: "var(--primary-soft)" }}
          >
            Contacto
          </span>
          <h2
            className="mb-3.5 mt-[18px] text-[clamp(28px,4vw,42px)] font-bold leading-[1.1] tracking-[-0.03em]"
            style={{ color: "var(--ink)", textWrap: "balance" }}
          >
            Solicitá tu turno
          </h2>
          <p className="text-[18px]" style={{ color: "var(--muted)" }}>
            Completá el formulario y te respondemos por WhatsApp el mismo día.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          {(showInfo || showMap) && (
            <div className="space-y-[18px]">
              {showInfo && (
                <LandingContactInfo
                  addressLine1={settings.addressLine1}
                  addressLine2={settings.addressLine2}
                  phoneDisplay={settings.phoneDisplay}
                  whatsappPrimary={settings.whatsappPrimary}
                  whatsappSecondary={settings.whatsappSecondary}
                  contactEmail={settings.contactEmail}
                  weeklySummary={weeklySummary}
                />
              )}
              {showMap && settings.mapLat != null && settings.mapLng != null && (
                <LandingMap lat={settings.mapLat} lng={settings.mapLng} zoom={settings.mapZoom} />
              )}
            </div>
          )}

          {showForm && (
            <LandingContactForm
              specializations={specializations}
              healthInsurances={healthInsurances}
              whatsappPrimary={settings.whatsappPrimary}
            />
          )}
        </div>
      </div>
    </section>
  );
}

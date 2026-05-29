import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dayShortLabel, formatRange } from "@/lib/clinic-hours-format";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingSpecialties } from "@/components/landing/landing-specialties";
import { LandingTeam } from "@/components/landing/landing-team";
import { LandingHours } from "@/components/landing/landing-hours";
import { LandingStats } from "@/components/landing/landing-stats";
import { LandingObras } from "@/components/landing/landing-obras";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingContact } from "@/components/landing/landing-contact";
import { LandingFooter } from "@/components/landing/landing-footer";
import type {
  ClinicHoursDay,
  ClinicSettings as ClinicSettingsT,
  PublicMedic,
  PublicSpecialization,
} from "@/types";

export const revalidate = 60;

// ────────────────────────────────────────────────────────────────────────────
// Data loading
// ────────────────────────────────────────────────────────────────────────────

async function loadClinicInfo() {
  const [settingsRow, hoursRows, medicRows, specRows, insuranceRows] = await Promise.all([
    prisma.clinicSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    }),
    prisma.clinicHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        roles: { some: { role: { name: "medic" } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        image: true,
        bio: true,
        licenseNumber: true,
        specialization: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.specialization.findMany({
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { users: { where: { isActive: true, deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.healthInsurance.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const settings: ClinicSettingsT = {
    ...settingsRow,
    mapLat: settingsRow.mapLat == null ? null : Number(settingsRow.mapLat),
    mapLng: settingsRow.mapLng == null ? null : Number(settingsRow.mapLng),
  };

  const hours: ClinicHoursDay[] = hoursRows;
  const medics: PublicMedic[] = medicRows;
  const specializations: PublicSpecialization[] = specRows
    .filter((s) => s._count.users > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      medicCount: s._count.users,
    }));

  return { settings, hours, medics, specializations, healthInsurances: insuranceRows };
}

// ────────────────────────────────────────────────────────────────────────────
// Derive weekly summaries
// ────────────────────────────────────────────────────────────────────────────

/**
 * Summarize the week into footer-style lines, e.g.:
 * ["Lun a Vie · 8 a 20 h", "Sábados · 8 a 13 h", "Domingos · cerrado"]
 */
function summarizeWeek(hours: ClinicHoursDay[]): string[] {
  if (hours.every((h) => h.closed)) return [];

  const lines: string[] = [];
  const weekdaysOpen = hours
    .filter((h) => h.dayOfWeek >= 0 && h.dayOfWeek <= 4 && !h.closed)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  if (weekdaysOpen.length === 5) {
    // todos los días de semana abiertos
    const first = weekdaysOpen[0];
    const open = first.amOpen || first.pmOpen;
    const close = first.pmClose || first.amClose;
    if (open && close) {
      const o = open.replace(/^0/, "").replace(":00", "");
      const c = close.replace(/^0/, "").replace(":00", "");
      lines.push(`Lun a Vie · ${o} a ${c} h`);
    }
  } else if (weekdaysOpen.length > 0) {
    const dayList = weekdaysOpen.map((h) => dayShortLabel(h.dayOfWeek)).join(", ");
    lines.push(`${dayList} · abiertos`);
  }

  const sat = hours.find((h) => h.dayOfWeek === 5);
  if (sat && !sat.closed) {
    const r = formatRange(sat.amOpen, sat.amClose) || formatRange(sat.pmOpen, sat.pmClose);
    lines.push(`Sábados · ${r ?? "abiertos"}`);
  } else if (sat?.closed) {
    lines.push("Sábados · cerrado");
  }

  const sun = hours.find((h) => h.dayOfWeek === 6);
  if (sun && !sun.closed) {
    const r = formatRange(sun.amOpen, sun.amClose) || formatRange(sun.pmOpen, sun.pmClose);
    lines.push(`Domingos · ${r ?? "abiertos"}`);
  } else if (sun?.closed) {
    lines.push("Domingos · cerrado");
  }

  return lines;
}

function shortWeekLabel(lines: string[]): string | null {
  if (lines.length === 0) return null;
  const weekday = lines.find((l) => l.startsWith("Lun"));
  const sat = lines.find((l) => l.startsWith("Sáb") && !l.includes("cerrado"));
  if (weekday && sat) return `${weekday.split(" · ")[0]} · Sáb por la mañana`;
  return weekday ?? sat ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default async function Home() {
  const session = await auth();
  const { settings, hours, medics, specializations, healthInsurances } = await loadClinicInfo();

  const clinicName = settings.name?.trim() || "ConsultorioApp";
  const tagline = settings.tagline?.trim() || "Centro médico";

  const weeklyLines = summarizeWeek(hours);
  const weeklyShort = shortWeekLabel(weeklyLines);
  const weeklyJoined = weeklyLines.length > 0 ? weeklyLines.join(" — ") : null;

  return (
    <div className="landing flex min-h-screen flex-col">
      <LandingNav clinicName={clinicName} tagline={tagline} isLoggedIn={!!session?.user} />

      <main className="flex-1">
        <LandingHero
          medicCount={medics.length}
          specCount={specializations.length}
          weeklyShortLabel={weeklyShort}
          hasInsurances={healthInsurances.length > 0}
        />

        <LandingSpecialties specializations={specializations} />

        {settings.showTeam && <LandingTeam medics={medics} />}

        <LandingHours hours={hours} enabled={settings.showHours} />

        <LandingStats
          yearsOfService={settings.yearsOfService}
          medicCount={medics.length}
          specCount={specializations.length}
          patientsServedDisplay={settings.patientsServedDisplay}
        />

        <LandingObras insurances={healthInsurances} />

        <LandingCta />

        <LandingContact
          settings={settings}
          specializations={specializations}
          healthInsurances={healthInsurances}
          weeklySummary={weeklyJoined}
        />
      </main>

      <LandingFooter
        clinicName={clinicName}
        contactEmail={settings.contactEmail}
        phoneDisplay={settings.phoneDisplay}
        whatsappPrimary={settings.whatsappPrimary}
        addressLine1={settings.addressLine1}
        addressLine2={settings.addressLine2}
        weeklySummary={weeklyLines}
      />
    </div>
  );
}

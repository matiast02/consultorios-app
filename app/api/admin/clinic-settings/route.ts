import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { clinicSettingsSchema } from "@/lib/validations";
import { parseReminderChannels } from "@/lib/reminders/scheduler";
import { isEmailConfigured } from "@/lib/notifications/email";

// Campos del sitio público: el formulario "Datos del consultorio" los manda
// todos juntos (vacío → null). Los de recordatorios se actualizan solo si
// vienen en el body, así un formulario de recordatorios puede guardar sin
// pisar los datos del sitio (y viceversa).
const SITE_FIELDS = [
  "name",
  "tagline",
  "contactEmail",
  "whatsappPrimary",
  "whatsappSecondary",
  "phoneDisplay",
  "prefillWhatsappMessage",
  "addressLine1",
  "addressLine2",
  "mapLat",
  "mapLng",
  "mapZoom",
  "showTeam",
  "showHours",
  "showMap",
  "showContactForm",
  "yearsOfService",
  "patientsServedDisplay",
] as const;

async function requireAdmin() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }
  const role = await getUserRole(session.user.id);
  if (role !== "admin") {
    return { error: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }) };
  }
  return { session };
}

function serialize(row: Awaited<ReturnType<typeof prisma.clinicSettings.findUnique>>) {
  if (!row) return null;
  return {
    ...row,
    mapLat: row.mapLat == null ? null : Number(row.mapLat),
    mapLng: row.mapLng == null ? null : Number(row.mapLng),
    reminderChannels: parseReminderChannels(row.reminderChannels),
    // Para avisar en la UI que los recordatorios por email no van a salir.
    emailConfigured: isEmailConfigured(),
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  try {
    const row = await prisma.clinicSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });
    return NextResponse.json({ success: true, data: serialize(row) });
  } catch (error) {
    console.error("GET /api/admin/clinic-settings error:", error);
    return NextResponse.json(
      { success: false, error: "Error al leer la configuración" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  try {
    const body = await req.json();
    const parsed = clinicSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Coerce empty strings to null + normalize WhatsApp to digits only
    const d = parsed.data;
    const has = (k: string) => typeof body === "object" && body !== null && k in body;

    // ── Recordatorios (solo los campos presentes) ──
    const reminders: {
      remindersEnabled?: boolean;
      reminderHoursBefore?: number;
      reminderSecondHoursBefore?: number | null;
      reminderChannels?: string;
      reminderTemplate?: string | null;
    } = {};
    if (d.remindersEnabled !== undefined) reminders.remindersEnabled = d.remindersEnabled;
    if (d.reminderHoursBefore !== undefined) reminders.reminderHoursBefore = d.reminderHoursBefore;
    if (has("reminderSecondHoursBefore")) reminders.reminderSecondHoursBefore = d.reminderSecondHoursBefore ?? null;
    if (d.reminderChannels !== undefined) {
      reminders.reminderChannels = JSON.stringify(Array.from(new Set(d.reminderChannels)));
    }
    if (has("reminderTemplate")) reminders.reminderTemplate = d.reminderTemplate?.toString().trim() || null;

    if (reminders.reminderHoursBefore !== undefined || reminders.reminderSecondHoursBefore != null) {
      const current = await prisma.clinicSettings.findUnique({
        where: { id: "default" },
        select: { reminderHoursBefore: true, reminderSecondHoursBefore: true },
      });
      const first = reminders.reminderHoursBefore ?? current?.reminderHoursBefore ?? 24;
      const second =
        reminders.reminderSecondHoursBefore !== undefined
          ? reminders.reminderSecondHoursBefore
          : (current?.reminderSecondHoursBefore ?? null);
      if (second != null && second >= first) {
        return NextResponse.json(
          {
            success: false,
            error: "Datos inválidos",
            details: {
              formErrors: [],
              fieldErrors: {
                reminderSecondHoursBefore: [
                  "El segundo recordatorio tiene que ser más cercano al turno que el primero",
                ],
              },
            },
          },
          { status: 400 }
        );
      }
    }

    const hasSiteFields = SITE_FIELDS.some(has);
    const cleaned = {
      name: d.name?.toString().trim() || null,
      tagline: d.tagline?.toString().trim() || null,
      contactEmail: d.contactEmail?.toString().trim() || null,
      whatsappPrimary: d.whatsappPrimary?.toString().replace(/\D/g, "") || null,
      whatsappSecondary: d.whatsappSecondary?.toString().replace(/\D/g, "") || null,
      phoneDisplay: d.phoneDisplay?.toString().trim() || null,
      prefillWhatsappMessage: d.prefillWhatsappMessage?.toString().trim() || null,
      addressLine1: d.addressLine1?.toString().trim() || null,
      addressLine2: d.addressLine2?.toString().trim() || null,
      mapLat: d.mapLat ?? null,
      mapLng: d.mapLng ?? null,
      mapZoom: d.mapZoom ?? null,
      showTeam: d.showTeam ?? true,
      showHours: d.showHours ?? true,
      showMap: d.showMap ?? true,
      showContactForm: d.showContactForm ?? true,
      yearsOfService: d.yearsOfService ?? null,
      patientsServedDisplay: d.patientsServedDisplay?.toString().trim() || null,
    };

    const data = { ...(hasSiteFields ? cleaned : {}), ...reminders };
    const row = await prisma.clinicSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    return NextResponse.json({ success: true, data: serialize(row) });
  } catch (error) {
    console.error("PUT /api/admin/clinic-settings error:", error);
    return NextResponse.json(
      { success: false, error: "Error al guardar la configuración" },
      { status: 500 }
    );
  }
}

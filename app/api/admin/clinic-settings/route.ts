import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { clinicSettingsSchema } from "@/lib/validations";

async function requireAdmin() {
  const session = await auth();
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

    const row = await prisma.clinicSettings.upsert({
      where: { id: "default" },
      update: cleaned,
      create: { id: "default", ...cleaned },
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

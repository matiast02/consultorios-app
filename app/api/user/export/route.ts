import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/user/export — Export all data for the current user (profile + patients + shifts + clinical)
// Returns a JSON dump. The file is downloaded as an attachment with a date-stamped name.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Sesión inválida" }, { status: 401 });
    }

    // Profile (without password)
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        officeAddress: true,
        bio: true,
        licenseNumber: true,
        specialization: { select: { id: true, name: true } },
        slotDurationMinutes: true,
        bufferMinutes: true,
        minAdvanceMinutes: true,
        language: true,
        timezone: true,
        weekStart: true,
        notifyReminder24h: true,
        notifyReminder2h: true,
        notifyNewShift: true,
        notifyCancellation: true,
        notifyWeeklySummary: true,
        notifySmsFallback: true,
        createdAt: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // Shifts of this professional (with patient + evolution + prescriptions)
    const shifts = await prisma.shift.findMany({
      where: { userId },
      orderBy: { start: "desc" },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dni: true,
            email: true,
            telephone: true,
          },
        },
        consultationType: { select: { name: true } },
        evolution: true,
        prescriptions: true,
        studyOrders: true,
      },
    });

    // Patients seen by this professional (distinct from shifts)
    const patientIds = Array.from(new Set(shifts.map((s) => s.patientId)));
    const patients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds } },
          include: {
            os: true,
            insurances: { include: { healthInsurance: true } },
            clinicalRecord: true,
          },
        })
      : [];

    // Preferences + block days + accepted insurances
    const [preferences, blockDays, acceptedInsurances] = await Promise.all([
      prisma.userPreference.findMany({ where: { userId } }),
      prisma.blockDay.findMany({ where: { userId }, orderBy: { date: "asc" } }),
      prisma.userInsurance.findMany({
        where: { userId },
        include: { healthInsurance: true },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      profile,
      preferences,
      blockDays,
      acceptedInsurances,
      patients,
      shifts,
    };

    const today = new Date().toISOString().split("T")[0];
    const filename = `consultorio-export-${today}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/user/export error:", error);
    return NextResponse.json(
      { success: false, error: "Error al exportar datos" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { canAccessEntry, getClinicalActor, medicHasRelationship } from "@/lib/clinical-access";

// GET /api/user/export — Export all data for the current user (profile + patients + shifts + clinical)
// Returns a JSON dump. The file is downloaded as an attachment with a date-stamped name.
//
// Datos clínicos: misma política que el resto de las rutas clínicas
// (lib/clinical-access). Roles no clínicos exportan sin HC; el médico solo sus
// asientos y la ficha de pacientes con los que tiene relación clínica.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
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

    const actor = await getClinicalActor(userId);

    // Asientos clínicos: solo los accesibles según la política (el turno puede
    // tener recetas/órdenes de otro autor).
    const safeShifts = shifts.map(({ evolution, prescriptions, studyOrders, ...shift }) => ({
      ...shift,
      evolution: actor && evolution && canAccessEntry(actor, evolution) ? evolution : null,
      prescriptions: actor ? prescriptions.filter((p) => canAccessEntry(actor, p)) : [],
      studyOrders: actor ? studyOrders.filter((o) => canAccessEntry(actor, o)) : [],
    }));

    // Patients seen by this professional (distinct from shifts)
    const patientIds = Array.from(new Set(shifts.map((s) => s.patientId)));
    const rawPatients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds } },
          include: {
            os: true,
            insurances: { include: { healthInsurance: true } },
            clinicalRecord: true,
          },
        })
      : [];

    // Ficha clínica solo si el actor tiene relación clínica con el paciente.
    // Secuencial a propósito: medicHasRelationship hace 4 counts por paciente y
    // en paralelo sobre cientos de pacientes agotaría el pool de conexiones.
    type RawPatient = (typeof rawPatients)[number];
    const patients: (Omit<RawPatient, "clinicalRecord"> & {
      clinicalRecord: RawPatient["clinicalRecord"];
    })[] = [];
    for (const { clinicalRecord, ...patient } of rawPatients) {
      const visible =
        actor !== null &&
        clinicalRecord !== null &&
        (await medicHasRelationship(actor, patient.id));
      patients.push({ ...patient, clinicalRecord: visible ? clinicalRecord : null });
    }

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
      shifts: safeShifts,
    };

    logAudit({
      userId,
      action: "VIEW_SENSITIVE",
      resource: "export",
      resourceId: userId,
      details: {
        patients: patients.length,
        shifts: safeShifts.length,
        clinicalRecords: patients.filter((p) => p.clinicalRecord).length,
      },
      req,
    });

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

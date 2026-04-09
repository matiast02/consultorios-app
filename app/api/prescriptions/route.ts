import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPrescriptionSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";

// GET /api/prescriptions — List prescriptions for a patient
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id!);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de recetas no habilitado" },
        { status: 403 }
      );
    }

    const { searchParams } = req.nextUrl;
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: "patientId es requerido" },
        { status: 400 }
      );
    }

    const prescriptions = await prisma.prescription.findMany({
      where: { patientId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: prescriptions });
  } catch (error) {
    console.error("GET /api/prescriptions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener recetas" },
      { status: 500 }
    );
  }
}

// POST /api/prescriptions — Create a prescription
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id!);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de recetas no habilitado" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createPrescriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { patientId, shiftId, items, diagnosis, notes } = parsed.data;

    const prescription = await prisma.prescription.create({
      data: {
        patientId,
        userId: session.user.id!,
        shiftId: shiftId ?? null,
        items: JSON.stringify(items),
        diagnosis: diagnosis ?? null,
        notes: notes ?? null,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    logAudit({
      userId: session.user.id!,
      action: "CREATE",
      resource: "prescription" as never,
      resourceId: prescription.id,
      details: { patientId, itemCount: items.length },
      req,
    });

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error) {
    console.error("POST /api/prescriptions error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear receta" },
      { status: 500 }
    );
  }
}

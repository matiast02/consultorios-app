import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth-utils";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/patients/[id]/restore — Restaurar un paciente archivado (solo admin)
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    if ((await getUserRole(session.user.id)) !== "admin") {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Solo el administrador puede restaurar pacientes" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, dni: true, deletedAt: true },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 }
      );
    }

    if (!patient.deletedAt) {
      return NextResponse.json(
        { success: false, code: "NOT_ARCHIVED", error: "El paciente no está archivado" },
        { status: 409 }
      );
    }

    // Defensa: si el DNI quedó en uso por un paciente activo, no restaurar.
    if (patient.dni) {
      const duplicate = await prisma.patient.findFirst({
        where: { dni: patient.dni, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            code: "DUPLICATE",
            error: "Ya existe un paciente activo con ese DNI; no se puede restaurar",
          },
          { status: 409 }
        );
      }
    }

    const restored = await prisma.patient.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
      include: { os: true },
    });

    logAudit({
      userId: session.user.id,
      action: "UPDATE",
      resource: "patient",
      resourceId: id,
      details: { restored: true },
      req,
    });

    return NextResponse.json({ success: true, data: restored });
  } catch (error) {
    console.error("POST /api/patients/[id]/restore error:", error);
    return NextResponse.json(
      { success: false, error: "Error al restaurar paciente" },
      { status: 500 }
    );
  }
}

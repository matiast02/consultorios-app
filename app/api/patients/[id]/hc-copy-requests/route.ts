import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { createHcCopyRequestSchema } from "@/lib/validations";
import { toHcCopyRequestItems } from "@/lib/hc-copy";
import { canRegisterHcCopy, HC_COPY_DUE_HOURS } from "@/lib/hc-copy-shared";

type RouteContext = { params: Promise<{ id: string }> };

const FORBIDDEN = {
  success: false,
  code: "FORBIDDEN",
  error: "Sin permiso para gestionar copias de la historia clínica",
} as const;

// GET /api/patients/[id]/hc-copy-requests — Solicitudes de copia de HC del paciente
// (admin / médico / secretaria). Incluye pacientes archivados.
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!canRegisterHcCopy(await getUserRole(session.user.id))) {
      return NextResponse.json(FORBIDDEN, { status: 403 });
    }

    const { id } = await context.params;
    const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 },
      );
    }

    const rows = await prisma.hcCopyRequest.findMany({
      where: { patientId: id },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json({ success: true, data: await toHcCopyRequestItems(rows) });
  } catch (error) {
    console.error("GET /api/patients/[id]/hc-copy-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener las solicitudes de copia" },
      { status: 500 },
    );
  }
}

// POST /api/patients/[id]/hc-copy-requests — Registrar una solicitud (Ley 26.529
// art. 14: la copia se entrega dentro de las 48 h → dueAt = ahora + 48 h).
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    if (!canRegisterHcCopy(await getUserRole(userId))) {
      return NextResponse.json(FORBIDDEN, { status: 403 });
    }

    const { id } = await context.params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Cuerpo de la solicitud inválido" },
        { status: 400 },
      );
    }
    const parsed = createHcCopyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 },
      );
    }

    const requestedAt = new Date();
    const dueAt = new Date(requestedAt.getTime() + HC_COPY_DUE_HOURS * 60 * 60 * 1000);
    const created = await prisma.hcCopyRequest.create({
      data: {
        patientId: id,
        requesterType: parsed.data.requesterType,
        requesterName: parsed.data.requesterName,
        requesterDni: parsed.data.requesterDni,
        authorizationNote: parsed.data.authorizationNote,
        reason: parsed.data.reason,
        registeredById: userId,
        requestedAt,
        dueAt,
      },
    });

    logAudit({
      userId,
      action: "CREATE",
      resource: "hc_copy_request",
      resourceId: created.id,
      details: { patientId: id, requesterType: parsed.data.requesterType },
      req,
    });

    const [item] = await toHcCopyRequestItems([created]);
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("POST /api/patients/[id]/hc-copy-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar la solicitud de copia" },
      { status: 500 },
    );
  }
}

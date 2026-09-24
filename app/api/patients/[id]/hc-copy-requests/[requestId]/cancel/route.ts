import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { toHcCopyRequestItems } from "@/lib/hc-copy";
import { canRegisterHcCopy } from "@/lib/hc-copy-shared";

type RouteContext = { params: Promise<{ id: string; requestId: string }> };

function notPending(status: string) {
  return NextResponse.json(
    {
      success: false,
      code: "NOT_PENDING",
      error:
        status === "DELIVERED"
          ? "La solicitud ya fue entregada"
          : "La solicitud ya está cancelada",
    },
    { status: 409 },
  );
}

// POST /api/patients/[id]/hc-copy-requests/[requestId]/cancel — Cancelar una
// solicitud PENDING (admin / médico / secretaria).
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    if (!canRegisterHcCopy(await getUserRole(userId))) {
      return NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          error: "Sin permiso para gestionar copias de la historia clínica",
        },
        { status: 403 },
      );
    }

    const { id, requestId } = await context.params;
    const request = await prisma.hcCopyRequest.findFirst({
      where: { id: requestId, patientId: id },
      select: { id: true, status: true },
    });
    if (!request) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 },
      );
    }
    if (request.status !== "PENDING") return notPending(request.status);

    const { count } = await prisma.hcCopyRequest.updateMany({
      where: { id: request.id, patientId: id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    const updated = await prisma.hcCopyRequest.findUnique({ where: { id: request.id } });
    if (count === 0 || !updated) return notPending(updated?.status ?? "CANCELLED");

    logAudit({
      userId,
      action: "UPDATE",
      resource: "hc_copy_request",
      resourceId: request.id,
      details: { patientId: id, status: "CANCELLED" },
      req,
    });

    const [item] = await toHcCopyRequestItems([updated]);
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("POST /api/patients/[id]/hc-copy-requests/[requestId]/cancel error:", error);
    return NextResponse.json(
      { success: false, error: "Error al cancelar la solicitud" },
      { status: 500 },
    );
  }
}

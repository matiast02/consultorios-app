import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { hcCopyRequestsQuerySchema } from "@/lib/validations";
import { isHcCopyOverdue } from "@/lib/hc-copy";
import type {
  HcCopyRequestSummary,
  HcCopyRequesterTypeValue,
  HcCopyStatusValue,
} from "@/lib/hc-copy-shared";

// GET /api/hc-copy-requests?status=PENDING&limit=50 — Solicitudes de copia de HC
// de todos los pacientes (solo admin; dashboard). PENDING se ordena por
// vencimiento (dueAt asc); el resto, por fecha de solicitud (desc).
// Solo datos administrativos: no devuelve notas cifradas ni contenido clínico.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if ((await getUserRole(session.user.id)) !== "admin") {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Solo administradores" },
        { status: 403 },
      );
    }

    const parsed = hcCopyRequestsQuerySchema.safeParse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { status, limit } = parsed.data;
    const now = new Date();

    const [rows, count, overdue] = await Promise.all([
      prisma.hcCopyRequest.findMany({
        where: { status },
        orderBy:
          status === "PENDING"
            ? [{ dueAt: "asc" }, { id: "asc" }]
            : [{ requestedAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          requesterType: true,
          requesterName: true,
          status: true,
          requestedAt: true,
          dueAt: true,
          deliveredAt: true,
          patient: { select: { id: true, firstName: true, lastName: true, dni: true } },
        },
      }),
      prisma.hcCopyRequest.count({ where: { status } }),
      status === "PENDING"
        ? prisma.hcCopyRequest.count({ where: { status: "PENDING", dueAt: { lt: now } } })
        : Promise.resolve(0),
    ]);

    const items: HcCopyRequestSummary[] = rows.map((r) => ({
      id: r.id,
      patient: {
        id: r.patient.id,
        firstName: r.patient.firstName,
        lastName: r.patient.lastName,
        dni: r.patient.dni ?? null,
      },
      requesterType: r.requesterType as HcCopyRequesterTypeValue,
      requesterName: r.requesterName,
      status: r.status as HcCopyStatusValue,
      requestedAt: r.requestedAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      overdue: isHcCopyOverdue(r, now),
    }));

    return NextResponse.json({ success: true, data: { items, count, overdue } });
  } catch (error) {
    console.error("GET /api/hc-copy-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener las solicitudes de copia" },
      { status: 500 },
    );
  }
}

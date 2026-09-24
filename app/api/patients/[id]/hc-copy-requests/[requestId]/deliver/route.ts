import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { deliverHcCopySchema } from "@/lib/validations";
import {
  assembleHcCopy,
  hashHcCopy,
  hcCopyFileName,
  renderHcCopyPdf,
  type HcCopy,
} from "@/lib/hc-copy";
import { canDeliverHcCopy, type HcCopyRequesterTypeValue } from "@/lib/hc-copy-shared";

type RouteContext = { params: Promise<{ id: string; requestId: string }> };

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador/a",
  medic: "Profesional",
};

function cancelledResponse() {
  return NextResponse.json(
    { success: false, code: "CANCELLED", error: "La solicitud está cancelada" },
    { status: 409 },
  );
}

// POST /api/patients/[id]/hc-copy-requests/[requestId]/deliver
// Genera el PDF de la copia completa de la HC (admin / médico). Si la solicitud
// está PENDING la marca DELIVERED (fecha, emisor, nota, documentHash); si ya
// estaba DELIVERED la vuelve a emitir sin tocar los datos de la entrega original.
// Siempre audita EXPORT_HC + VIEW_SENSITIVE.
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;
    const role = await getUserRole(userId);
    if (!canDeliverHcCopy(role)) {
      // La secretaria registra la solicitud pero nunca ve el contenido clínico.
      return NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          error: "Solo el administrador o un médico pueden generar la copia de la historia clínica",
        },
        { status: 403 },
      );
    }

    const { id, requestId } = await context.params;

    // Body opcional: { deliveryNote? }
    let body: unknown = {};
    const raw = await req.text();
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          { success: false, error: "Cuerpo de la solicitud inválido" },
          { status: 400 },
        );
      }
    }
    const parsed = deliverHcCopySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const request = await prisma.hcCopyRequest.findFirst({
      where: { id: requestId, patientId: id },
    });
    if (!request) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 },
      );
    }
    if (request.status === "CANCELLED") return cancelledResponse();

    const copy = await assembleHcCopy(id);
    if (!copy) {
      return NextResponse.json(
        { success: false, error: "Paciente no encontrado" },
        { status: 404 },
      );
    }
    const documentHash = hashHcCopy(copy);
    const issuedAt = new Date();

    const [settings, issuer] = await Promise.all([
      prisma.clinicSettings.findUnique({ where: { id: "default" }, select: { name: true } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, firstName: true, lastName: true, licenseNumber: true },
      }),
    ]);
    const issuerName =
      [issuer?.firstName ?? "", issuer?.lastName ?? ""].filter(Boolean).join(" ").trim() ||
      issuer?.name ||
      session.user.name ||
      "Usuario";

    const render = (copyToRender: HcCopy, reissue: boolean) =>
      renderHcCopyPdf(copyToRender, {
        requestId: request.id,
        clinicName: settings?.name ?? null,
        issuedAt,
        issuedBy: {
          name: issuerName,
          licenseNumber: issuer?.licenseNumber ?? null,
          roleLabel: role ? ROLE_LABELS[role] ?? null : null,
        },
        requester: {
          type: request.requesterType as HcCopyRequesterTypeValue,
          name: request.requesterName,
          dni: request.requesterDni ?? null,
        },
        requestedAt: request.requestedAt,
        reissue,
      });

    // Se genera ANTES de marcar la entrega: si el render falla, la solicitud
    // sigue PENDING.
    let reissue = request.status === "DELIVERED";
    let pdf = render(copy, reissue);

    if (!reissue) {
      // Guard contra carreras: solo pasa a DELIVERED si sigue PENDING.
      const { count } = await prisma.hcCopyRequest.updateMany({
        where: { id: request.id, patientId: id, status: "PENDING" },
        data: {
          status: "DELIVERED",
          deliveredAt: issuedAt,
          deliveredById: userId,
          deliveryNote: parsed.data.deliveryNote,
          documentHash,
        },
      });
      if (count === 0) {
        const current = await prisma.hcCopyRequest.findUnique({
          where: { id: request.id },
          select: { status: true },
        });
        if (!current || current.status === "CANCELLED") return cancelledResponse();
        // Otra petición la entregó en paralelo: esta emisión es una reemisión.
        reissue = true;
        pdf = render(copy, reissue);
      }
    }

    logAudit({
      userId,
      action: "EXPORT_HC",
      resource: "hc_copy_request",
      resourceId: request.id,
      details: {
        patientId: id,
        requesterType: request.requesterType,
        documentHash,
        reissue,
      },
      req,
    });
    logAudit({
      userId,
      action: "VIEW_SENSITIVE",
      resource: "clinical_record",
      resourceId: copy.clinicalRecord?.id ?? id,
      details: { patientId: id, via: "hc_copy", requestId: request.id },
      req,
    });

    const bytes = new Uint8Array(pdf.byteLength);
    bytes.set(pdf);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${hcCopyFileName(copy.patient.lastName, issuedAt)}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Document-Hash": documentHash,
      },
    });
  } catch (error) {
    console.error("POST /api/patients/[id]/hc-copy-requests/[requestId]/deliver error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar la copia de la historia clínica" },
      { status: 500 },
    );
  }
}

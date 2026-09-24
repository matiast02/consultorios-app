import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { accessGrantsQuerySchema, createAccessGrantSchema } from "@/lib/validations";
import {
  CLINICAL_FORBIDDEN,
  activeGrantWhere,
  getClinicalActor,
  medicHasRelationship,
  treatedPatientWhere,
} from "@/lib/clinical-access";
import {
  GRANT_INCLUDE,
  grantStatusWhere,
  loadUserRefs,
  serializeGrant,
  treatingPatientIds,
} from "@/lib/clinical-access-grants";

// Contrato: contracts/api-schemas/clinical-access-grants.yaml

// GET /api/clinical-access-grants?patientId=&status=&box=received|to-decide
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const parsed = accessGrantsQuerySchema.safeParse({
      patientId: sp.get("patientId") || undefined,
      status: sp.get("status") || undefined,
      box: sp.get("box") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Parámetros inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { patientId, status, box } = parsed.data;
    const now = new Date();

    const filters: Prisma.ClinicalAccessGrantWhereInput[] = [];
    if (patientId) filters.push({ patientId });
    // "A decidir" sin estado explícito = las pendientes.
    const effectiveStatus = status ?? (box === "to-decide" ? "PENDING" : undefined);
    if (effectiveStatus) filters.push(grantStatusWhere(effectiveStatus, now));

    if (actor.isMedic) {
      const received: Prisma.ClinicalAccessGrantWhereInput = { grantedToUserId: actor.userId };
      const toDecide: Prisma.ClinicalAccessGrantWhereInput = {
        grantedToUserId: { not: actor.userId },
        patient: treatedPatientWhere(actor.userId),
      };
      filters.push(
        box === "received" ? received : box === "to-decide" ? toDecide : { OR: [received, toDecide] },
      );
    } else if (box === "received") {
      // El admin no solicita accesos: "recibidas" queda vacío salvo datos legacy.
      filters.push({ grantedToUserId: actor.userId });
    } else if (box === "to-decide") {
      filters.push({ grantedToUserId: { not: actor.userId } });
    }

    const rows = await prisma.clinicalAccessGrant.findMany({
      where: { AND: filters },
      include: GRANT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const [treating, users] = await Promise.all([
      treatingPatientIds(actor, rows.map((r) => r.patientId)),
      loadUserRefs(rows.flatMap((r) => [r.decidedById, r.revokedById])),
    ]);

    return NextResponse.json({
      success: true,
      data: rows.map((r) => serializeGrant(r, actor, treating.has(r.patientId), users, now)),
    });
  } catch (error) {
    console.error("GET /api/clinical-access-grants error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener las solicitudes de acceso" },
      { status: 500 },
    );
  }
}

/** ¿Todos los ids son asientos (de cualquier tipo) del paciente? */
async function entriesBelongToPatient(patientId: string, ids: string[]): Promise<boolean> {
  const where = { id: { in: ids } };
  const [evo, rx, orders, plans] = await Promise.all([
    prisma.evolution.findMany({ where: { ...where, clinicalRecord: { patientId } }, select: { id: true } }),
    prisma.prescription.findMany({ where: { ...where, patientId }, select: { id: true } }),
    prisma.studyOrder.findMany({ where: { ...where, patientId }, select: { id: true } }),
    prisma.mealPlan.findMany({ where: { ...where, patientId }, select: { id: true } }),
  ]);
  const found = new Set([...evo, ...rx, ...orders, ...plans].map((e) => e.id));
  return ids.every((id) => found.has(id));
}

// POST /api/clinical-access-grants — un médico sin relación solicita acceso.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }
    if (!actor.isMedic) {
      return NextResponse.json(
        { success: false, error: "Solo los médicos pueden solicitar acceso a una historia clínica" },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = createAccessGrantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { patientId, scope, reason } = parsed.data;

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Paciente no encontrado" }, { status: 404 });
    }

    if (await medicHasRelationship(actor, patientId)) {
      return NextResponse.json(
        { success: false, error: "Ya sos médico tratante de este paciente: no necesitás solicitar acceso" },
        { status: 409 },
      );
    }

    const now = new Date();
    const existing = await prisma.clinicalAccessGrant.findFirst({
      where: {
        grantedToUserId: actor.userId,
        patientId,
        OR: [{ status: "PENDING" }, activeGrantWhere(now)],
      },
      select: { id: true, status: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error:
            existing.status === "PENDING"
              ? "Ya tenés una solicitud pendiente para este paciente"
              : "Ya tenés un acceso vigente a este paciente",
        },
        { status: 409 },
      );
    }

    // Con FULL, sections / entryIds no aplican (se guardan vacíos).
    const sections = scope === "PARTIAL" ? [...new Set(parsed.data.sections ?? [])] : [];
    const entryIds = scope === "PARTIAL" ? [...new Set(parsed.data.entryIds ?? [])] : [];
    if (entryIds.length > 0 && !(await entriesBelongToPatient(patientId, entryIds))) {
      return NextResponse.json(
        { success: false, error: "Hay registros que no pertenecen a este paciente" },
        { status: 400 },
      );
    }

    const grant = await prisma.clinicalAccessGrant.create({
      data: {
        patientId,
        grantedToUserId: actor.userId,
        requestedById: actor.userId,
        status: "PENDING",
        scope,
        sections: sections.length > 0 ? JSON.stringify(sections) : null,
        entryIds: entryIds.length > 0 ? JSON.stringify(entryIds) : null,
        reason,
      },
      include: GRANT_INCLUDE,
    });

    logAudit({
      userId: actor.userId,
      action: "REQUEST_ACCESS",
      resource: "clinical_access_grant",
      resourceId: grant.id,
      // Sin el motivo (texto clínico libre): queda cifrado en la concesión.
      details: { action: "requested", patientId, scope, sections, entryCount: entryIds.length },
      req,
    });

    return NextResponse.json(
      { success: true, data: serializeGrant(grant, actor, false, new Map(), now) },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/clinical-access-grants error:", error);
    return NextResponse.json(
      { success: false, error: "Error al solicitar el acceso" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createStudyOrderSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";

// GET /api/study-orders — List study orders for a patient
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const moduleEnabled = await checkModuleAccess("study_orders", session.user.id!);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de ordenes de estudio no habilitado" },
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

    const studyOrders = await prisma.studyOrder.findMany({
      where: { patientId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: studyOrders });
  } catch (error) {
    console.error("GET /api/study-orders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener ordenes de estudio" },
      { status: 500 }
    );
  }
}

// POST /api/study-orders — Create a study order
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const moduleEnabled = await checkModuleAccess("study_orders", session.user.id!);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de ordenes de estudio no habilitado" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createStudyOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { patientId, shiftId, items } = parsed.data;

    const studyOrder = await prisma.studyOrder.create({
      data: {
        patientId,
        userId: session.user.id!,
        shiftId: shiftId ?? null,
        items: JSON.stringify(items),
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    logAudit({
      userId: session.user.id!,
      action: "CREATE",
      resource: "study_order" as never,
      resourceId: studyOrder.id,
      details: { patientId, itemCount: items.length },
      req,
    });

    return NextResponse.json({ success: true, data: studyOrder }, { status: 201 });
  } catch (error) {
    console.error("POST /api/study-orders error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear orden de estudio" },
      { status: 500 }
    );
  }
}

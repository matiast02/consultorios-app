import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateStudyOrderSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/study-orders/[id] — Get a single study order
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const studyOrder = await prisma.studyOrder.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!studyOrder) {
      return NextResponse.json(
        { success: false, error: "Orden de estudio no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: studyOrder });
  } catch (error) {
    console.error("GET /api/study-orders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener orden de estudio" },
      { status: 500 }
    );
  }
}

// PUT /api/study-orders/[id] — Update status and/or resultNotes
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateStudyOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.studyOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Orden de estudio no encontrada" },
        { status: 404 }
      );
    }

    const data = parsed.data;

    const studyOrder = await prisma.studyOrder.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.resultNotes !== undefined ? { resultNotes: data.resultNotes } : {}),
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
      action: "UPDATE",
      resource: "study_order" as never,
      resourceId: studyOrder.id,
      details: { updatedFields: Object.keys(data) },
      req,
    });

    return NextResponse.json({ success: true, data: studyOrder });
  } catch (error) {
    console.error("PUT /api/study-orders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar orden de estudio" },
      { status: 500 }
    );
  }
}

// DELETE /api/study-orders/[id] — Delete a study order
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.studyOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Orden de estudio no encontrada" },
        { status: 404 }
      );
    }

    await prisma.studyOrder.delete({ where: { id } });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "study_order" as never,
      resourceId: id,
      details: { patientId: existing.patientId },
      req,
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/study-orders/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar orden de estudio" },
      { status: 500 }
    );
  }
}

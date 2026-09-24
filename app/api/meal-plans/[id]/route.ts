import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateMealPlanSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, mealPlanSnapshot } from "@/lib/clinical-ledger";
import {
  canAccessEntry,
  CLINICAL_FORBIDDEN,
  canReadEntry,
  getClinicalActor,
  grantAuditDetails,
} from "@/lib/clinical-access";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/meal-plans/[id] — Get a single meal plan
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Lista blanca: solo roles clínicos.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    if (!(await checkModuleAccess("prescriptions", session.user.id))) {
      return NextResponse.json(
        { success: false, error: "Modulo de planes alimentarios no habilitado" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, dni: true },
        },
        user: {
          select: { id: true, name: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    // Autor, admin o concesión vigente sobre SU paciente que lo cubra.
    // 404 (no 403) para no revelar la existencia de planes ajenos.
    const read = mealPlan
      ? await canReadEntry(actor, mealPlan, mealPlan.patientId, "meal_plan")
      : null;
    if (!mealPlan || !read?.ok) {
      return NextResponse.json(
        { success: false, error: "Plan alimentario no encontrado" },
        { status: 404 }
      );
    }

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "meal_plan",
      resourceId: mealPlan.id,
      details: { patientId: mealPlan.patientId, ...grantAuditDetails(read.grantId) },
      req,
    });

    return NextResponse.json({ success: true, data: mealPlan });
  } catch (error) {
    console.error("GET /api/meal-plans/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener plan alimentario" },
      { status: 500 }
    );
  }
}

// PUT /api/meal-plans/[id] — Update a meal plan
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    if (!(await checkModuleAccess("prescriptions", session.user.id))) {
      return NextResponse.json(
        { success: false, error: "Modulo de planes alimentarios no habilitado" },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existing = await prisma.mealPlan.findUnique({ where: { id } });
    if (!existing || !canAccessEntry(actor, existing)) {
      return NextResponse.json(
        { success: false, error: "Plan alimentario no encontrado" },
        { status: 404 }
      );
    }
    if (existing.userId !== actor.userId) {
      return NextResponse.json(
        { success: false, error: "Solo el autor puede modificar este plan" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateMealPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Build update payload, stringify meals if provided
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.targetCalories !== undefined) updateData.targetCalories = data.targetCalories ?? null;
    if (data.proteinPct !== undefined) updateData.proteinPct = data.proteinPct ?? null;
    if (data.carbsPct !== undefined) updateData.carbsPct = data.carbsPct ?? null;
    if (data.fatPct !== undefined) updateData.fatPct = data.fatPct ?? null;
    if (data.hydration !== undefined) updateData.hydration = data.hydration ?? null;
    if (data.meals !== undefined) updateData.meals = JSON.stringify(data.meals);
    if (data.avoidFoods !== undefined) updateData.avoidFoods = data.avoidFoods ?? null;
    if (data.supplements !== undefined) updateData.supplements = data.supplements ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;
    if (data.shiftId !== undefined) updateData.shiftId = data.shiftId ?? null;

    if (existing.annulledAt) {
      return NextResponse.json(
        { success: false, error: "No se puede editar un plan anulado" },
        { status: 409 }
      );
    }

    const authorId = actor.userId;
    const mealPlan = await prisma.$transaction(async (tx) => {
      const next = await tx.mealPlan.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: { id: true, name: true, email: true, firstName: true, lastName: true },
          },
        },
      });

      await recordClinicalVersion(tx, {
        entityType: "meal_plan",
        entityId: id,
        patientId: existing.patientId,
        action: "corrected",
        data: mealPlanSnapshot(next),
        authorId,
      });

      return next;
    });

    logAudit({
      userId: actor.userId,
      action: "UPDATE",
      resource: "meal_plan",
      resourceId: id,
      details: { patientId: existing.patientId, fields: Object.keys(updateData) },
      req,
    });

    return NextResponse.json({ success: true, data: mealPlan });
  } catch (error) {
    console.error("PUT /api/meal-plans/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar plan alimentario" },
      { status: 500 }
    );
  }
}

// DELETE /api/meal-plans/[id] — Delete a meal plan (creator only)
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const { id } = await context.params;

    const body = await req.json().catch(() => ({}));
    const annulReason =
      typeof body?.annulReason === "string" ? body.annulReason.trim() : "";

    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id },
    });

    if (!mealPlan || !canAccessEntry(actor, mealPlan)) {
      return NextResponse.json(
        { success: false, error: "Plan alimentario no encontrado" },
        { status: 404 }
      );
    }
    if (mealPlan.userId !== actor.userId) {
      return NextResponse.json(
        { success: false, error: "Solo el autor puede anular este plan" },
        { status: 403 }
      );
    }

    // Solo el autor anula (el admin lo ve, pero no lo anula).
    if (mealPlan.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: "Solo el creador puede anular este plan alimentario" },
        { status: 403 }
      );
    }

    if (mealPlan.annulledAt) {
      return NextResponse.json(
        { success: false, error: "El plan ya está anulado" },
        { status: 409 }
      );
    }

    if (!annulReason) {
      return NextResponse.json(
        { success: false, error: "Se requiere un motivo para anular el plan" },
        { status: 400 }
      );
    }

    // Inalterabilidad: se anula (no se borra).
    const authorId = actor.userId;
    await prisma.$transaction(async (tx) => {
      await tx.mealPlan.update({
        where: { id },
        data: { annulledAt: new Date(), annulReason, annulledById: authorId },
      });
      await recordClinicalVersion(tx, {
        entityType: "meal_plan",
        entityId: id,
        patientId: mealPlan.patientId,
        action: "annulled",
        data: mealPlanSnapshot(mealPlan),
        authorId,
        reason: annulReason,
      });
    });

    logAudit({
      userId: actor.userId,
      action: "DELETE",
      resource: "meal_plan",
      resourceId: id,
      // El motivo queda en el ledger; en audit, sin texto libre clínico.
      details: { patientId: mealPlan.patientId, annulled: true },
      req,
    });

    return NextResponse.json({ success: true, data: { id, annulled: true } });
  } catch (error) {
    console.error("DELETE /api/meal-plans/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar plan alimentario" },
      { status: 500 }
    );
  }
}

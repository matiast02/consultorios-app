import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMealPlanSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";
import { recordClinicalVersion, mealPlanSnapshot } from "@/lib/clinical-ledger";
import {
  CLINICAL_FORBIDDEN,
  getClinicalActor,
  grantAuditDetails,
  readScopeForList,
} from "@/lib/clinical-access";

// GET /api/meal-plans — List meal plans for a patient
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    // Lista blanca: solo roles clínicos leen planes alimentarios.
    const actor = await getClinicalActor(session.user.id);
    if (!actor) {
      return NextResponse.json(CLINICAL_FORBIDDEN, { status: 403 });
    }

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de planes alimentarios no habilitado" },
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

    // Médicos: sus planes + los que cubra una concesión vigente. Admin: todos.
    const scope = await readScopeForList(actor, patientId, "meal_plan");
    const mealPlans = await prisma.mealPlan.findMany({
      where: { patientId, ...scope.where },
      include: {
        user: {
          select: { id: true, name: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    logAudit({
      userId: actor.userId,
      action: "VIEW_SENSITIVE",
      resource: "meal_plan",
      resourceId: patientId,
      details: { list: true, count: mealPlans.length, ...grantAuditDetails(scope.grantId) },
      req,
    });

    return NextResponse.json({ success: true, data: mealPlans });
  } catch (error) {
    console.error("GET /api/meal-plans error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener planes alimentarios" },
      { status: 500 }
    );
  }
}

// POST /api/meal-plans — Create a meal plan
export async function POST(req: NextRequest) {
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

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id);
    if (!moduleEnabled) {
      return NextResponse.json(
        { success: false, error: "Modulo de planes alimentarios no habilitado" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createMealPlanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const authorId = actor.userId;
    const mealPlan = await prisma.$transaction(async (tx) => {
      const created = await tx.mealPlan.create({
        data: {
          userId: authorId,
          patientId: data.patientId,
          shiftId: data.shiftId ?? null,
          title: data.title,
          targetCalories: data.targetCalories ?? null,
          proteinPct: data.proteinPct ?? null,
          carbsPct: data.carbsPct ?? null,
          fatPct: data.fatPct ?? null,
          hydration: data.hydration ?? null,
          meals: JSON.stringify(data.meals),
          avoidFoods: data.avoidFoods ?? null,
          supplements: data.supplements ?? null,
          notes: data.notes ?? null,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, firstName: true, lastName: true },
          },
        },
      });

      await recordClinicalVersion(tx, {
        entityType: "meal_plan",
        entityId: created.id,
        patientId: data.patientId,
        action: "created",
        data: mealPlanSnapshot(created),
        authorId,
      });

      return created;
    });

    logAudit({
      userId: actor.userId,
      action: "CREATE",
      resource: "meal_plan",
      resourceId: mealPlan.id,
      // Sin texto libre en audit (el título puede describir la condición clínica).
      details: { patientId: data.patientId },
      req,
    });

    return NextResponse.json({ success: true, data: mealPlan }, { status: 201 });
  } catch (error) {
    console.error("POST /api/meal-plans error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear plan alimentario" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMealPlanSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { checkModuleAccess } from "@/lib/modules";

// GET /api/meal-plans — List meal plans for a patient
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id!);
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

    const mealPlans = await prisma.mealPlan.findMany({
      where: { patientId },
      include: {
        user: {
          select: { id: true, name: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const moduleEnabled = await checkModuleAccess("prescriptions", session.user.id!);
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

    const mealPlan = await prisma.mealPlan.create({
      data: {
        userId: session.user.id!,
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

    logAudit({
      userId: session.user.id!,
      action: "CREATE",
      resource: "meal_plan" as never,
      resourceId: mealPlan.id,
      details: { patientId: data.patientId, title: data.title },
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

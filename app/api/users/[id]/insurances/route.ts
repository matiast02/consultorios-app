import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateUserInsurancesSchema } from "@/lib/validations";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/users/[id]/insurances — List insurances accepted by this user (with copago)
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const userInsurances = await prisma.userInsurance.findMany({
      where: { userId: id },
      include: { healthInsurance: true },
      orderBy: { healthInsurance: { name: "asc" } },
    });

    // Backward-compatible: keep `data` as the list of HealthInsurance objects (consumed today
    // by older callers), but also expose `accepted` with copago for the redesign UI.
    const data = userInsurances.map((ui) => ui.healthInsurance);
    const accepted = userInsurances.map((ui) => ({
      insuranceId: ui.healthInsuranceId,
      copago: ui.copago,
      healthInsurance: ui.healthInsurance,
    }));

    return NextResponse.json({ success: true, data, accepted });
  } catch (error) {
    console.error("GET /api/users/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener obras sociales del profesional" },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id]/insurances — Replace all accepted insurances (with copago)
//
// Accepts either:
//   { insurances: [{ insuranceId, copago }] }    — new shape
//   { insuranceIds: ["abc", "def"] }              — legacy shape (copago=0)
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
    const parsed = updateUserInsurancesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Normalize input to {insuranceId, copago}[]
    const items: { insuranceId: string; copago: number }[] = parsed.data.insurances
      ? parsed.data.insurances
      : (parsed.data.insuranceIds ?? []).map((insuranceId) => ({ insuranceId, copago: 0 }));

    // Use transaction: delete all existing, then create new ones
    await prisma.$transaction(async (tx) => {
      await tx.userInsurance.deleteMany({ where: { userId: id } });

      if (items.length > 0) {
        await tx.userInsurance.createMany({
          data: items.map(({ insuranceId, copago }) => ({
            userId: id,
            healthInsuranceId: insuranceId,
            copago,
          })),
        });
      }
    });

    // Fetch updated list
    const userInsurances = await prisma.userInsurance.findMany({
      where: { userId: id },
      include: { healthInsurance: true },
      orderBy: { healthInsurance: { name: "asc" } },
    });

    const data = userInsurances.map((ui) => ui.healthInsurance);
    const accepted = userInsurances.map((ui) => ({
      insuranceId: ui.healthInsuranceId,
      copago: ui.copago,
      healthInsurance: ui.healthInsurance,
    }));

    return NextResponse.json({ success: true, data, accepted });
  } catch (error) {
    console.error("PUT /api/users/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar obras sociales del profesional" },
      { status: 500 }
    );
  }
}

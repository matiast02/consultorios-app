import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/users/[id]/insurances — List insurances accepted by this user
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
    });

    const data = userInsurances.map((ui) => ui.healthInsurance);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/users/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener obras sociales del profesional" },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id]/insurances — Replace all accepted insurances
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
    const { insuranceIds } = body;

    if (!Array.isArray(insuranceIds)) {
      return NextResponse.json(
        { success: false, error: "insuranceIds debe ser un array" },
        { status: 400 }
      );
    }

    // Validate all IDs are strings
    if (!insuranceIds.every((id: unknown) => typeof id === "string")) {
      return NextResponse.json(
        { success: false, error: "Todos los IDs deben ser strings" },
        { status: 400 }
      );
    }

    // Use transaction: delete all existing, then create new ones
    await prisma.$transaction(async (tx) => {
      await tx.userInsurance.deleteMany({ where: { userId: id } });

      if (insuranceIds.length > 0) {
        await tx.userInsurance.createMany({
          data: insuranceIds.map((healthInsuranceId: string) => ({
            userId: id,
            healthInsuranceId,
          })),
        });
      }
    });

    // Fetch updated list
    const userInsurances = await prisma.userInsurance.findMany({
      where: { userId: id },
      include: { healthInsurance: true },
    });

    const data = userInsurances.map((ui) => ui.healthInsurance);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("PUT /api/users/[id]/insurances error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar obras sociales del profesional" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createHealthInsuranceSchema } from "@/lib/validations";

// GET /api/health-insurance — List all health insurances
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const healthInsurances = await prisma.healthInsurance.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: healthInsurances });
  } catch (error) {
    console.error("GET /api/health-insurance error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener obras sociales" },
      { status: 500 }
    );
  }
}

// POST /api/health-insurance — Create health insurance
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createHealthInsuranceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const healthInsurance = await prisma.healthInsurance.create({
      data: parsed.data,
    });

    return NextResponse.json(
      { success: true, data: healthInsurance },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/health-insurance error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear obra social" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createProfessionConfigSchema } from "@/lib/validations";

// GET /api/profession-configs — List all profession configs
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const configs = await prisma.professionConfig.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { specializations: true } },
      },
    });

    return NextResponse.json({ success: true, data: configs });
  } catch (error) {
    console.error("GET /api/profession-configs error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuraciones de profesión" },
      { status: 500 }
    );
  }
}

// POST /api/profession-configs — Create profession config (admin/secretary only)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const user = session.user as { role?: string };
    if (user.role !== "admin" && user.role !== "secretary") {
      return NextResponse.json(
        { success: false, error: "Sin permisos para esta acción" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createProfessionConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check unique code
    const existing = await prisma.professionConfig.findUnique({
      where: { code: parsed.data.code },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe una configuración con ese código" },
        { status: 409 }
      );
    }

    const config = await prisma.professionConfig.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        professionalLabel: parsed.data.professionalLabel,
        patientLabel: parsed.data.patientLabel,
        prescriptionLabel: parsed.data.prescriptionLabel,
        evolutionLabel: parsed.data.evolutionLabel,
        clinicalRecordLabel: parsed.data.clinicalRecordLabel,
        enabledModules: JSON.stringify(parsed.data.enabledModules),
        clinicalFields: JSON.stringify(parsed.data.clinicalFields),
      },
      include: {
        _count: { select: { specializations: true } },
      },
    });

    return NextResponse.json(
      { success: true, data: config },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/profession-configs error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear configuración de profesión" },
      { status: 500 }
    );
  }
}

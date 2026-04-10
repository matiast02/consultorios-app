import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/users/medics — List users with medic role
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const medics = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: {
          some: {
            role: { name: "medic" },
          },
        },
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        specialization: {
          select: {
            id: true,
            name: true,
            professionConfig: { select: { name: true } },
          },
        },
        image: true,
      },
      orderBy: { lastName: "asc" },
    });

    return NextResponse.json({ success: true, data: medics });
  } catch (error) {
    console.error("GET /api/users/medics error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener médicos" },
      { status: 500 }
    );
  }
}

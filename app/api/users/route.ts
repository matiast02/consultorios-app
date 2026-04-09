import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET /api/users — List all users with roles
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        specialization: { select: { id: true, name: true } },
        image: true,
        roles: {
          select: {
            role: {
              select: { id: true, name: true },
            },
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Flatten roles for easier frontend consumption
    const data = users.map((user) => ({
      ...user,
      roles: user.roles.map((ur) => ur.role),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener usuarios" },
      { status: 500 }
    );
  }
}

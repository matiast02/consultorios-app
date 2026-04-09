import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateUserSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth-utils";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/users/[id] — Get single user with roles
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

    const user = await prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        licenseNumber: true,
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
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const data = {
      ...user,
      roles: user.roles.map((ur) => ur.role),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/users/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener usuario" },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] — Update user and role
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

    const existing = await prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { role, ...userData } = parsed.data;

    // Update user fields
    const user = await prisma.user.update({
      where: { id },
      data: userData,
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        licenseNumber: true,
        email: true,
        specialization: { select: { id: true, name: true } },
      },
    });

    // Update role if provided
    if (role) {
      const roleRecord = await prisma.role.findUnique({
        where: { name: role },
      });

      if (roleRecord) {
        // Remove existing roles
        await prisma.userRole.deleteMany({ where: { userId: id } });
        // Assign new role
        await prisma.userRole.create({
          data: { userId: id, roleId: roleRecord.id },
        });
      }
    }

    // Fetch updated user with roles
    const updated = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        licenseNumber: true,
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
    });

    const data = updated
      ? { ...updated, roles: updated.roles.map((ur) => ur.role) }
      : user;

    logAudit({
      userId: session.user.id!,
      action: "UPDATE",
      resource: "user",
      resourceId: id,
      req,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("PUT /api/users/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar usuario" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] — Soft-delete user
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

    // Only admin role can delete users
    const requesterRole = await getUserRole(session.user.id!);
    if (requesterRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Prevent deleting admin users
    const targetRole = await getUserRole(id);
    if (targetRole === "admin") {
      return NextResponse.json(
        { success: false, error: "No se puede eliminar un usuario administrador" },
        { status: 403 }
      );
    }

    // Prevent self-deletion
    if (session.user.id === id) {
      return NextResponse.json(
        { success: false, error: "No podés eliminar tu propia cuenta" },
        { status: 409 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    logAudit({
      userId: session.user.id!,
      action: "DELETE",
      resource: "user",
      resourceId: id,
      req,
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar usuario" },
      { status: 500 }
    );
  }
}

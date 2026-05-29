import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";

const ALLOWED_ROLES = new Set(["admin", "secretary"]);

const patchSchema = z.object({
  status: z.enum(["new", "read", "archived"]).optional(),
  whatsappOpened: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const role = await getUserRole(session.user.id);
    if (!role || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: { status?: string; whatsappOpened?: boolean; readAt?: Date } = {};
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
      if (parsed.data.status === "read") data.readAt = new Date();
    }
    if (parsed.data.whatsappOpened !== undefined) {
      data.whatsappOpened = parsed.data.whatsappOpened;
    }

    const updated = await prisma.contactRequest.update({
      where: { id },
      data,
      include: { specialization: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("PATCH /api/admin/contact-requests/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar la solicitud" },
      { status: 500 }
    );
  }
}

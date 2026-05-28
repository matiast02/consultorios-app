import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const shift = await prisma.shift.findUnique({ where: { id } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Turno no encontrado" }, { status: 404 });
    }
    const updated = await prisma.shift.update({
      where: { id },
      data: { arrivedAt: new Date() },
      select: { id: true, arrivedAt: true, status: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("POST /api/shifts/[id]/arrival error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const updated = await prisma.shift.update({
      where: { id },
      data: { arrivedAt: null },
      select: { id: true, arrivedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("DELETE /api/shifts/[id]/arrival error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

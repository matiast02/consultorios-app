import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSecretaryOrAdmin } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
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
    logAudit({ userId: session.user.id, action: "UPDATE", resource: "shift", resourceId: id, details: { arrival: true }, req });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("POST /api/shifts/[id]/arrival error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!(await isSecretaryOrAdmin(session.user.id))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const shift = await prisma.shift.findUnique({ where: { id }, select: { id: true } });
    if (!shift) {
      return NextResponse.json({ success: false, error: "Turno no encontrado" }, { status: 404 });
    }
    const updated = await prisma.shift.update({
      where: { id },
      data: { arrivedAt: null },
      select: { id: true, arrivedAt: true },
    });
    logAudit({ userId: session.user.id, action: "UPDATE", resource: "shift", resourceId: id, details: { arrival: false }, req });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error("DELETE /api/shifts/[id]/arrival error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

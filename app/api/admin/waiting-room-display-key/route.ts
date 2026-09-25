import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";
import { displayUrl, generateDisplayKey } from "@/lib/waiting-room/display-key";

// Clave de dispositivo de la pantalla /sala (módulo waiting_room). Solo admin.
// La clave se devuelve UNA vez (al generarla); en la base queda el hash.

async function requireAdmin() {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }) };
  }
  const role = await getUserRole(session.user.id);
  if (role !== "admin") {
    return { error: NextResponse.json({ success: false, error: "Solo administradores" }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

// GET — ¿hay clave configurada y desde cuándo? (nunca devuelve la clave)
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const row = await prisma.clinicSettings.findUnique({
      where: { id: "default" },
      select: { waitingRoomDisplayKeyHash: true, waitingRoomDisplayKeyCreatedAt: true },
    });
    return NextResponse.json({
      success: true,
      data: {
        configured: !!row?.waitingRoomDisplayKeyHash,
        createdAt: row?.waitingRoomDisplayKeyCreatedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    console.error("GET /api/admin/waiting-room-display-key error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// POST — genera (o rota) la clave. Invalida la anterior.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { key, hash } = generateDisplayKey();
    const createdAt = new Date();
    const previous = await prisma.clinicSettings.findUnique({
      where: { id: "default" },
      select: { waitingRoomDisplayKeyHash: true },
    });
    await prisma.clinicSettings.upsert({
      where: { id: "default" },
      update: { waitingRoomDisplayKeyHash: hash, waitingRoomDisplayKeyCreatedAt: createdAt },
      create: { id: "default", waitingRoomDisplayKeyHash: hash, waitingRoomDisplayKeyCreatedAt: createdAt },
    });
    logAudit({
      userId: auth.userId,
      action: "UPDATE",
      resource: "clinic_settings",
      resourceId: "default",
      details: { waitingRoomDisplayKey: previous?.waitingRoomDisplayKeyHash ? "rotated" : "created" },
      req,
    });
    return NextResponse.json({
      success: true,
      data: { key, url: displayUrl(key), createdAt: createdAt.toISOString() },
    });
  } catch (e) {
    console.error("POST /api/admin/waiting-room-display-key error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

// DELETE — revoca la clave: la pantalla deja de recibir el feed.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    await prisma.clinicSettings.upsert({
      where: { id: "default" },
      update: { waitingRoomDisplayKeyHash: null, waitingRoomDisplayKeyCreatedAt: null },
      create: { id: "default" },
    });
    logAudit({
      userId: auth.userId,
      action: "UPDATE",
      resource: "clinic_settings",
      resourceId: "default",
      details: { waitingRoomDisplayKey: "revoked" },
      req,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/admin/waiting-room-display-key error", e);
    return NextResponse.json({ success: false, error: "Error" }, { status: 500 });
  }
}

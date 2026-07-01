import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated. Aggregated payload used by the landing.
// Cache: revalidate every 60s (datos editables desde dashboard).
export const revalidate = 60;

export async function GET() {
  try {
    const [settingsRow, hours, medics, specializations, healthInsurances] = await Promise.all([
      prisma.clinicSettings.findUnique({ where: { id: "default" } }),
      prisma.clinicHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
      prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          roles: { some: { role: { name: "medic" } } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          image: true,
          bio: true,
          licenseNumber: true,
          specialization: { select: { id: true, name: true, color: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.specialization.findMany({
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { users: { where: { isActive: true, deletedAt: null } } } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.healthInsurance.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const settings = settingsRow
      ? {
          ...settingsRow,
          mapLat: settingsRow.mapLat == null ? null : Number(settingsRow.mapLat),
          mapLng: settingsRow.mapLng == null ? null : Number(settingsRow.mapLng),
        }
      : null;

    const publicSpecializations = specializations
      .filter((s) => s._count.users > 0)
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        medicCount: s._count.users,
      }));

    return NextResponse.json({
      success: true,
      data: {
        settings,
        hours,
        medics,
        specializations: publicSpecializations,
        healthInsurances,
      },
    });
  } catch (error) {
    console.error("GET /api/public/clinic-info error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener información del consultorio" },
      { status: 500 }
    );
  }
}

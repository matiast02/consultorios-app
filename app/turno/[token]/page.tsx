import type { Metadata } from "next";
import { ShiftConfirmation } from "@/components/turno/shift-confirmation";

// Página pública (sin login) del link de confirmación que llega en el recordatorio.
// Contrato: lib/openapi/paths/public.ts → /api/public/turno/{token}.
// Solo muestra lo que devuelve el endpoint (nombre de pila, fecha, hora,
// profesional, dirección y estado). Nada clínico.

export const metadata: Metadata = {
  title: "Tu turno",
  robots: { index: false, follow: false, nocache: true },
  // El token viaja en la URL: que no se filtre por Referer.
  referrer: "no-referrer",
};

export default async function TurnoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShiftConfirmation token={token} />;
}

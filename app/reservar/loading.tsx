import { PanelSkeleton, PublicShell } from "@/components/booking/public-ui";

export default function Loading() {
  return (
    <PublicShell subtitle="Reservá tu turno online">
      <PanelSkeleton label="Cargando la reserva online…" />
    </PublicShell>
  );
}

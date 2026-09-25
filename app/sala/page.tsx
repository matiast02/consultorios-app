import type { Metadata } from "next";
import { WaitingRoomDisplay } from "@/components/waiting-room/display";

// Pantalla pública de la sala de espera (módulo waiting_room). Se abre en el
// televisor con /sala?k=<clave>; la clave se genera en Configuración →
// Consultorio. Muestra números y consultorios, nunca nombres.

export const metadata: Metadata = {
  title: "Sala de espera",
  robots: { index: false, follow: false },
};

export default function SalaPage() {
  return <WaitingRoomDisplay />;
}

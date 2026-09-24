import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// Texto legal compartido por los formularios públicos (contacto y reserva online).
// Ley 25.326 art. 5-6 y Disp. DNPDP 10/2008: no cambiar el texto sin revisión legal.

/** Texto de la casilla de aceptación (va dentro del <label> del checkbox). */
export function PrivacyConsentText() {
  return (
    <>
      Acepto que mis datos se usen para coordinar el turno y contactarme, conforme a la{" "}
      <strong style={{ color: "var(--foreground)" }}>Ley 25.326 de Protección de Datos Personales</strong>.
    </>
  );
}

/** Desplegable "Cómo tratamos tus datos" con la leyenda de la Disp. DNPDP 10/2008. */
export function PrivacyDetails({ className }: { className?: string }) {
  return (
    <details className={cn("text-[12px] leading-relaxed", className)}>
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
        <Shield className="h-[14px] w-[14px]" style={{ color: "var(--primary)" }} />
        Cómo tratamos tus datos
      </summary>
      <p className="mt-1.5">
        Responsable: el consultorio. Finalidad: coordinar tu turno y contactarte por el medio que
        indicaste. Los datos no se ceden a terceros salvo obligación legal y se conservan solo el
        tiempo necesario para esa finalidad. Podés ejercer los derechos de acceso, rectificación y
        supresión escribiéndonos por WhatsApp o email.
      </p>
      <p className="mt-1.5">
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
        mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
        interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
        25.326. La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326,
        tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al
        incumplimiento de las normas sobre protección de datos personales.
      </p>
    </details>
  );
}

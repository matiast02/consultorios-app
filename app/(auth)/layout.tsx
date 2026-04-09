import { Stethoscope } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Stethoscope className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">ConsultorioApp</span>
          </Link>
        </div>
      </header>

      {/* Main split layout */}
      <div className="flex flex-1">
        {/* Left decorative panel — hidden on mobile */}
        <div className="hidden flex-col items-center justify-center gap-8 bg-primary px-12 lg:flex lg:w-[420px] xl:w-[480px]">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 shadow-xl">
            <Stethoscope className="h-10 w-10 text-white" />
          </div>
          <div className="text-center text-white">
            <h2 className="text-2xl font-bold">ConsultorioApp</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Gestión inteligente de tu consultorio médico
            </p>
          </div>
          <div className="w-full space-y-3">
            {[
              "Agenda de turnos completa",
              "Historias clínicas digitales",
              "Estadísticas del consultorio",
              "Gestión de pacientes",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-white/60" />
                <p className="text-sm text-white/80">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right form area */}
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}

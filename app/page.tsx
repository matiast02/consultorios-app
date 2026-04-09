import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Stethoscope,
  CalendarCheck,
  Users,
  BarChart3,
  FileText,
  ArrowRight,
  Shield,
  Clock,
} from "lucide-react";

export default async function Home() {
  const session = await auth();

  const features = [
    {
      icon: FileText,
      title: "Historia Clínica",
      description:
        "Registro digital completo de cada paciente: antecedentes, evoluciones, diagnósticos y tratamientos en un solo lugar.",
      color: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-50 dark:bg-cyan-950/40",
    },
    {
      icon: CalendarCheck,
      title: "Agenda Inteligente",
      description:
        "Gestiona turnos con vistas de mes, semana y día. Configura tus horarios y bloquea días según tu disponibilidad.",
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      icon: BarChart3,
      title: "Estadísticas",
      description:
        "Visualiza el rendimiento de tu consultorio con métricas de turnos, obras sociales y evolución mensual.",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/40",
    },
    {
      icon: Users,
      title: "Gestión de Pacientes",
      description:
        "Administra el listado de pacientes, datos personales, obra social y toda su información de manera centralizada.",
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-950/40",
    },
  ];

  const highlights = [
    { icon: Shield, label: "Datos seguros y privados" },
    { icon: Clock, label: "Acceso rápido en cualquier momento" },
    { icon: Stethoscope, label: "Diseñado para profesionales de la salud" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Stethoscope className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              ConsultorioApp
            </span>
          </div>
          <div className="flex items-center gap-2">
            {session ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  Ir al Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Iniciar Sesión</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">Registrarse</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-24 text-center">
        {/* Decorative background circles */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-20 right-0 h-64 w-64 rounded-full bg-accent/40 blur-3xl"
        />

        {/* Medical cross badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5">
          <Stethoscope className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            Sistema de Gestión Médica
          </span>
        </div>

        {/* Brand icon */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
          <Stethoscope className="h-10 w-10 text-primary-foreground" />
        </div>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
          <span className="text-primary">ConsultorioApp</span>
        </h1>
        <p className="mt-4 max-w-xl text-xl font-medium text-foreground/80">
          Gestión inteligente de tu consultorio médico
        </p>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          La herramienta completa para médicos y secretarias. Agenda turnos,
          gestiona pacientes e historias clínicas desde un sistema moderno y
          seguro.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {session ? (
            <Button asChild size="lg" className="px-8 shadow-md shadow-primary/20">
              <Link href="/dashboard">
                Ir al Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg" className="px-8 shadow-md shadow-primary/20">
                <Link href="/login">
                  Iniciar Sesión
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="px-8">
                <Link href="/register">Registrarse</Link>
              </Button>
            </>
          )}
        </div>

        {/* Trust highlights */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
          {highlights.map((h) => (
            <div key={h.label} className="flex items-center gap-2 text-sm text-muted-foreground">
              <h.icon className="h-4 w-4 text-primary" />
              <span>{h.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Todo lo que necesitas en un solo lugar
          </h2>
          <p className="mt-2 text-muted-foreground">
            Herramientas diseñadas específicamente para la práctica médica
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.bg}`}
              >
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              ConsultorioApp
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Sistema profesional de gestión de consultorios médicos
          </p>
        </div>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  Palette,
  Stethoscope,
  Users,
} from "lucide-react";
import type { CatalogHealth } from "@/types";

interface CatalogHealthCardProps {
  health: CatalogHealth;
}

interface Severity {
  className: string;
}

function severityChip(value: number): Severity {
  if (value <= 0) {
    return {
      className:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  }
  if (value < 5) {
    return {
      className:
        "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    };
  }
  return {
    className: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  };
}

export function CatalogHealthCard({ health }: CatalogHealthCardProps) {
  const patients = health.patientsIncomplete;
  const medics = health.medicsWithoutPreferences;
  const insurances = health.healthInsurancesUnused90d;
  const specs = health.specializationsWithoutColor;
  const modules = health.modules ?? [];

  const allClear =
    patients.total === 0 &&
    medics.count === 0 &&
    insurances.count === 0 &&
    specs.count === 0;

  const medicPreview = medics.items.slice(0, 3).map((m) => m.name).join(", ");

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <HeartPulse className="h-4 w-4 text-muted-foreground" />
          Salud del catálogo
        </div>
        {allClear && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Todo en orden
          </span>
        )}
      </div>

      {allClear ? (
        <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Catálogo en orden ✓</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No detectamos huecos en el catálogo del consultorio.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {/* Pacientes incompletos */}
          <li className="px-5 py-3">
            <Link
              href="/dashboard/pacientes"
              className="group flex items-start gap-3 transition hover:opacity-80"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">
                    Pacientes incompletos
                  </span>
                  {patients.total > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${severityChip(patients.total).className}`}
                    >
                      {patients.total}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground tabular-nums">
                  <span>Sin DNI {patients.missingDni}</span>
                  <span>Sin teléfono {patients.missingPhone}</span>
                  <span>Sin O.S. {patients.missingHealthInsurance}</span>
                </div>
              </div>
            </Link>
          </li>

          {/* Médicos sin horarios */}
          <li className="px-5 py-3">
            <Link
              href="/dashboard/administracion/profesionales"
              className="group flex items-start gap-3 transition hover:opacity-80"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-foreground">
                    Médicos sin horarios
                  </span>
                  {medics.count > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${severityChip(medics.count).className}`}
                    >
                      {medics.count}
                    </span>
                  )}
                </div>
                {medicPreview && (
                  <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                    {medicPreview}
                    {medics.count > 3 && ` y ${medics.count - 3} más`}
                  </div>
                )}
              </div>
            </Link>
          </li>

          {/* Obras sociales sin uso */}
          <li className="px-5 py-3">
            <Link
              href="/dashboard/administracion/obras-sociales"
              className="group flex items-center gap-3 transition hover:opacity-80"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  O.S. sin uso 90 días
                </span>
                {insurances.count > 0 && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${severityChip(insurances.count).className}`}
                  >
                    {insurances.count}
                  </span>
                )}
              </div>
            </Link>
          </li>

          {/* Especialidades sin color */}
          <li className="px-5 py-3">
            <Link
              href="/dashboard/administracion/especialidades"
              className="group flex items-center gap-3 transition hover:opacity-80"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Palette className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  Especialidades sin color
                </span>
                {specs.count > 0 && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${severityChip(specs.count).className}`}
                  >
                    {specs.count}
                  </span>
                )}
              </div>
            </Link>
          </li>
        </ul>
      )}

      {/* Módulos */}
      {modules.length > 0 && (
        <div className="border-t px-5 py-3">
          <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" />
            Módulos
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            {modules.map((m) => (
              <li
                key={m.module}
                className="inline-flex items-center gap-1.5 text-[12px] text-foreground/80"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    m.enabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-hidden
                />
                <span>{m.name}</span>
                <span className="text-muted-foreground">({m.enabled ? "activo" : "off"})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

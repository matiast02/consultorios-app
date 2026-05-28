"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Edit,
  MessageCircle,
  Phone,
} from "lucide-react";
import type { Patient } from "@/types";
import { cn } from "@/lib/utils";

interface PatientHeaderProps {
  patient: Patient;
  totalShifts: number;
  lastShift?: { date: Date; rel: string } | null;
  nextShift?: { date: Date; rel: string } | null;
  activePrescriptions: { count: number; nextExpiry?: Date | null } | null;
  onEdit: () => void;
  onNewShift: () => void;
}

function calcAge(birth?: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}

function fmtDateAR(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtMonthDay(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function PatientStat({
  label,
  children,
  isFirst,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  isFirst?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-1 px-4",
        !isFirst &&
          "before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-border",
      )}
    >
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-bold tabular-nums tracking-tight text-[18px] leading-snug",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function SexLabel(sex?: string | null) {
  if (!sex) return null;
  if (sex === "M") return "Masculino";
  if (sex === "F") return "Femenino";
  return "Otro";
}

export function PatientHeader({
  patient,
  totalShifts,
  lastShift,
  nextShift,
  activePrescriptions,
  onEdit,
  onNewShift,
}: PatientHeaderProps) {
  const router = useRouter();
  const age = calcAge(patient.birthDate);
  const initials = (
    (patient.firstName?.[0] ?? "") + (patient.lastName?.[0] ?? "")
  ).toUpperCase();
  const fullPhone = patient.telephone?.replace(/[^\d+]/g, "");

  return (
    <div className="rounded-xl bg-gradient-to-b from-cyan-50/60 to-transparent px-6 pt-5 dark:from-cyan-950/20">
      {/* Breadcrumbs */}
      <nav className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/dashboard/pacientes"
          className="transition-colors hover:text-primary"
        >
          Pacientes
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground/70">
          {patient.lastName}, {patient.firstName}
        </span>
      </nav>

      {/* Identity row */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-[280px] flex-1 items-start gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/dashboard/pacientes")}
            className="mr-1 h-8 w-8 shrink-0 bg-background"
            aria-label="Volver"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>

          <Avatar className="size-16 shrink-0 bg-gradient-to-br from-cyan-200 to-cyan-100 ring-2 ring-background shadow-sm dark:from-cyan-800/40 dark:to-cyan-900/30">
            <AvatarFallback className="bg-transparent text-[22px] font-bold text-primary">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-tight tracking-tight">
              {patient.lastName}, {patient.firstName}
            </h1>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">
              {age !== null && (
                <>
                  <strong className="font-semibold text-foreground/80">
                    {age} años
                  </strong>
                  {" · "}
                </>
              )}
              {SexLabel(patient.sex) && (
                <>
                  {SexLabel(patient.sex)}
                  {" · "}
                </>
              )}
              DNI{" "}
              <strong className="font-semibold text-foreground/80">
                {patient.dni ?? "—"}
              </strong>
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Paciente activo
              </Badge>
              {patient.os?.name && (
                <Badge className="border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-50 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300">
                  {patient.os.name}
                  {patient.osNumber ? ` · ${patient.osNumber}` : ""}
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="bg-muted text-muted-foreground hover:bg-muted"
              >
                Desde {fmtMonthDay(new Date(patient.createdAt))}
              </Badge>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {fullPhone && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <a href={`tel:${fullPhone}`}>
                <Phone className="mr-1.5 h-4 w-4" />
                Llamar
              </a>
            </Button>
          )}
          {fullPhone && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <a
                href={`https://wa.me/${fullPhone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={onNewShift}>
            <Calendar className="mr-1.5 h-4 w-4" />
            Nuevo turno
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={onEdit}>
            <Edit className="mr-1.5 h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="mt-5 grid grid-cols-2 gap-y-3 border-t pt-4 sm:grid-cols-4 sm:gap-y-0">
        <PatientStat label="Total consultas" isFirst>
          {totalShifts}
        </PatientStat>
        <PatientStat label="Última visita">
          {lastShift ? (
            <>
              {fmtDateAR(lastShift.date)}
              <span className="ml-1.5 text-[12.5px] font-medium text-muted-foreground">
                {lastShift.rel}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </PatientStat>
        <PatientStat label="Próximo turno" highlight={!!nextShift}>
          {nextShift ? (
            <>
              {fmtDateAR(nextShift.date)}
              <span className="ml-1.5 text-[12.5px] font-medium text-muted-foreground">
                {nextShift.rel}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </PatientStat>
        <PatientStat label="Recetas vigentes">
          {activePrescriptions?.count ?? 0}
          {activePrescriptions?.nextExpiry && (
            <span className="ml-1.5 text-[12.5px] font-medium text-muted-foreground">
              caduca {fmtMonthDay(activePrescriptions.nextExpiry)}
            </span>
          )}
        </PatientStat>
      </div>
    </div>
  );
}

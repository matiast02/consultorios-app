"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Calendar,
  Edit,
  Mail,
  Pill,
  Plus,
  X,
} from "lucide-react";
import type {
  AllergySeverity,
  ClinicalRecord,
  Evolution,
  Shift,
  StructuredAllergy,
} from "@/types";
import {
  SectionHead,
  fmtDateAR,
  fmtDateLong,
  fmtTime,
  relTime,
} from "./shared";
import { cn } from "@/lib/utils";

interface ResumenTabProps {
  /**
   * Whether the current user can see/manage clinical information. Set to false
   * for non-clinical roles (e.g. secretaries) — the tab will hide the last
   * evolution and the "Nueva evolución / Nueva receta / Enviar resumen" actions.
   */
  canManageClinical: boolean;
  record: ClinicalRecord | null;
  evolutions: Evolution[];
  nextShift?: Shift | null;
  chronicMedications: string[];
  structuredAllergies: StructuredAllergy[];
  onNewEvolution: () => void;
  onNewPrescription: () => void;
  onNewShift: () => void;
  onGoToEvolutions: () => void;
}

const SEVERITY_TONE: Record<AllergySeverity, string> = {
  alta: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200",
  media:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
  baja:
    "border-border bg-muted/60 text-foreground/80",
};

function getDocName(evo: Evolution): string {
  if (!evo.user) return "Profesional";
  const parts = [evo.user.firstName, evo.user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return evo.user.name ?? "Profesional";
}

export function ResumenTab({
  canManageClinical,
  record,
  evolutions,
  nextShift,
  chronicMedications,
  structuredAllergies,
  onNewEvolution,
  onNewPrescription,
  onNewShift,
  onGoToEvolutions,
}: ResumenTabProps) {
  const lastEvo = evolutions[0];

  return (
    <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[2fr_1fr]">
      {/* LEFT column */}
      <div className="flex flex-col gap-[18px]">
        {/* Last evolution — hidden for non-clinical roles (e.g. secretary) */}
        {!canManageClinical ? null : lastEvo ? (
          <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
            <SectionHead
              icon={Calendar}
              title="Última evolución"
              description={`${fmtDateLong(new Date(lastEvo.createdAt))} a las ${fmtTime(new Date(lastEvo.createdAt))} · ${getDocName(lastEvo)}`}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={onGoToEvolutions}
                >
                  Ver completa
                </Button>
              }
            />
            <div className="border-l-4 border-l-primary bg-gradient-to-r from-primary/[0.06] via-transparent to-transparent px-6 py-4">
              {(lastEvo.diagnosis || lastEvo.diagnosisCode) && (
                <div className="mb-2.5 text-[13px]">
                  {lastEvo.diagnosisCode && (
                    <span className="mr-1.5 inline-block rounded border bg-muted px-1.5 py-px font-mono text-[11px] text-foreground/70">
                      {lastEvo.diagnosisCode}
                    </span>
                  )}
                  <strong className="font-bold">{lastEvo.diagnosis}</strong>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {lastEvo.reason && (
                  <SnippetSection title="Motivo">
                    {lastEvo.reason}
                  </SnippetSection>
                )}
                {lastEvo.physicalExam && (
                  <SnippetSection title="Examen físico">
                    {lastEvo.physicalExam}
                  </SnippetSection>
                )}
                {lastEvo.indications && (
                  <SnippetSection title="Indicaciones" full>
                    {lastEvo.indications}
                  </SnippetSection>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden p-6 shadow-xs">
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Calendar className="h-6 w-6 text-muted-foreground/60" />
              </span>
              <p className="text-sm text-muted-foreground">
                No hay evoluciones registradas todavía.
              </p>
              <Button size="sm" onClick={onNewEvolution}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nueva evolución
              </Button>
            </div>
          </Card>
        )}

        {/* Chronic meds — clinical only */}
        {canManageClinical && (
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead
            icon={Pill}
            title="Medicación crónica"
            description="Tratamientos en curso del paciente."
          />
          <div className="space-y-1.5 px-6 pt-4">
            {chronicMedications.length === 0 && !record?.currentMedication ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                Sin medicación crónica registrada.
              </p>
            ) : chronicMedications.length > 0 ? (
              chronicMedications.map((med, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-[10px] border bg-card px-3.5 py-2.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                    <Pill className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-[13.5px] font-semibold">
                    {med}
                  </div>
                  {canManageClinical && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-[10px] border bg-card px-3.5 py-2.5 text-[13px] text-foreground/80">
                {record?.currentMedication}
              </div>
            )}
          </div>
        </Card>
        )}
      </div>

      {/* RIGHT column */}
      <div className="flex flex-col gap-[18px]">
        {/* Quick actions */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead title="Acciones rápidas" />
          <div className="space-y-1.5 px-6 pt-4">
            {canManageClinical && (
              <>
                <QuickAction icon={Plus} label="Nueva evolución" onClick={onNewEvolution} />
                <QuickAction icon={Edit} label="Nueva receta" onClick={onNewPrescription} />
              </>
            )}
            <QuickAction
              icon={Calendar}
              label="Agendar próximo turno"
              onClick={onNewShift}
            />
            {canManageClinical && (
              <QuickAction icon={Mail} label="Enviar resumen por mail" />
            )}
          </div>
        </Card>

        {/* Allergies */}
        <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
          <SectionHead icon={AlertTriangle} title="Alergias" />
          <div className="space-y-1.5 px-6 pt-4">
            {structuredAllergies.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                Sin alergias registradas.
              </p>
            ) : (
              structuredAllergies.map((a, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[9px] border px-3 py-2.5 text-[12.5px]",
                    SEVERITY_TONE[a.severidad],
                  )}
                >
                  <strong className="font-bold">{a.nombre}</strong>
                  {a.nota && <span className="opacity-90">· {a.nota}</span>}
                  <span className="ml-auto text-[10.5px] font-bold uppercase tracking-[0.04em]">
                    {a.severidad}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Next appointment */}
        {nextShift && (
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card pb-5 pt-5 shadow-xs">
            <div className="px-6">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-primary">
                Próximo turno
              </div>
              <div className="mt-1.5 text-[20px] font-bold tracking-tight">
                {fmtDateAR(new Date(nextShift.start))} ·{" "}
                {fmtTime(new Date(nextShift.start))}
              </div>
              <div className="mt-1 text-[13px] text-muted-foreground">
                {nextShift.consultationType?.name ?? "Turno"} ·{" "}
                {relTime(new Date(nextShift.start))}
              </div>
              {nextShift.observations && (
                <p className="mt-2 text-[12.5px] text-foreground/80">
                  {nextShift.observations}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="h-8 flex-1">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button variant="outline" size="sm" className="h-8 flex-1">
                  <Edit className="mr-1.5 h-3.5 w-3.5" />
                  Reprogramar
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function SnippetSection({
  title,
  children,
  full,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-muted/40 px-3 py-2.5",
        full && "sm:col-span-2",
      )}
    >
      <h5 className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </h5>
      <p className="line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/85">
        {children}
      </p>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Edit;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[9px] border bg-card px-3 py-2.5 text-left text-[13px] font-medium",
        "text-foreground/80 transition-colors",
        "hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      {label}
    </button>
  );
}

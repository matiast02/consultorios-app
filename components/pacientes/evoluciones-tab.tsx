"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  Search,
  Stethoscope,
} from "lucide-react";
import type { Evolution } from "@/types";
import { SectionHead, fmtDateAR, fmtTime, relTime } from "./shared";
import { cn } from "@/lib/utils";

interface EvolucionesTabProps {
  evolutions: Evolution[];
  onNew: () => void;
}

function getDocName(evo: Evolution): string {
  if (!evo.user) return "Profesional";
  const parts = [evo.user.firstName, evo.user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return evo.user.name ?? "Profesional";
}

export function EvolucionesTab({ evolutions, onNew }: EvolucionesTabProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    evolutions[0] ? { [evolutions[0].id]: true } : {},
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return evolutions;
    const q = query.toLowerCase();
    return evolutions.filter(
      (e) =>
        (e.diagnosis?.toLowerCase().includes(q) ?? false) ||
        (e.diagnosisCode?.toLowerCase().includes(q) ?? false) ||
        (e.reason?.toLowerCase().includes(q) ?? false) ||
        (e.treatment?.toLowerCase().includes(q) ?? false) ||
        getDocName(e).toLowerCase().includes(q),
    );
  }, [evolutions, query]);

  const toggle = (id: string) =>
    setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
      <SectionHead
        icon={Calendar}
        title="Evoluciones"
        description={
          evolutions.length > 0
            ? `${evolutions.length} entradas · última ${relTime(new Date(evolutions[0].createdAt))}`
            : "Sin evoluciones registradas."
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar evoluciones..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-[200px] pl-8 text-[13px]"
              />
            </div>
            <Button size="sm" onClick={onNew} className="h-8">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nueva evolución
            </Button>
          </div>
        }
      />

      <div className="px-6 pt-4">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {query
              ? `No hay evoluciones que coincidan con "${query}".`
              : "No hay evoluciones registradas para este paciente."}
          </div>
        ) : (
          <div
            className={cn(
              "relative pl-7",
              "before:absolute before:left-[11px] before:top-1.5 before:bottom-1.5 before:w-0.5",
              "before:bg-gradient-to-b before:from-border before:via-border before:to-transparent",
            )}
          >
            {filtered.map((e) => {
              const open = !!expanded[e.id];
              const date = new Date(e.createdAt);
              return (
                <div
                  key={e.id}
                  className={cn(
                    "relative mb-[14px] cursor-pointer rounded-xl border bg-card px-4 py-3.5 transition-colors",
                    open && "border-primary/30 shadow-xs",
                    "before:absolute before:left-[-22px] before:top-[18px] before:h-3 before:w-3 before:rounded-full before:bg-card before:ring-[3px] before:ring-background",
                    open ? "before:border-primary" : "before:border-muted-foreground/40",
                    "before:border-[3px]",
                  )}
                  onClick={() => toggle(e.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <strong className="font-semibold tabular-nums text-foreground/80">
                            {fmtDateAR(date)}
                          </strong>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {fmtTime(date)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Stethoscope className="h-3.5 w-3.5" />
                          {getDocName(e)}
                        </span>
                        <Badge className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/10">
                          {e.diagnosis ? "Evolución" : "Nota"}
                        </Badge>
                      </div>
                      {(e.diagnosis || e.diagnosisCode) && (
                        <div className="mt-2 text-[13px]">
                          {e.diagnosisCode && (
                            <span className="mr-1.5 inline-block rounded border bg-muted px-1.5 py-px font-mono text-[11px] text-foreground/70">
                              {e.diagnosisCode}
                            </span>
                          )}
                          <strong className="font-bold">{e.diagnosis}</strong>
                        </div>
                      )}
                      {e.reason && !open && (
                        <p className="mt-2 line-clamp-1 text-[13px] text-foreground/80">
                          {e.reason}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[12px] text-muted-foreground hover:text-primary"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggle(e.id);
                      }}
                    >
                      {open ? (
                        <>
                          <ChevronUp className="mr-1 h-3.5 w-3.5" />
                          Colapsar
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-1 h-3.5 w-3.5" />
                          Expandir
                        </>
                      )}
                    </Button>
                  </div>

                  {open && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {e.reason && (
                        <Section title="Motivo de consulta">{e.reason}</Section>
                      )}
                      {e.physicalExam && (
                        <Section title="Examen físico">{e.physicalExam}</Section>
                      )}
                      {e.treatment && (
                        <Section title="Tratamiento">{e.treatment}</Section>
                      )}
                      {e.indications && (
                        <Section title="Indicaciones">{e.indications}</Section>
                      )}
                      {e.notes && (
                        <Section title="Notas adicionales" full>
                          {e.notes}
                        </Section>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function Section({
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
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/85">
        {children}
      </p>
    </div>
  );
}

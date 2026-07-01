"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, FileText, Mail, Plus, RefreshCw, History, Ban } from "lucide-react";
import type { Prescription, PrescriptionItem } from "@/types";
import { SectionHead, fmtDateAR, relTime, safeParseJSON } from "./shared";
import { cn } from "@/lib/utils";

type Filter = "todas" | "vigente" | "vencida";

interface RecetasTabProps {
  prescriptions: Prescription[];
  onNew: () => void;
  onView: (p: Prescription) => void;
  onAnnul?: (p: Prescription) => void;
  onHistory?: (p: Prescription) => void;
  currentUserId?: string | null;
}

function isExpired(p: Prescription, now: Date): boolean {
  const days = p.durationDays ?? 90;
  const validUntil = new Date(
    new Date(p.createdAt).getTime() + days * 24 * 60 * 60 * 1000,
  );
  return validUntil.getTime() < now.getTime();
}

function expiryDate(p: Prescription): Date {
  const days = p.durationDays ?? 90;
  return new Date(new Date(p.createdAt).getTime() + days * 24 * 60 * 60 * 1000);
}

function getDocName(p: Prescription): string {
  if (!p.user) return "Profesional";
  const parts = [p.user.firstName, p.user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return p.user.name ?? "Profesional";
}

export function RecetasTab({ prescriptions, onNew, onView, onAnnul, onHistory, currentUserId }: RecetasTabProps) {
  const [filter, setFilter] = useState<Filter>("todas");
  const now = new Date();

  const decorated = useMemo(
    () =>
      prescriptions.map((p) => ({
        ...p,
        _expired: isExpired(p, now),
        _expiry: expiryDate(p),
        _items: safeParseJSON<PrescriptionItem[]>(p.items, []),
      })),
    [prescriptions, now],
  );

  const vigentes = decorated.filter((p) => !p._expired).length;
  const vencidas = decorated.filter((p) => p._expired).length;

  const filtered = decorated.filter((p) =>
    filter === "todas"
      ? true
      : filter === "vigente"
        ? !p._expired
        : p._expired,
  );

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
      <SectionHead
        icon={FileText}
        title="Recetas"
        description={`${prescriptions.length} en total · ${vigentes} vigente${vigentes === 1 ? "" : "s"} · ${vencidas} vencida${vencidas === 1 ? "" : "s"}`}
        actions={
          <div className="flex items-center gap-2">
            <FilterPills value={filter} onChange={setFilter} />
            <Button size="sm" onClick={onNew} className="h-8">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nueva receta
            </Button>
          </div>
        }
      />

      <div className="space-y-2.5 px-6 pt-4">
        {sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {filter === "todas"
              ? "No hay recetas para este paciente."
              : `No hay recetas en el filtro "${filter}".`}
          </div>
        ) : (
          sorted.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-start gap-4 rounded-xl border bg-card px-4 py-3.5",
                (p._expired || p.annulledAt) && "opacity-70",
              )}
            >
              {/* Tear strip */}
              <div
                className={cn(
                  "w-1.5 self-stretch rounded-sm",
                  p._expired
                    ? "bg-[repeating-linear-gradient(180deg,var(--color-muted-foreground)_0,var(--color-muted-foreground)_6px,transparent_6px,transparent_12px)] opacity-40"
                    : "bg-[repeating-linear-gradient(180deg,var(--color-primary)_0,var(--color-primary)_6px,transparent_6px,transparent_12px)]",
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-bold tabular-nums">
                    {fmtDateAR(new Date(p.createdAt))}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    · {p.diagnosis ?? "Sin diagnóstico"} · {getDocName(p)}
                  </span>
                  {p.annulledAt ? (
                    <Badge
                      variant="secondary"
                      className="ml-auto bg-destructive/10 text-destructive hover:bg-destructive/10"
                    >
                      Anulada
                    </Badge>
                  ) : !p._expired ? (
                    <Badge className="ml-auto border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                      Vigente · vence {fmtDateAR(p._expiry)}
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="ml-auto bg-muted text-muted-foreground hover:bg-muted"
                    >
                      Vencida {relTime(p._expiry, now)}
                    </Badge>
                  )}
                </div>

                <ul className="flex flex-col gap-1">
                  {p._items.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-baseline gap-2 py-1 text-[12.5px]"
                    >
                      <span className="w-4 shrink-0 text-right font-bold tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="font-semibold text-foreground">
                        {it.medication}
                      </span>
                      {it.dose && (
                        <span className="text-muted-foreground">
                          · {it.dose}
                        </span>
                      )}
                      {it.frequency && (
                        <span className="text-muted-foreground">
                          · {it.frequency}
                        </span>
                      )}
                      {it.duration && (
                        <span className="text-muted-foreground">
                          · {it.duration}
                        </span>
                      )}
                      {it.notes && (
                        <span className="ml-auto text-[12px] text-foreground/70">
                          {it.notes}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => onView(p)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Ver/Imprimir
                </Button>
                {p._expired && !p.annulledAt ? (
                  <Button size="sm" className="h-8" onClick={onNew}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Renovar
                  </Button>
                ) : !p.annulledAt ? (
                  <Button variant="ghost" size="sm" className="h-8">
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    Enviar
                  </Button>
                ) : null}
                {onHistory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-primary"
                    onClick={() => onHistory(p)}
                  >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Historial
                  </Button>
                )}
                {onAnnul && !p.annulledAt && (!currentUserId || p.userId === currentUserId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onAnnul(p)}
                  >
                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                    Anular
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function FilterPills({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const opts: { id: Filter; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "vigente", label: "Vigentes" },
    { id: "vencida", label: "Vencidas" },
  ];
  return (
    <div className="flex items-center gap-1">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            value === o.id
              ? "border-primary/30 bg-primary/10 font-semibold text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

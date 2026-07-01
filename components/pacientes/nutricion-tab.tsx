"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Plus, Salad, History, Ban } from "lucide-react";
import type { MealPlan } from "@/types";
import { SectionHead, fmtDateAR } from "./shared";

interface NutricionTabProps {
  mealPlans: MealPlan[];
  onNew: () => void;
  onView: (p: MealPlan) => void;
  onEdit: (p: MealPlan) => void;
  onAnnul?: (p: MealPlan) => void;
  onHistory?: (p: MealPlan) => void;
  currentUserId?: string | null;
}

function getDocName(p: MealPlan): string {
  if (!p.user) return "Profesional";
  const parts = [p.user.firstName, p.user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return p.user.name ?? "Profesional";
}

export function NutricionTab({ mealPlans, onNew, onView, onEdit, onAnnul, onHistory, currentUserId }: NutricionTabProps) {
  const sorted = [...mealPlans].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
      <SectionHead
        icon={Salad}
        title="Planes alimentarios"
        description={`${mealPlans.length} en total`}
        actions={
          <Button size="sm" onClick={onNew} className="h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo plan
          </Button>
        }
      />

      <div className="space-y-2.5 px-6 pt-4">
        {sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No hay planes alimentarios para este paciente.
          </div>
        ) : (
          sorted.map((p) => {
            const macros: string[] = [];
            if (p.targetCalories) macros.push(`${p.targetCalories} kcal`);
            if (p.proteinPct) macros.push(`Prot ${p.proteinPct}%`);
            if (p.carbsPct) macros.push(`HC ${p.carbsPct}%`);
            if (p.fatPct) macros.push(`Grasas ${p.fatPct}%`);
            return (
              <div
                key={p.id}
                className={`flex items-start gap-4 rounded-xl border bg-card px-4 py-3.5${p.annulledAt ? " opacity-70" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-bold tabular-nums">
                      {fmtDateAR(new Date(p.createdAt))}
                    </span>
                    <span className="truncate text-[13.5px] font-semibold text-foreground">
                      · {p.title}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      · {getDocName(p)}
                    </span>
                    {p.annulledAt && (
                      <Badge variant="secondary" className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        Anulado
                      </Badge>
                    )}
                  </div>
                  {macros.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {macros.map((m) => (
                        <Badge
                          key={m}
                          variant="secondary"
                          className="bg-muted text-[11px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}
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
                  {!p.annulledAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => onEdit(p)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
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
            );
          })
        )}
      </div>
    </Card>
  );
}

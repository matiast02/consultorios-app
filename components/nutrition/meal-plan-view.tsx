"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Printer,
  UtensilsCrossed,
  Droplets,
  Flame,
  Clock,
  AlertTriangle,
  Pill,
  FileText,
  Stethoscope,
} from "lucide-react";
import type { MealPlan, MealSection } from "@/types";

interface MealPlanViewProps {
  plan: MealPlan;
  prescriptionLabel?: string;
}

function parseMeals(meals: string): MealSection[] {
  try {
    return JSON.parse(meals);
  } catch {
    return [];
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDocName(plan: MealPlan): string {
  if (!plan.user) return "Profesional";
  const parts = [plan.user.firstName, plan.user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return plan.user.name ?? "Profesional";
}

export function MealPlanView({
  plan,
  prescriptionLabel = "Plan Alimentario",
}: MealPlanViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const meals = parseMeals(plan.meals);
  const docName = getDocName(plan);

  function handlePrint() {
    window.print();
  }

  const hasMacros =
    plan.targetCalories || plan.proteinPct || plan.carbsPct || plan.fatPct || plan.hydration;

  return (
    <div className="space-y-4">
      {/* Print button — hidden on print */}
      <div className="flex justify-end print:hidden">
        <Button onClick={handlePrint} variant="outline" size="sm">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {/* Printable content */}
      <div
        ref={printRef}
        className="rounded-lg border bg-white p-8 text-black print:border-none print:p-0 print:shadow-none"
        id="meal-plan-print-area"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600">
              <UtensilsCrossed className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ConsultorioApp</h1>
              <p className="text-xs text-gray-500">Sistema de Gestion Medica</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold uppercase tracking-wider">{prescriptionLabel}</h2>
            <p className="text-sm text-gray-500">Fecha: {formatDate(plan.createdAt)}</p>
          </div>
        </div>

        {/* Title */}
        <div className="mt-4">
          <h3 className="text-lg font-bold">{plan.title}</h3>
        </div>

        {/* Macros summary bar */}
        {hasMacros && (
          <div className="mt-4 flex flex-wrap gap-3">
            {plan.targetCalories && (
              <Badge variant="secondary" className="flex items-center gap-1 text-sm px-3 py-1">
                <Flame className="h-3.5 w-3.5" />
                {plan.targetCalories} kcal
              </Badge>
            )}
            {plan.proteinPct != null && plan.proteinPct > 0 && (
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Proteinas {plan.proteinPct}%
              </Badge>
            )}
            {plan.carbsPct != null && plan.carbsPct > 0 && (
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Carbohidratos {plan.carbsPct}%
              </Badge>
            )}
            {plan.fatPct != null && plan.fatPct > 0 && (
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Grasas {plan.fatPct}%
              </Badge>
            )}
            {plan.hydration && (
              <Badge variant="secondary" className="flex items-center gap-1 text-sm px-3 py-1">
                <Droplets className="h-3.5 w-3.5" />
                {plan.hydration}
              </Badge>
            )}
          </div>
        )}

        <Separator className="my-4 bg-gray-300" />

        {/* Meal sections */}
        {meals.length > 0 && (
          <div className="space-y-3">
            {meals.map((meal, idx) => (
              <div
                key={idx}
                className="rounded-md border border-gray-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold">{meal.name}</h4>
                  {meal.time && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {meal.time}
                    </span>
                  )}
                </div>
                {meal.options && (
                  <p className="mt-1.5 text-sm whitespace-pre-wrap text-gray-700">
                    {meal.options}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Avoid foods */}
        {plan.avoidFoods && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-semibold uppercase text-gray-500">Alimentos a evitar</p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{plan.avoidFoods}</p>
          </div>
        )}

        {/* Supplements */}
        {plan.supplements && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Pill className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-semibold uppercase text-gray-500">Suplementos</p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{plan.supplements}</p>
          </div>
        )}

        {/* Notes */}
        {plan.notes && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-4 w-4 text-gray-600" />
              <p className="text-xs font-semibold uppercase text-gray-500">Observaciones</p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{plan.notes}</p>
          </div>
        )}

        {/* Signature area */}
        <div className="mt-12 flex flex-col items-end">
          <div className="w-64 border-t border-black pt-2 text-center">
            <p className="text-sm font-medium">{docName}</p>
            <p className="text-xs text-gray-500">Firma del profesional</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-gray-200 pt-3 text-center">
          <p className="text-[10px] text-gray-400">
            Este documento fue generado digitalmente por ConsultorioApp
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #meal-plan-print-area,
          #meal-plan-print-area * {
            visibility: visible;
          }
          #meal-plan-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Printer,
  Download,
  UtensilsCrossed,
  Droplets,
  Flame,
  Clock,
  AlertTriangle,
  Pill,
  FileText,
} from "lucide-react";
import { generateMealPlanPDF } from "@/lib/pdf-generator";
import type { MealPlan, MealSection } from "@/types";

// ─── Meal-time icons ────────────────────────────────────────────────────────

const MEAL_ICONS: Record<string, string> = {
  "Desayuno": "☀️",
  "Media mañana": "🫖",
  "Almuerzo": "🍽️",
  "Merienda": "🌅",
  "Media tarde": "🌆",
  "Cena": "🌙",
};

function getMealIcon(name: string): string {
  return MEAL_ICONS[name] ?? "🍴";
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface MealPlanViewProps {
  plan: MealPlan;
  prescriptionLabel?: string;
  patientName?: string;
  patientAge?: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export function MealPlanView({
  plan,
  prescriptionLabel = "Plan Alimentario",
  patientName,
  patientAge,
}: MealPlanViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const meals = parseMeals(plan.meals);
  const docName = getDocName(plan);

  function handlePrint() {
    window.print();
  }

  function handleDownloadPDF() {
    const doc = generateMealPlanPDF(plan, patientName ?? "—", docName);
    doc.save(`plan-alimentario-${patientName?.replace(/\s+/g, "-") ?? "paciente"}.pdf`);
  }

  // Build macro summary items for the patient info block
  const macroItems: string[] = [];
  if (plan.targetCalories) macroItems.push(`${plan.targetCalories} kcal`);
  if (plan.proteinPct != null && plan.proteinPct > 0) macroItems.push(`Prot. ${plan.proteinPct}%`);
  if (plan.carbsPct != null && plan.carbsPct > 0) macroItems.push(`HC ${plan.carbsPct}%`);
  if (plan.fatPct != null && plan.fatPct > 0) macroItems.push(`Grasas ${plan.fatPct}%`);
  if (plan.hydration) macroItems.push(`Hidrat. ${plan.hydration}`);

  return (
    <div className="space-y-4">
      {/* Print button — hidden on print */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button onClick={handleDownloadPDF} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Descargar PDF
        </Button>
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

        {/* Patient + plan info block */}
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {/* Left column: patient */}
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Paciente
              </p>
              <p className="text-base font-bold text-gray-900">
                {patientName ?? "—"}
                {patientAge != null && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    {patientAge} años
                  </span>
                )}
              </p>
            </div>
            {/* Right column: professional */}
            <div className="space-y-0.5 sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Profesional
              </p>
              <p className="text-base font-bold text-gray-900">{docName}</p>
            </div>
          </div>

          {/* Plan title + macros summary */}
          <Separator className="my-2 bg-gray-200" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800">{plan.title}</p>
            {macroItems.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {plan.targetCalories != null && plan.targetCalories > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <Flame className="h-3 w-3 text-orange-500" />
                    {plan.targetCalories} kcal
                  </span>
                )}
                {plan.proteinPct != null && plan.proteinPct > 0 && (
                  <span className="text-xs text-gray-600">Proteinas {plan.proteinPct}%</span>
                )}
                {plan.carbsPct != null && plan.carbsPct > 0 && (
                  <span className="text-xs text-gray-600">Carbohidratos {plan.carbsPct}%</span>
                )}
                {plan.fatPct != null && plan.fatPct > 0 && (
                  <span className="text-xs text-gray-600">Grasas {plan.fatPct}%</span>
                )}
                {plan.hydration && (
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <Droplets className="h-3 w-3 text-blue-500" />
                    {plan.hydration}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <Separator className="my-4 bg-gray-300" />

        {/* Meal sections */}
        {meals.length > 0 && (
          <div className="space-y-2.5">
            {meals.map((meal, idx) => (
              <div
                key={idx}
                className="rounded-md border border-gray-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold">
                    <span aria-hidden="true">{getMealIcon(meal.name)}</span>
                    {meal.name}
                  </h4>
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

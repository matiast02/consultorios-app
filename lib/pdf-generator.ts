import jsPDF from "jspdf";
import type { MealPlan, MealSection, Prescription, PrescriptionItem } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseMeals(meals: string): MealSection[] {
  try {
    return JSON.parse(meals);
  } catch {
    return [];
  }
}

function parseItems(items: string): PrescriptionItem[] {
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateAR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── Meal Plan PDF ──────────────────────────────────────────────────────────

export function generateMealPlanPDF(
  plan: MealPlan,
  patientName: string,
  professionalName: string
): jsPDF {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("PLAN ALIMENTARIO", 105, 20, { align: "center" });
  doc.setFontSize(10);
  doc.text(
    `Fecha: ${formatDateAR(plan.createdAt)}`,
    105,
    28,
    { align: "center" }
  );

  // Patient info
  doc.setFontSize(12);
  doc.text(`Paciente: ${patientName}`, 20, 40);
  doc.text(`Profesional: ${professionalName}`, 20, 48);

  // Title
  doc.setFontSize(14);
  doc.text(plan.title, 20, 60);

  // Macros
  let y = 68;
  if (plan.targetCalories) {
    doc.setFontSize(10);
    const macros: string[] = [];
    if (plan.targetCalories) macros.push(`${plan.targetCalories} kcal`);
    if (plan.proteinPct) macros.push(`Prot: ${plan.proteinPct}%`);
    if (plan.carbsPct) macros.push(`Carbs: ${plan.carbsPct}%`);
    if (plan.fatPct) macros.push(`Grasas: ${plan.fatPct}%`);
    doc.text(macros.join(" | "), 20, y);
    y += 10;
  }

  // Hydration
  if (plan.hydration) {
    doc.setFontSize(10);
    doc.text(`Hidratacion: ${plan.hydration}`, 20, y);
    y += 10;
  }

  // Meals
  const meals = parseMeals(plan.meals);
  for (const meal of meals) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text(meal.name + (meal.time ? ` (${meal.time})` : ""), 20, y);
    y += 6;
    doc.setFont(undefined as unknown as string, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(meal.options, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 8;
  }

  // Supplements
  if (plan.supplements) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text("Suplementos:", 20, y);
    y += 6;
    doc.setFont(undefined as unknown as string, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(plan.supplements, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 8;
  }

  // Avoid foods
  if (plan.avoidFoods) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text("Alimentos a evitar:", 20, y);
    y += 6;
    doc.setFont(undefined as unknown as string, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(plan.avoidFoods, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 8;
  }

  // Notes
  if (plan.notes) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text("Observaciones:", 20, y);
    y += 6;
    doc.setFont(undefined as unknown as string, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(plan.notes, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 8;
  }

  // Signature area
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  y = Math.max(y + 20, 240);
  doc.setDrawColor(0, 0, 0);
  doc.line(120, y, 190, y);
  doc.setFontSize(10);
  doc.text(professionalName, 155, y + 6, { align: "center" });
  doc.setFontSize(8);
  doc.text("Firma del profesional", 155, y + 11, { align: "center" });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Este documento fue generado digitalmente por ConsultorioApp",
    105,
    290,
    { align: "center" }
  );

  return doc;
}

// ─── Prescription PDF ─────────────────────────────────────────────────────────

export function generatePrescriptionPDF(
  prescription: Prescription,
  patientName: string,
  professionalName: string,
  options?: { patientDni?: string | null; label?: string }
): jsPDF {
  const doc = new jsPDF();
  const label = (options?.label ?? "Receta Médica").toUpperCase();

  // Header
  doc.setFontSize(18);
  doc.text(label, 105, 20, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Fecha: ${formatDateAR(prescription.createdAt)}`, 105, 28, {
    align: "center",
  });

  // Patient & professional info
  doc.setFontSize(12);
  doc.text(`Paciente: ${patientName}`, 20, 42);
  if (options?.patientDni) {
    doc.setFontSize(10);
    doc.text(`DNI: ${options.patientDni}`, 20, 49);
  }
  doc.setFontSize(12);
  doc.text(`Profesional: ${professionalName}`, 20, 58);

  let y = 70;

  // Diagnosis
  if (prescription.diagnosis) {
    doc.setFontSize(11);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text("Diagnóstico:", 20, y);
    y += 6;
    doc.setFont(undefined as unknown as string, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(prescription.diagnosis, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 8;
  }

  // Medications
  const items = parseItems(prescription.items);
  if (items.length > 0) {
    doc.setFontSize(11);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text("Medicamentos:", 20, y);
    y += 8;

    items.forEach((item, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont(undefined as unknown as string, "bold");
      doc.text(`${idx + 1}. ${item.medication}`, 24, y);
      y += 6;

      doc.setFont(undefined as unknown as string, "normal");
      doc.setFontSize(10);
      const detail: string[] = [];
      if (item.dose) detail.push(`Dosis: ${item.dose}`);
      if (item.frequency) detail.push(`Frecuencia: ${item.frequency}`);
      if (item.duration) detail.push(`Duración: ${item.duration}`);
      if (detail.length) {
        const lines = doc.splitTextToSize(detail.join("  ·  "), 162);
        doc.text(lines, 28, y);
        y += lines.length * 5 + 1;
      }
      if (item.notes) {
        const noteLines = doc.splitTextToSize(`Indicaciones: ${item.notes}`, 162);
        doc.text(noteLines, 28, y);
        y += noteLines.length * 5 + 1;
      }
      y += 4;
    });
  }

  // Notes
  if (prescription.notes) {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont(undefined as unknown as string, "bold");
    doc.text("Notas:", 20, y);
    y += 6;
    doc.setFont(undefined as unknown as string, "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(prescription.notes, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 8;
  }

  // Signature area
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  y = Math.max(y + 20, 240);
  doc.setDrawColor(0, 0, 0);
  doc.line(120, y, 190, y);
  doc.setFontSize(10);
  doc.text(professionalName, 155, y + 6, { align: "center" });
  doc.setFontSize(8);
  doc.text("Firma y sello del profesional", 155, y + 11, { align: "center" });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Este documento fue generado digitalmente por ConsultorioApp",
    105,
    290,
    { align: "center" }
  );

  return doc;
}

"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Printer, Stethoscope } from "lucide-react";
import type { Prescription, PrescriptionItem } from "@/types";

interface PrescriptionViewProps {
  prescription: Prescription;
  patientName: string;
  patientDni?: string | null;
  medicName: string;
  /** Label for the document heading (e.g. "Receta Medica", "Indicacion"). Defaults to "Receta Medica". */
  prescriptionLabel?: string;
}

function parseItems(items: string): PrescriptionItem[] {
  try {
    return JSON.parse(items);
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

export function PrescriptionView({
  prescription,
  patientName,
  patientDni,
  medicName,
  prescriptionLabel = "Receta Medica",
}: PrescriptionViewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const items = parseItems(prescription.items);

  function handlePrint() {
    window.print();
  }

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
        id="prescription-print-area"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ConsultorioApp</h1>
              <p className="text-xs text-gray-500">Sistema de Gestion Medica</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold uppercase tracking-wider">{prescriptionLabel}</h2>
            <p className="text-sm text-gray-500">Fecha: {formatDate(prescription.createdAt)}</p>
          </div>
        </div>

        {/* Patient & Doctor info */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase text-gray-500">Paciente</p>
            <p className="text-sm font-medium">{patientName}</p>
            {patientDni && (
              <p className="text-xs text-gray-600">DNI: {patientDni}</p>
            )}
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs font-semibold uppercase text-gray-500">Profesional</p>
            <p className="text-sm font-medium">{medicName}</p>
          </div>
        </div>

        <Separator className="my-4 bg-gray-300" />

        {/* Diagnosis */}
        {prescription.diagnosis && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Diagnostico</p>
            <p className="mt-1 text-sm">{prescription.diagnosis}</p>
          </div>
        )}

        {/* Items table */}
        {items.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Medicamentos</p>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-black">Medicamento</TableHead>
                  <TableHead className="text-xs font-semibold text-black">Dosis</TableHead>
                  <TableHead className="text-xs font-semibold text-black">Frecuencia</TableHead>
                  <TableHead className="text-xs font-semibold text-black">Duracion</TableHead>
                  <TableHead className="text-xs font-semibold text-black">Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx} className="hover:bg-transparent">
                    <TableCell className="text-sm font-medium">{item.medication}</TableCell>
                    <TableCell className="text-sm">{item.dose}</TableCell>
                    <TableCell className="text-sm">{item.frequency}</TableCell>
                    <TableCell className="text-sm">{item.duration}</TableCell>
                    <TableCell className="text-sm text-gray-600">{item.notes ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Notes */}
        {prescription.notes && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Notas</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{prescription.notes}</p>
          </div>
        )}

        {/* Signature area */}
        <div className="mt-12 flex flex-col items-end">
          <div className="w-64 border-t border-black pt-2 text-center">
            <p className="text-sm font-medium">{medicName}</p>
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
          #prescription-print-area,
          #prescription-print-area * {
            visibility: visible;
          }
          #prescription-print-area {
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

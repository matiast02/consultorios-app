"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  CreditCard,
  Edit,
  Mail,
  MapPin,
  Phone,
  Shield,
  User as UserIcon,
} from "lucide-react";
import type { Patient } from "@/types";
import { DataCell, SectionHead, calcAge, fmtDateAR } from "./shared";

interface DatosTabProps {
  patient: Patient;
  onEdit: () => void;
}

function sexLabel(sex?: string | null) {
  if (!sex) return null;
  if (sex === "M") return "Masculino";
  if (sex === "F") return "Femenino";
  return "Otro";
}

export function DatosTab({ patient, onEdit }: DatosTabProps) {
  const age = calcAge(patient.birthDate);
  const cityParts = [patient.province, patient.country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Personal info */}
      <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
        <SectionHead
          icon={UserIcon}
          title="Información personal"
          description="Datos de contacto e identificación del paciente."
          actions={
            <Button variant="outline" size="sm" onClick={onEdit} className="h-8">
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          }
        />
        <div className="px-6 pt-4">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[10px] bg-border sm:grid-cols-2 lg:grid-cols-3">
            <DataCell
              icon={UserIcon}
              label="Nombre completo"
              value={`${patient.firstName} ${patient.lastName}`}
            />
            <DataCell icon={CreditCard} label="DNI" value={patient.dni ?? "—"} />
            <DataCell
              icon={Calendar}
              label="Fecha de nacimiento"
              value={patient.birthDate ? fmtDateAR(new Date(patient.birthDate)) : "—"}
              sub={age !== null ? `${age} años` : null}
            />
            <DataCell
              icon={UserIcon}
              label="Sexo"
              value={sexLabel(patient.sex) ?? "—"}
            />
            <DataCell icon={Mail} label="Email" value={patient.email ?? "—"} />
            <DataCell icon={Phone} label="Teléfono" value={patient.telephone ?? "—"} />
            <DataCell icon={MapPin} label="Dirección" value={patient.address ?? "—"} />
            <DataCell icon={MapPin} label="Ciudad" value={cityParts || "—"} />
            <DataCell
              icon={UserIcon}
              label="Contacto de emergencia"
              value={patient.emergencyContactName ?? "—"}
              sub={patient.emergencyContactPhone ?? null}
            />
          </div>
        </div>
      </Card>

      {/* Coverage */}
      <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
        <SectionHead
          icon={Shield}
          title="Cobertura médica"
          actions={
            <Button variant="outline" size="sm" onClick={onEdit} className="h-8">
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          }
        />
        <div className="px-6 pt-4">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[10px] bg-border sm:grid-cols-3">
            <DataCell
              icon={Shield}
              label="Obra social"
              value={patient.os?.name ?? "—"}
            />
            <DataCell
              icon={CreditCard}
              label="N° de afiliado"
              value={patient.osNumber ?? "—"}
            />
            <DataCell
              icon={Calendar}
              label="Última actualización"
              value={fmtDateAR(new Date(patient.updatedAt))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

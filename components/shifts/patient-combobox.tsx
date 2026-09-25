"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { personLabel } from "@/lib/names";
import type { Patient } from "@/types";

interface PatientComboboxProps {
  patients: Patient[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  /** Id del paciente elegido ("" sin elección). */
  value: string;
  onChange: (patientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Selector de paciente con búsqueda (popover + lista). La lista y el estado de
 * carga vienen de `usePatientSearch`; el componente solo dibuja y elige.
 */
export function PatientCombobox({
  patients,
  loading,
  query,
  onQueryChange,
  value,
  onChange,
  placeholder = "Seleccionar paciente...",
  disabled = false,
}: PatientComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = patients.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" disabled={disabled} className="w-full justify-between">
          {selected ? personLabel(selected) : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nombre o DNI..." value={query} onValueChange={onQueryChange} />
          <CommandList>
            <CommandEmpty>
              {loading
                ? "Buscando..."
                : query.trim().length < 2
                  ? "Escribe al menos 2 caracteres para buscar"
                  : "No se encontraron pacientes."}
            </CommandEmpty>
            <CommandGroup>
              {patients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={`${patient.lastName} ${patient.firstName} ${patient.dni ?? ""}`}
                  onSelect={() => {
                    onChange(patient.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === patient.id ? "opacity-100" : "opacity-0")} />
                  <div>
                    <span className="font-medium">{personLabel(patient)}</span>
                    {patient.dni && <span className="ml-2 text-xs text-muted-foreground">DNI: {patient.dni}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

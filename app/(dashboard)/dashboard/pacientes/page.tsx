"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import { Plus, Search, Loader2, Users, UserPlus } from "lucide-react";
import type { Patient } from "@/types";

export default function PacientesPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/patients?${params}`);
      if (!res.ok) throw new Error("Error al cargar pacientes");
      const json = await res.json();
      const list = json.data ?? json.patients ?? [];
      setPatients(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar los pacientes");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const debounce = setTimeout(fetchPatients, 300);
    return () => clearTimeout(debounce);
  }, [fetchPatients]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground">
            Gestiona el listado de pacientes del consultorio
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="shadow-sm shadow-primary/20 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Paciente
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        <Input
          placeholder="Buscar por nombre o DNI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 transition-all duration-200 focus-visible:ring-primary"
        />
      </div>

      {/* Table card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Pacientes
              {!loading && patients.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({patients.length} {patients.length === 1 ? "paciente" : "pacientes"})
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <UserPlus className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                {search
                  ? "No se encontraron resultados"
                  : "Sin pacientes registrados"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? `No hay pacientes que coincidan con "${search}".`
                  : "Comenzá agregando el primer paciente al consultorio."}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 transition-all duration-200"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Agregar primer paciente
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Nombre</TableHead>
                    <TableHead className="font-semibold">DNI</TableHead>
                    <TableHead className="hidden font-semibold md:table-cell">
                      Email
                    </TableHead>
                    <TableHead className="hidden font-semibold sm:table-cell">
                      Teléfono
                    </TableHead>
                    <TableHead className="hidden font-semibold lg:table-cell">
                      Obra Social
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((patient) => (
                    <TableRow
                      key={patient.id}
                      className="cursor-pointer transition-colors duration-150 hover:bg-primary/5"
                      onClick={() =>
                        router.push(`/dashboard/pacientes/${patient.id}`)
                      }
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {patient.firstName.charAt(0).toUpperCase()}
                          </div>
                          <span>
                            {patient.lastName}, {patient.firstName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {patient.dni ?? "-"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {patient.email ?? "-"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {patient.telephone ?? "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {patient.os?.name ? (
                          <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                            {patient.os.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PatientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          fetchPatients();
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

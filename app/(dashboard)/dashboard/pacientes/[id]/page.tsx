"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Loader2,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Calendar,
  FileText,
} from "lucide-react";
import type { Patient, Shift } from "@/types";
import { SHIFT_STATUS_LABELS, SHIFT_STATUS_COLORS } from "@/types";

const INFO_ICON_COLORS: Record<string, string> = {
  user: "bg-primary/10 text-primary",
  mail: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400",
  phone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  map: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  card: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  calendar: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
};

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchPatient = useCallback(async () => {
    try {
      setLoading(true);
      const [patientRes, shiftsRes] = await Promise.all([
        fetch(`/api/patients/${patientId}`),
        fetch(`/api/shifts?patientId=${patientId}`),
      ]);

      if (!patientRes.ok) throw new Error("Paciente no encontrado");
      const patientJson = await patientRes.json();
      setPatient(patientJson.data ?? patientJson);

      if (shiftsRes.ok) {
        const shiftsJson = await shiftsRes.json();
        const list = shiftsJson.data ?? [];
        setShifts(Array.isArray(list) ? list : []);
      }
    } catch {
      toast.error("Error al cargar datos del paciente");
      router.push("/dashboard/pacientes");
    } finally {
      setLoading(false);
    }
  }, [patientId, router]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  async function handleDelete() {
    try {
      setDeleting(true);
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar");
      toast.success("Paciente eliminado");
      router.push("/dashboard/pacientes");
    } catch {
      toast.error("Error al eliminar el paciente");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (!patient) return null;

  const infoItems = [
    {
      icon: User,
      colorKey: "user",
      label: "Nombre completo",
      value: `${patient.firstName} ${patient.lastName}`,
    },
    {
      icon: CreditCard,
      colorKey: "card",
      label: "DNI",
      value: patient.dni,
    },
    {
      icon: Mail,
      colorKey: "mail",
      label: "Email",
      value: patient.email,
    },
    {
      icon: Phone,
      colorKey: "phone",
      label: "Teléfono",
      value: patient.telephone,
    },
    {
      icon: MapPin,
      colorKey: "map",
      label: "Dirección",
      value: patient.address,
    },
    {
      icon: MapPin,
      colorKey: "map",
      label: "Ubicación",
      value:
        [patient.province, patient.country].filter(Boolean).join(", ") ||
        null,
    },
    {
      icon: Calendar,
      colorKey: "calendar",
      label: "Fecha de nacimiento",
      value: patient.birthDate
        ? new Date(patient.birthDate).toLocaleDateString("es-AR")
        : null,
    },
    {
      icon: CreditCard,
      colorKey: "card",
      label: "Obra Social",
      value: patient.os?.name ?? null,
    },
    {
      icon: CreditCard,
      colorKey: "card",
      label: "N° Afiliado",
      value: patient.osNumber,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard/pacientes")}
            className="shrink-0 transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Detalle del paciente</p>
            <h1 className="text-2xl font-bold tracking-tight">
              {patient.lastName}, {patient.firstName}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/pacientes/${patientId}/historia-clinica`)
            }
            className="transition-all duration-200"
          >
            <FileText className="mr-2 h-4 w-4 text-primary" />
            Historia Clínica
          </Button>
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="transition-all duration-200"
          >
            <Edit className="mr-2 h-4 w-4 text-primary" />
            Editar
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            className="transition-all duration-200"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </div>

      {/* Patient Info Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">Información Personal</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {infoItems.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 transition-colors duration-150"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${INFO_ICON_COLORS[item.colorKey]}`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="truncate text-sm font-medium">
                    {item.value ?? "-"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shifts History */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Historial de Turnos
              {shifts.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({shifts.length} {shifts.length === 1 ? "turno" : "turnos"})
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Calendar className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Este paciente no tiene turnos registrados.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Fecha</TableHead>
                    <TableHead className="font-semibold">Horario</TableHead>
                    <TableHead className="font-semibold">Estado</TableHead>
                    <TableHead className="hidden font-semibold md:table-cell">
                      Observaciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts
                    .sort(
                      (a, b) =>
                        new Date(b.start).getTime() -
                        new Date(a.start).getTime()
                    )
                    .map((shift) => (
                      <TableRow
                        key={shift.id}
                        className="transition-colors duration-150"
                      >
                        <TableCell>
                          {new Date(shift.start).toLocaleDateString("es-AR")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(shift.start).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          -{" "}
                          {new Date(shift.end).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${SHIFT_STATUS_COLORS[shift.status]}`}
                          >
                            {SHIFT_STATUS_LABELS[shift.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] truncate text-muted-foreground md:table-cell">
                          {shift.observations ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSaved={() => {
          fetchPatient();
          setEditOpen(false);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Paciente</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar a{" "}
              <strong>
                {patient.firstName} {patient.lastName}
              </strong>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              className="transition-all duration-200"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="transition-all duration-200"
            >
              {deleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

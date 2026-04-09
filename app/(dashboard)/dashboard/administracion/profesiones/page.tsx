"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ProfessionConfigDialog } from "@/components/admin/profession-config-dialog";
import {
  Plus,
  Users,
  Loader2,
  Pencil,
  Trash2,
  BookX,
} from "lucide-react";

interface ProfessionConfigItem {
  id: string;
  code: string;
  name: string;
  professionalLabel: string;
  patientLabel: string;
  prescriptionLabel: string;
  evolutionLabel: string;
  clinicalRecordLabel: string;
  enabledModules: string;
  clinicalFields: string;
  _count?: { specializations: number };
}

export default function ProfesionesPage() {
  const [items, setItems] = useState<ProfessionConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProfessionConfigItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProfessionConfigItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profession-configs");
      if (!res.ok) throw new Error("Error al cargar configuraciones");
      const json = await res.json();
      const list = json.data ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar las configuraciones de profesion");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleEdit(item: ProfessionConfigItem) {
    setEditing(item);
    setDialogOpen(true);
  }

  function handleCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function parseModules(json: string): string[] {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  const MODULE_LABELS: Record<string, string> = {
    prescriptions: "Recetas",
    study_orders: "Estudios",
  };

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/profession-configs/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toast.error(
            err.error ??
              "No se puede eliminar: hay especialidades asociadas a esta configuracion"
          );
          setDeleteTarget(null);
          return;
        }
        throw new Error(err.error ?? "Error al eliminar");
      }
      toast.success("Configuracion eliminada exitosamente");
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al eliminar"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profesiones</h1>
          <p className="text-muted-foreground">
            Gestiona las configuraciones de profesion del sistema
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="shadow-sm shadow-primary/20 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nueva Profesion
        </Button>
      </div>

      {/* Table card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Profesiones
              {!loading && items.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({items.length}{" "}
                  {items.length === 1 ? "profesion" : "profesiones"})
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
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BookX className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                Sin configuraciones de profesion registradas
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Comenza agregando la primera configuracion de profesion al sistema.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 transition-all duration-200"
                onClick={handleCreate}
              >
                <Plus className="mr-2 h-3 w-3" />
                Agregar primera profesion
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Nombre</TableHead>
                    <TableHead className="font-semibold">Prefijo</TableHead>
                    <TableHead className="font-semibold">Receta</TableHead>
                    <TableHead className="font-semibold">Evolucion</TableHead>
                    <TableHead className="font-semibold">HC</TableHead>
                    <TableHead className="font-semibold">Modulos</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const modules = parseModules(item.enabledModules);
                    return (
                      <TableRow
                        key={item.id}
                        className="transition-colors duration-150 hover:bg-primary/5"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p>{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.code}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.professionalLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.prescriptionLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.evolutionLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.clinicalRecordLabel}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {modules.length === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              modules.map((mod) => (
                                <Badge
                                  key={mod}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {MODULE_LABELS[mod] ?? mod}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Editar</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Eliminar</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
      <ProfessionConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        professionConfig={editing}
        onSaved={() => {
          fetchData();
          setDialogOpen(false);
          setEditing(null);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar configuracion de profesion</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estas seguro de que queres eliminar{" "}
              <strong>{deleteTarget?.name}</strong>? Esta accion no se puede
              deshacer.
              {deleteTarget && (deleteTarget._count?.specializations ?? 0) > 0 && (
                <span className="block mt-2 text-destructive">
                  Esta configuracion tiene {deleteTarget._count?.specializations}{" "}
                  especialidad(es) asociada(s). Deberas desvincularlas primero.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

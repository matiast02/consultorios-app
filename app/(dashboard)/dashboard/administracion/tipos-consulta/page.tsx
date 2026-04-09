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
import { ConsultationTypeDialog } from "@/components/admin/consultation-type-dialog";
import {
  Plus,
  Clock,
  Loader2,
  Pencil,
  Trash2,
  BookX,
} from "lucide-react";
import type { ConsultationType } from "@/types";

interface ConsultationTypeWithCount extends ConsultationType {
  _count?: { shifts: number };
}

export default function TiposConsultaPage() {
  const [items, setItems] = useState<ConsultationTypeWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ConsultationType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConsultationTypeWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/consultation-types");
      if (!res.ok) throw new Error("Error al cargar tipos de consulta");
      const json = await res.json();
      const list = json.data ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar los tipos de consulta");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleEdit(item: ConsultationType) {
    setEditing(item);
    setDialogOpen(true);
  }

  function handleCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/consultation-types/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toast.error(
            err.error ??
              "No se puede eliminar: hay turnos asociados a este tipo de consulta"
          );
          setDeleteTarget(null);
          return;
        }
        throw new Error(err.error ?? "Error al eliminar");
      }
      toast.success("Tipo de consulta eliminado exitosamente");
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
          <h1 className="text-3xl font-bold tracking-tight">Tipos de Consulta</h1>
          <p className="text-muted-foreground">
            Gestiona los tipos de consulta disponibles en el sistema
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="shadow-sm shadow-primary/20 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Tipo
        </Button>
      </div>

      {/* Table card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Tipos de Consulta
              {!loading && items.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({items.length}{" "}
                  {items.length === 1 ? "tipo" : "tipos"})
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
                Sin tipos de consulta registrados
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Comenza agregando el primer tipo de consulta al sistema.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 transition-all duration-200"
                onClick={handleCreate}
              >
                <Plus className="mr-2 h-3 w-3" />
                Agregar primer tipo
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Nombre</TableHead>
                    <TableHead className="font-semibold">Duracion</TableHead>
                    <TableHead className="font-semibold">Color</TableHead>
                    <TableHead className="font-semibold">Default</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="transition-colors duration-150 hover:bg-primary/5"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{
                              backgroundColor: item.color ?? "hsl(var(--primary))",
                            }}
                          >
                            {item.name.charAt(0).toUpperCase()}
                          </div>
                          {item.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.durationMinutes} min
                      </TableCell>
                      <TableCell>
                        {item.color ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-5 w-5 rounded border"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {item.color}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.isDefault ? (
                          <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/20">
                            Default
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
      <ConsultationTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        consultationType={editing}
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
            <AlertDialogTitle>Eliminar tipo de consulta</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estas seguro de que queres eliminar{" "}
              <strong>{deleteTarget?.name}</strong>? Esta accion no se puede
              deshacer.
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

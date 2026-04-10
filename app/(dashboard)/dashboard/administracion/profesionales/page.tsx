"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import {
  Plus,
  Search,
  Loader2,
  Stethoscope,
  Pencil,
  Trash2,
  UserX,
  Power,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MedicUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  isActive: boolean;
  specialization?: { id: string; name: string } | null;
  image?: string | null;
  roles: { id: string; name: string }[];
  createdAt: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProfesionalesPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const isAdmin = userRole === "admin";

  const [users, setUsers] = useState<MedicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MedicUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MedicUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ role: "medic" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Error al cargar profesionales");
      const json = await res.json();
      const list = json.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar los profesionales");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const debounce = setTimeout(fetchData, 300);
    return () => clearTimeout(debounce);
  }, [fetchData]);

  function handleEdit(user: MedicUser) {
    setEditing(user);
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
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al eliminar");
      }
      toast.success("Profesional eliminado exitosamente");
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

  async function handleToggleActive(user: MedicUser) {
    try {
      setTogglingId(user.id);
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al cambiar estado");
      }
      toast.success(
        user.isActive ? "Profesional deshabilitado" : "Profesional habilitado"
      );
      fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al cambiar estado"
      );
    } finally {
      setTogglingId(null);
    }
  }

  function getDisplayName(user: MedicUser): string {
    if (user.firstName && user.lastName) {
      return `${user.lastName}, ${user.firstName}`;
    }
    return user.name ?? "Sin nombre";
  }

  function getInitial(user: MedicUser): string {
    return (
      user.firstName?.charAt(0) ??
      user.name?.charAt(0) ??
      "P"
    ).toUpperCase();
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profesionales</h1>
          <p className="text-muted-foreground">
            Gestiona los profesionales de salud del sistema
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="shadow-sm shadow-primary/20 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Profesional
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        <Input
          placeholder="Buscar por nombre o email..."
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
              <Stethoscope className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Profesionales
              {!loading && users.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({users.length}{" "}
                  {users.length === 1 ? "profesional" : "profesionales"})
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
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <UserX className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                {search
                  ? "No se encontraron resultados"
                  : "Sin profesionales registrados"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? `No hay profesionales que coincidan con "${search}".`
                  : "Comenza agregando el primer profesional al sistema."}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 transition-all duration-200"
                  onClick={handleCreate}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Agregar primer profesional
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Nombre</TableHead>
                    <TableHead className="hidden font-semibold md:table-cell">
                      Email
                    </TableHead>
                    <TableHead className="hidden font-semibold lg:table-cell">
                      Especialidad
                    </TableHead>
                    <TableHead className="font-semibold">Estado</TableHead>
                    <TableHead className="w-[150px] text-right font-semibold">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="transition-colors duration-150 hover:bg-primary/5"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                            {getInitial(user)}
                          </div>
                          <span>{getDisplayName(user)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {user.email ?? "-"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {user.specialization?.name ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.isActive
                              ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
                              : "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                          }
                        >
                          {user.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleToggleActive(user)}
                              disabled={togglingId === user.id}
                              title={user.isActive ? "Deshabilitar" : "Habilitar"}
                            >
                              {togglingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleEdit(user)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Create/Edit dialog — uses shared UserFormDialog with role locked to medic for secretary */}
      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editing}
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
            <AlertDialogTitle>Eliminar profesional</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estas seguro de que queres eliminar a{" "}
              <strong>
                {deleteTarget?.firstName && deleteTarget?.lastName
                  ? `${deleteTarget.firstName} ${deleteTarget.lastName}`
                  : deleteTarget?.email ?? "este profesional"}
              </strong>
              ? El profesional sera desactivado del sistema.
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

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
import { SecretaryFormDialog } from "@/components/admin/secretary-form-dialog";
import {
  Plus,
  Search,
  Loader2,
  UserRoundCog,
  Pencil,
  Trash2,
  UserX,
  Power,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SecretaryUser {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  isActive: boolean;
  roles: { id: string; name: string }[];
  createdAt: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SecretariasPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [users, setUsers] = useState<SecretaryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SecretaryUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecretaryUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ role: "secretary" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Error al cargar secretarias");
      const json = await res.json();
      const list = json.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar las secretarias");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const debounce = setTimeout(fetchData, 300);
    return () => clearTimeout(debounce);
  }, [fetchData]);

  function handleEdit(user: SecretaryUser) {
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
      toast.success("Secretaria eliminada exitosamente");
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

  async function handleToggleActive(user: SecretaryUser) {
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
        user.isActive
          ? "Secretaria deshabilitada"
          : "Secretaria habilitada"
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

  function getDisplayName(user: SecretaryUser): string {
    if (user.firstName && user.lastName) {
      return `${user.lastName}, ${user.firstName}`;
    }
    return user.name ?? "Sin nombre";
  }

  function getInitial(user: SecretaryUser): string {
    return (
      user.firstName?.charAt(0) ??
      user.name?.charAt(0) ??
      "S"
    ).toUpperCase();
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Secretarias</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Gestiona las secretarias del sistema"
              : "Listado de secretarias del sistema"}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={handleCreate}
            className="shadow-sm shadow-primary/20 transition-all duration-200"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva Secretaria
          </Button>
        )}
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
              <UserRoundCog className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Secretarias
              {!loading && users.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({users.length}{" "}
                  {users.length === 1 ? "secretaria" : "secretarias"})
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
                  : "Sin secretarias registradas"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? `No hay secretarias que coincidan con "${search}".`
                  : "Comenza agregando la primera secretaria al sistema."}
              </p>
              {!search && isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 transition-all duration-200"
                  onClick={handleCreate}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Agregar primera secretaria
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
                    <TableHead className="font-semibold">Estado</TableHead>
                    {isAdmin && (
                      <TableHead className="w-[150px] text-right font-semibold">
                        Acciones
                      </TableHead>
                    )}
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
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                            {getInitial(user)}
                          </div>
                          <span>{getDisplayName(user)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {user.email ?? "-"}
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
                          {user.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
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
                              <span className="sr-only">
                                {user.isActive ? "Deshabilitar" : "Habilitar"}
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleEdit(user)}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Editar</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Eliminar</span>
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog (admin only) */}
      {isAdmin && (
        <SecretaryFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          secretary={editing}
          onSaved={() => {
            fetchData();
            setDialogOpen(false);
            setEditing(null);
          }}
        />
      )}

      {/* Delete confirmation (admin only) */}
      {isAdmin && (
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar secretaria</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estas seguro de que queres eliminar a{" "}
                <strong>
                  {deleteTarget?.name ?? deleteTarget?.email ?? "esta secretaria"}
                </strong>
                ? La secretaria sera desactivada del sistema.
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
      )}
    </div>
  );
}

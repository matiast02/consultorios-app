"use client";

import { useCallback, useEffect, useState } from "react";
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
  UserCog,
  Pencil,
  Trash2,
  UserX,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserWithRoles {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  specialization?: { id: string; name: string } | null;
  image?: string | null;
  roles: { id: string; name: string }[];
  createdAt: string;
}

// ─── Role display config ─────────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  medic: {
    label: "Médico",
    className:
      "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  },
  secretary: {
    label: "Secretaria",
    className:
      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  },
  admin: {
    label: "Admin",
    className:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
};

function RoleBadge({ roleName }: { roleName: string }) {
  const config = ROLE_CONFIG[roleName] ?? {
    label: roleName,
    className: "bg-slate-100 text-slate-600",
  };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserWithRoles | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserWithRoles | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/users?${params}`);
      if (!res.ok) throw new Error("Error al cargar usuarios");
      const json = await res.json();
      const list = json.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar los usuarios");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const debounce = setTimeout(fetchData, 300);
    return () => clearTimeout(debounce);
  }, [fetchData]);

  function handleEdit(user: UserWithRoles) {
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
      toast.success("Usuario eliminado exitosamente");
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

  function getDisplayName(user: UserWithRoles): string {
    if (user.firstName && user.lastName) {
      return `${user.lastName}, ${user.firstName}`;
    }
    return user.name ?? "Sin nombre";
  }

  function getInitial(user: UserWithRoles): string {
    return (
      user.firstName?.charAt(0) ??
      user.name?.charAt(0) ??
      "U"
    ).toUpperCase();
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Usuarios y Profesionales
          </h1>
          <p className="text-muted-foreground">
            Gestiona los usuarios del sistema y sus roles
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="shadow-sm shadow-primary/20 transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Usuario
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
              <UserCog className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Usuarios
              {!loading && users.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({users.length}{" "}
                  {users.length === 1 ? "usuario" : "usuarios"})
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
                  : "Sin usuarios registrados"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? `No hay usuarios que coincidan con "${search}".`
                  : "Comenza agregando el primer usuario al sistema."}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 transition-all duration-200"
                  onClick={handleCreate}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Agregar primer usuario
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
                    <TableHead className="font-semibold">Rol</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold">
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
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
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
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <RoleBadge key={role.id} roleName={role.name} />
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Sin rol
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit dialog */}
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
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estas seguro de que queres eliminar a{" "}
              <strong>
                {deleteTarget?.name ?? deleteTarget?.email ?? "este usuario"}
              </strong>
              ? El usuario sera desactivado del sistema.
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

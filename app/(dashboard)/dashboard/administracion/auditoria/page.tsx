"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileSearch,
  FilterX,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditUser {
  name: string;
  email: string;
}

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditUser;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserOption {
  id: string;
  name: string | null;
  email: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  patient: "Paciente",
  shift: "Turno",
  evolution: "Evolucion",
  clinical_record: "Historia Clinica",
  health_insurance: "Obra Social",
  specialization: "Especialidad",
  user: "Usuario",
  user_preference: "Preferencia",
  block_day: "Dia Bloqueado",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Crear",
  UPDATE: "Modificar",
  DELETE: "Eliminar",
  VIEW_SENSITIVE: "Ver datos sensibles",
};

const ACTION_BADGE_CLASSES: Record<string, string> = {
  CREATE:
    "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  UPDATE:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  DELETE:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  VIEW_SENSITIVE:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
};

const RESOURCE_OPTIONS = [
  "patient",
  "shift",
  "evolution",
  "clinical_record",
  "health_insurance",
  "specialization",
  "user",
];

const ACTION_OPTIONS = ["CREATE", "UPDATE", "DELETE", "VIEW_SENSITIVE"];

const PAGE_LIMIT = 20;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filter state
  const [filterUserId, setFilterUserId] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Applied filters (only sent on "Filtrar" click)
  const [appliedFilters, setAppliedFilters] = useState({
    userId: "",
    resource: "",
    action: "",
    from: "",
    to: "",
  });

  // ── Fetch users for the filter dropdown ──
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) return;
        const json = await res.json();
        const list = json.data ?? [];
        setUsers(Array.isArray(list) ? list : []);
      } catch {
        // silently ignore — filter will just not have user options
      }
    }
    loadUsers();
  }, []);

  // ── Fetch audit logs ──
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(PAGE_LIMIT));
      if (appliedFilters.userId) params.set("userId", appliedFilters.userId);
      if (appliedFilters.resource)
        params.set("resource", appliedFilters.resource);
      if (appliedFilters.action) params.set("action", appliedFilters.action);
      if (appliedFilters.from) params.set("from", appliedFilters.from);
      if (appliedFilters.to) params.set("to", appliedFilters.to);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (!res.ok) throw new Error("Error al cargar registros de auditoria");
      const json = await res.json();
      setLogs(json.data ?? []);
      setPagination(json.pagination ?? null);
    } catch {
      toast.error("No se pudieron cargar los registros de auditoria");
      setLogs([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [currentPage, appliedFilters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ── Handlers ──
  function handleFilter() {
    setCurrentPage(1);
    setAppliedFilters({
      userId: filterUserId,
      resource: filterResource,
      action: filterAction,
      from: filterFrom,
      to: filterTo,
    });
  }

  function handleClearFilters() {
    setFilterUserId("");
    setFilterResource("");
    setFilterAction("");
    setFilterFrom("");
    setFilterTo("");
    setCurrentPage(1);
    setAppliedFilters({
      userId: "",
      resource: "",
      action: "",
      from: "",
      to: "",
    });
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  function toggleRow(id: string) {
    setExpandedRow((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Auditoria</h1>
            <p className="text-muted-foreground">
              Registro de accesos y modificaciones del sistema
            </p>
          </div>
        </div>
      </div>

      {/* Compliance info card */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm">
        <CardContent className="flex items-start gap-3 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div className="text-sm leading-relaxed text-foreground/80">
            <span className="font-semibold text-foreground">
              Cumplimiento Ley 25.326 — Proteccion de Datos Personales.
            </span>{" "}
            Todos los accesos a datos sensibles de salud son registrados y
            trazables. Este registro es inmutable y no puede ser modificado ni
            eliminado.
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* User filter */}
            <div className="w-full sm:w-52">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Usuario
              </label>
              <Select value={filterUserId} onValueChange={setFilterUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.email ?? u.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resource filter */}
            <div className="w-full sm:w-44">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Recurso
              </label>
              <Select value={filterResource} onValueChange={setFilterResource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RESOURCE_LABELS[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action filter */}
            <div className="w-full sm:w-44">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Accion
              </label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a] ?? a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date from */}
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Desde
              </label>
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>

            {/* Date to */}
            <div className="w-full sm:w-40">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Hasta
              </label>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>

            {/* Buttons */}
            <Button onClick={handleFilter} className="shadow-sm shadow-primary/20">
              Filtrar
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              <FilterX className="mr-2 h-4 w-4" />
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Registros de Auditoria
              {!loading && pagination && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({pagination.total}{" "}
                  {pagination.total === 1 ? "registro" : "registros"})
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
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <FileSearch className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                No se encontraron registros de auditoria
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Intenta ajustar los filtros de busqueda.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Fecha/Hora</TableHead>
                    <TableHead className="font-semibold">Usuario</TableHead>
                    <TableHead className="font-semibold">Accion</TableHead>
                    <TableHead className="font-semibold">Recurso</TableHead>
                    <TableHead className="font-semibold">ID Recurso</TableHead>
                    <TableHead className="hidden font-semibold lg:table-cell">
                      IP
                    </TableHead>
                    <TableHead className="w-[80px] font-semibold">
                      Detalle
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <>
                      <TableRow
                        key={log.id}
                        className="transition-colors duration-150 hover:bg-primary/5"
                      >
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.user?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              ACTION_BADGE_CLASSES[log.action] ??
                              "bg-slate-100 text-slate-600"
                            }
                          >
                            {ACTION_LABELS[log.action] ?? log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {RESOURCE_LABELS[log.resource] ?? log.resource}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <code className="block max-w-[120px] truncate font-mono text-xs text-muted-foreground">
                            {log.resourceId}
                          </code>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {log.ipAddress ?? "—"}
                        </TableCell>
                        <TableCell>
                          {log.details ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => toggleRow(log.id)}
                              aria-label={
                                expandedRow === log.id
                                  ? "Ocultar detalles"
                                  : "Ver detalles"
                              }
                            >
                              {expandedRow === log.id ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedRow === log.id && log.details && (
                        <TableRow key={`${log.id}-details`}>
                          <TableCell
                            colSpan={7}
                            className="bg-muted/30 px-6 py-3"
                          >
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs text-foreground/80">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Pagina {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pagination.totalPages}
                  onClick={() =>
                    setCurrentPage((p) =>
                      Math.min(pagination.totalPages, p + 1)
                    )
                  }
                >
                  Siguiente
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

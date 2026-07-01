"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Archive,
  ArchiveRestore,
  Trash2,
  Phone,
  Calendar,
  Stethoscope,
  Shield,
  MessageCircle,
} from "lucide-react";
import { buildWhatsappLink } from "@/lib/whatsapp";
import type { ClinicContactRequest } from "@/types";

type StatusFilter = "new" | "read" | "archived" | "all";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "new", label: "Nuevas" },
  { value: "read", label: "Leídas" },
  { value: "archived", label: "Archivadas" },
  { value: "all", label: "Todas" },
];

const STATUS_BADGE: Record<
  ClinicContactRequest["status"],
  { label: string; className: string }
> = {
  new: { label: "Nueva", className: "bg-primary/15 text-primary" },
  read: { label: "Leída", className: "bg-muted text-muted-foreground" },
  archived: { label: "Archivada", className: "bg-muted text-muted-foreground/70" },
};

export default function SolicitudesContactoPage() {
  const [items, setItems] = useState<ClinicContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClinicContactRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/contact-requests?status=${filter}`);
      if (!res.ok) throw new Error("Error al cargar solicitudes");
      const json = await res.json();
      const list = json.data ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar las solicitudes");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function patch(
    id: string,
    body: Partial<Pick<ClinicContactRequest, "status" | "whatsappOpened">>
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/contact-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al actualizar");
      }
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al actualizar");
    } finally {
      setBusyId(null);
    }
  }

  function handleWhatsapp(req: ClinicContactRequest) {
    const greet = req.fullName ? `Hola ${req.fullName}, ` : "Hola, ";
    const link = buildWhatsappLink(
      req.phone,
      `${greet}te contactamos desde el consultorio por tu solicitud de turno.`
    );
    window.open(link, "_blank", "noopener,noreferrer");
    // Opening WhatsApp implies the request was attended → mark read + flag.
    void patch(req.id, {
      whatsappOpened: true,
      ...(req.status === "new" ? { status: "read" as const } : {}),
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/contact-requests/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al eliminar");
      }
      toast.success("Solicitud eliminada");
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Solicitudes de contacto</h1>
        <p className="text-muted-foreground">
          Consultas recibidas desde el formulario de la web pública.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList variant="pill">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </div>
      ) : items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="mt-4 font-medium text-foreground">
              No hay solicitudes {filter === "new" ? "nuevas" : "para mostrar"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Las consultas enviadas desde la web aparecerán acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((req) => {
            const badge = STATUS_BADGE[req.status];
            const busy = busyId === req.id;
            return (
              <Card
                key={req.id}
                className={`shadow-sm transition-colors ${
                  req.status === "new" ? "border-primary/30 bg-primary/[0.02]" : ""
                }`}
              >
                <CardContent className="space-y-3 p-4">
                  {/* Top row: name + status + date */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{req.fullName}</span>
                      <Badge variant="secondary" className={badge.className}>
                        {badge.label}
                      </Badge>
                      {req.whatsappOpened && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        >
                          WhatsApp
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(req.createdAt), "d 'de' MMM, HH:mm", { locale: es })}
                    </span>
                  </div>

                  {/* Detail chips */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {req.phone}
                    </span>
                    {req.email && (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {req.email}
                      </span>
                    )}
                    {req.specialization && (
                      <span className="inline-flex items-center gap-1.5">
                        <Stethoscope className="h-3.5 w-3.5" />
                        {req.specialization.name}
                      </span>
                    )}
                    {req.healthInsurance && (
                      <span className="inline-flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        {req.healthInsurance}
                      </span>
                    )}
                    {req.preferredDay && (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {req.preferredDay}
                      </span>
                    )}
                  </div>

                  {req.message && (
                    <p className="rounded-md bg-muted/50 p-3 text-sm">{req.message}</p>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleWhatsapp(req)}
                      disabled={busy}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <MessageCircle className="mr-1.5 h-4 w-4" />
                      Responder por WhatsApp
                    </Button>

                    {req.status === "new" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => patch(req.id, { status: "read" })}
                        disabled={busy}
                      >
                        <MailOpen className="mr-1.5 h-4 w-4" />
                        Marcar leída
                      </Button>
                    )}
                    {req.status === "read" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => patch(req.id, { status: "new" })}
                        disabled={busy}
                      >
                        <Mail className="mr-1.5 h-4 w-4" />
                        Marcar no leída
                      </Button>
                    )}

                    {req.status !== "archived" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => patch(req.id, { status: "archived" })}
                        disabled={busy}
                      >
                        <Archive className="mr-1.5 h-4 w-4" />
                        Archivar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => patch(req.id, { status: "read" })}
                        disabled={busy}
                      >
                        <ArchiveRestore className="mr-1.5 h-4 w-4" />
                        Desarchivar
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(req)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      <span className="sr-only">Eliminar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar solicitud</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que querés eliminar la solicitud de{" "}
              <strong>{deleteTarget?.fullName}</strong>? Esta acción no se puede
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
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

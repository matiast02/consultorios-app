"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Plus, Stethoscope } from "lucide-react";
import type { StudyOrder, StudyOrderItem } from "@/types";
import { STUDY_ORDER_STATUS_COLORS, STUDY_ORDER_STATUS_LABELS } from "@/types";
import { SectionHead, fmtDateAR, relTime, safeParseJSON } from "./shared";
import { AttachmentsDisclosure } from "./attachments-panel";
import { cn } from "@/lib/utils";

/** La API devuelve también la anulación (inalterabilidad), aunque `StudyOrder` no la tipa. */
export type StudyOrderRow = StudyOrder & {
  annulledAt?: string | null;
  annulReason?: string | null;
};

const ITEM_TYPE_LABELS: Record<StudyOrderItem["type"], string> = {
  laboratorio: "Laboratorio",
  imagen: "Imagen",
  interconsulta: "Interconsulta",
  otro: "Otro",
};

interface EstudiosTabProps {
  patientId: string;
  orders: StudyOrderRow[];
  onNew?: () => void;
  currentUserId?: string | null;
  /** Habilita adjuntar resultados (médico, fuera de modo concesión); además solo el autor. */
  canUploadAttachments?: boolean;
}

function getDocName(o: StudyOrderRow): string {
  if (!o.user) return "Profesional";
  const parts = [o.user.firstName, o.user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return o.user.name ?? "Profesional";
}

export function EstudiosTab({
  patientId,
  orders,
  onNew,
  currentUserId,
  canUploadAttachments = false,
}: EstudiosTabProps) {
  const pending = orders.filter((o) => o.status === "PENDING" && !o.annulledAt).length;

  return (
    <Card className="overflow-hidden pb-5 pt-0 shadow-xs">
      <SectionHead
        icon={FlaskConical}
        title="Órdenes de estudio"
        description={
          orders.length > 0
            ? `${orders.length} en total · ${pending} pendiente${pending === 1 ? "" : "s"}`
            : "Sin órdenes de estudio registradas."
        }
        actions={
          onNew && (
            <Button size="sm" onClick={onNew} className="h-8">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nueva orden
            </Button>
          )
        }
      />

      <div className="space-y-2.5 px-6 pt-4">
        {orders.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No hay órdenes de estudio para este paciente.
          </div>
        ) : (
          orders.map((o) => {
            const items = safeParseJSON<StudyOrderItem[]>(o.items, []);
            const date = new Date(o.createdAt);
            const isAuthor = !!currentUserId && o.userId === currentUserId;
            return (
              <div
                key={o.id}
                className={cn(
                  "rounded-xl border bg-card px-4 py-3.5",
                  o.annulledAt && "opacity-70",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-bold tabular-nums">{fmtDateAR(date)}</span>
                  <span className="text-[12.5px] text-muted-foreground">· {relTime(date)}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    · <Stethoscope className="h-3.5 w-3.5" />
                    {getDocName(o)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {o.annulledAt ? (
                      <Badge
                        variant="secondary"
                        className="bg-destructive/10 text-destructive"
                        title={o.annulReason ? `Motivo: ${o.annulReason}` : undefined}
                      >
                        Anulada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={STUDY_ORDER_STATUS_COLORS[o.status]}>
                        {STUDY_ORDER_STATUS_LABELS[o.status]}
                      </Badge>
                    )}
                  </span>
                </div>

                {items.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex flex-wrap items-baseline gap-2 py-0.5 text-[12.5px]">
                        <span className="w-4 shrink-0 text-right font-bold tabular-nums text-muted-foreground">
                          {i + 1}.
                        </span>
                        <span className="rounded border bg-muted px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-foreground/70">
                          {ITEM_TYPE_LABELS[it.type] ?? it.type}
                        </span>
                        <span className="font-semibold text-foreground">{it.description}</span>
                        {it.urgency === "urgente" && (
                          <Badge variant="secondary" className="bg-rose-500/10 text-rose-600 dark:text-rose-300">
                            Urgente
                          </Badge>
                        )}
                        {it.notes && <span className="text-muted-foreground">· {it.notes}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                {o.resultNotes && (
                  <div className="mt-2.5 rounded-lg bg-muted/40 px-3 py-2">
                    <h5 className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                      Resultados
                    </h5>
                    <p className="whitespace-pre-wrap text-[12.5px] text-foreground/85">{o.resultNotes}</p>
                  </div>
                )}

                <AttachmentsDisclosure
                  className="mt-3"
                  label="Resultados / adjuntos"
                  patientId={patientId}
                  entityType="STUDY_ORDER"
                  entityId={o.id}
                  canUpload={canUploadAttachments && isAuthor && !o.annulledAt}
                />
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

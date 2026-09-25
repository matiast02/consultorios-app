"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface AnnulReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** DELETE endpoint that performs the annulment; the reason is sent in the body. */
  endpoint: string;
  title?: string;
  description?: string;
  onAnnulled?: () => void;
}

/**
 * Anular (no borrar): pide un motivo obligatorio y hace DELETE con { annulReason }.
 * El backend conserva el registro y agrega una versión de anulación al ledger.
 */
export function AnnulReasonDialog({
  open,
  onOpenChange,
  endpoint,
  title = "Anular registro",
  description = "El registro no se elimina: queda marcado como anulado y conservado en la historia clínica. Indicá el motivo.",
  onAnnulled,
}: AnnulReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      toast.error("El motivo es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annulReason: reason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "No se pudo anular");
      }
      toast.success("Registro anulado");
      setReason("");
      onOpenChange(false);
      onAnnulled?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!saving ? onOpenChange(v) : null)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="annul-reason">Motivo de la anulación</Label>
          <Textarea
            id="annul-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: cargado en el paciente equivocado"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={saving || !reason.trim()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Anular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

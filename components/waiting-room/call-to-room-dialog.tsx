"use client";

import { useEffect, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTicketNumber } from "@/lib/waiting-room/format";

/** A quién se llama y adónde. `recall` = «volver a llamar» (no cambia el estado del turno). */
export interface CallToRoomTarget {
  shiftId: string;
  patientName: string;
  ticketNumber: number | null;
  /** Consultorio prellenado (el del ticket o el habitual del profesional). */
  room: string | null;
  recall?: boolean;
}

interface CallToRoomDialogProps {
  target: CallToRoomTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Hace el pedido; si lanza, el diálogo queda abierto (el handler ya avisó con un toast). */
  onConfirm: (target: CallToRoomTarget, room: string | null) => Promise<void>;
}

/**
 * Llamado a consultorio (módulo waiting_room). Lo comparten recepción y el
 * médico: muestra el número de sala, el paciente y deja elegir el consultorio.
 */
export function CallToRoomDialog({ target, onOpenChange, onConfirm }: CallToRoomDialogProps) {
  const [room, setRoom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) setRoom(target.room ?? "");
  }, [target]);

  const hasTicket = target?.ticketNumber != null;
  const recall = target?.recall === true;

  async function confirm() {
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(target, room.trim() || null);
      onOpenChange(false);
    } catch {
      // el handler ya mostró el error; el diálogo queda abierto para reintentar
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{recall ? "Volver a llamar" : "Llamar a consultorio"}</DialogTitle>
          <DialogDescription>
            {hasTicket
              ? "El número y el consultorio aparecen en la pantalla de la sala de espera."
              : "Este paciente no tiene número de sala: se registra el pase a consulta, pero no sale en la pantalla."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
          {hasTicket && (
            <div className="font-mono text-4xl font-black leading-none tabular-nums text-[#0d4f4d]">
              {formatTicketNumber(target!.ticketNumber!)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">{target?.patientName}</div>
            {hasTicket && <div className="text-xs text-muted-foreground">Número de sala</div>}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="call-room" className="text-[11.5px] font-medium text-muted-foreground">
              Consultorio
            </label>
            <input
              id="call-room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Ej: Consultorio 2"
              maxLength={40}
              autoFocus
              className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0d4f4d]/30"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0d4f4d] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3f3d] disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
            {recall ? "Volver a llamar" : "Llamar"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

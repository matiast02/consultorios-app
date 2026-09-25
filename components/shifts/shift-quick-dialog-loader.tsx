"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ShiftQuickDialog } from "./shift-quick-dialog";
import type { Shift } from "@/types";

interface ShiftQuickDialogLoaderProps {
  /** Id of the shift to display. Set to null to close. */
  shiftId: string | null;
  /** Called when the dialog requests close. Caller should reset id to null. */
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  onReschedule?: (shift: Shift) => void;
  onViewPatient?: (patientId: string) => void;
  primaryAction?: {
    label: string;
    onClick: (shift: Shift) => void;
    disabled?: boolean;
  };
}

type Meta = {
  lastVisit?: { date: string; consultationTypeName: string | null } | null;
  nextScheduled?: { date: string; consultationTypeName: string | null; medicShortName: string } | null;
};

/**
 * Wrapper that fetches the shift with `?withContext=true` and mounts the new
 * `ShiftQuickDialog`. Centralizes loading state so callers (calendar page,
 * secretary dashboard) only have to track a single `shiftId` value.
 */
export function ShiftQuickDialogLoader({
  shiftId,
  onOpenChange,
  onUpdated,
  onReschedule,
  onViewPatient,
  primaryAction,
}: ShiftQuickDialogLoaderProps) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!shiftId) {
      setShift(null);
      setMeta(null);
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/shifts/${shiftId}?withContext=true`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (cancelled) return;
        setShift(json.data ?? null);
        setMeta(json.meta ?? null);
      } catch {
        if (!cancelled) toast.error("No se pudo cargar el turno");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  return (
    <>
      {shift && (
        <ShiftQuickDialog
          open={!!shift}
          onOpenChange={onOpenChange}
          shift={shift}
          lastVisit={meta?.lastVisit ?? null}
          nextScheduled={meta?.nextScheduled ?? null}
          onUpdated={() => {
            // Re-fetch to reflect any change (e.g. status change shown via badge)
            onUpdated();
          }}
          onReschedule={onReschedule}
          onViewPatient={onViewPatient}
          primaryAction={primaryAction}
        />
      )}
      {loading && !shift && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-md">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando turno…
        </div>
      )}
    </>
  );
}

"use client";

import type { ShiftStatus } from "@/types";
import { SHIFT_STATUS_BADGE, SHIFT_STATUS_DOT, SHIFT_STATUS_LABEL, SHIFT_STATUS_TEXT } from "@/lib/shift-status";
import { cn } from "@/lib/utils";

interface ShiftStatusBadgeProps {
  status: ShiftStatus;
  /** `dot`: punto + texto (listas). `chip`: etiqueta rellena en mayúsculas (encabezados). */
  variant?: "dot" | "chip";
  className?: string;
}

/** Estado del turno con la paleta única de lib/shift-status.ts. */
export function ShiftStatusBadge({ status, variant = "dot", className }: ShiftStatusBadgeProps) {
  if (variant === "chip") {
    return (
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
          SHIFT_STATUS_BADGE[status],
          className,
        )}
      >
        {SHIFT_STATUS_LABEL[status]}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium", SHIFT_STATUS_TEXT[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", SHIFT_STATUS_DOT[status])} />
      {SHIFT_STATUS_LABEL[status]}
    </span>
  );
}

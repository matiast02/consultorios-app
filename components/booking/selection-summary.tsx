"use client";

import { CalendarDays } from "lucide-react";
import { formatDateOnlyLong } from "@/lib/booking-client";
import type { SelectedSlot } from "./booking-storage";
import { MedicAvatar } from "./public-ui";

const changeBtn =
  "shrink-0 rounded-full px-2.5 py-1 text-[13.5px] font-semibold text-[var(--primary-deep)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-soft-2)]";

/** Resumen compacto de lo elegido en los pasos anteriores, con atajos para cambiarlo. */
export function SelectionSummary({
  medicShortName,
  specialtyName,
  specialtyColor,
  consultationTypeName,
  durationMinutes,
  slot,
  onChangeMedic,
  onChangeSlot,
}: {
  medicShortName: string;
  specialtyName: string | null;
  specialtyColor: string | null;
  consultationTypeName: string | null;
  durationMinutes?: number | null;
  slot?: SelectedSlot | null;
  onChangeMedic: () => void;
  onChangeSlot?: () => void;
}) {
  const detail = [specialtyName, consultationTypeName ?? (durationMinutes ? `${durationMinutes} min` : null)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="divide-y divide-[var(--border)] rounded-2xl bg-[var(--section-tint)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <MedicAvatar shortName={medicShortName} color={specialtyColor} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15.5px] font-semibold text-[var(--ink)]">{medicShortName}</p>
          {detail && <p className="truncate text-[13px] text-[var(--muted)]">{detail}</p>}
        </div>
        <button type="button" className={changeBtn} onClick={onChangeMedic}>
          Cambiar
        </button>
      </div>
      {slot && onChangeSlot && (
        <div className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[var(--primary)]">
            <CalendarDays className="h-[18px] w-[18px]" />
          </span>
          <p className="min-w-0 flex-1 text-[15px] leading-tight text-[var(--ink)]">
            <span className="block truncate font-semibold">{formatDateOnlyLong(slot.date)}</span>
            <span className="text-[13px] text-[var(--muted)]">{`${slot.time} hs`}</span>
          </p>
          <button type="button" className={changeBtn} onClick={onChangeSlot}>
            Cambiar
          </button>
        </div>
      )}
    </div>
  );
}

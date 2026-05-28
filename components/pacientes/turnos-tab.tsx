"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Edit, Plus } from "lucide-react";
import {
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_DOT_COLORS,
  type Shift,
} from "@/types";
import { SectionHead, fmtDateAR, fmtTime, relTime } from "./shared";
import { cn } from "@/lib/utils";

interface TurnosTabProps {
  shifts: Shift[];
  onNewShift: () => void;
}

const STATUS_BADGE_CLASS: Record<Shift["status"], string> = {
  PENDING:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  CONFIRMED:
    "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-300",
  ABSENT:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300",
  FINISHED:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
  CANCELLED:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
};

export function TurnosTab({ shifts, onNewShift }: TurnosTabProps) {
  const now = new Date();
  const sorted = [...shifts].sort(
    (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime(),
  );

  return (
    <Card className="overflow-hidden pb-0 pt-0 shadow-xs">
      <SectionHead
        icon={Calendar}
        title="Historial de turnos"
        description={`${shifts.length} turnos registrados.`}
        actions={
          <Button size="sm" onClick={onNewShift} className="h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo turno
          </Button>
        }
      />
      <div className="mt-4 overflow-x-auto">
        {sorted.length === 0 ? (
          <div className="px-6 pb-6 pt-2 text-center text-sm text-muted-foreground">
            Sin turnos registrados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Fecha
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Horario
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Tipo
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Motivo
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => {
                const start = new Date(s.start);
                const end = new Date(s.end);
                const isFuture = start > now;
                return (
                  <TableRow
                    key={s.id}
                    className={cn(isFuture && "bg-primary/[0.04] hover:bg-primary/[0.06]")}
                  >
                    <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                      {fmtDateAR(start)}
                      <span className="ml-1.5 text-[11.5px] font-medium text-muted-foreground">
                        {relTime(start, now)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                      {fmtTime(start)} – {fmtTime(end)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1.5 font-medium",
                          STATUS_BADGE_CLASS[s.status],
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            SHIFT_STATUS_DOT_COLORS[s.status],
                          )}
                        />
                        {SHIFT_STATUS_LABELS[s.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[13px] text-foreground/80">
                      {s.consultationType?.name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-[13px] text-muted-foreground">
                      {s.observations ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

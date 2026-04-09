import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowRight } from "lucide-react";
import type { Shift } from "@/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface RescheduledBannerProps {
  shifts: Shift[];
  /** Show the medic name next to the patient — used in the secretary view */
  showMedicName?: boolean;
  /** Max number of shift rows to show before collapsing to "y N mas..." */
  maxVisible?: number;
  onDismiss: () => void;
}

export function RescheduledBanner({
  shifts,
  showMedicName = false,
  maxVisible = 3,
  onDismiss,
}: RescheduledBannerProps) {
  if (shifts.length === 0) return null;

  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {shifts.length} turno(s) reprogramado(s) automaticamente
              </p>
              <div className="space-y-1">
                {shifts.slice(0, maxVisible).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400"
                  >
                    <span className="font-medium">
                      {s.patient
                        ? `${s.patient.lastName}, ${s.patient.firstName}`
                        : "Paciente"}
                    </span>
                    {showMedicName && s.user && (
                      <span className="text-amber-600">
                        ({s.user.lastName ?? s.user.name})
                      </span>
                    )}
                    <span>
                      {s.rescheduledFrom &&
                        format(new Date(s.rescheduledFrom), "dd/MM", {
                          locale: es,
                        })}
                    </span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium">
                      {format(new Date(s.start), "dd/MM HH:mm", { locale: es })}
                    </span>
                  </div>
                ))}
                {shifts.length > maxVisible && (
                  <p className="text-xs text-amber-600">
                    y {shifts.length - maxVisible} mas...
                  </p>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-amber-700 hover:text-amber-900"
            onClick={onDismiss}
          >
            Entendido
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
}

export function StatCard({ label, value, icon: Icon, color, bg, border }: StatCardProps) {
  return (
    <Card className={`border-l-4 ${border} shadow-sm`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}
        >
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

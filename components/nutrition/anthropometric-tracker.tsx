"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, TrendingDown, TrendingUp, Minus, Trash2, Scale } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { AnthropometricData, AnthropometricEntry } from "./anthropometric-types";
import {
  calculateBMI,
  getBMICategory,
  calculateWaistHipRatio,
} from "./anthropometric-types";

interface AnthropometricTrackerProps {
  value: AnthropometricData;
  onChange: (data: AnthropometricData) => void;
  readOnly?: boolean;
}

export function AnthropometricTracker({
  value,
  onChange,
  readOnly = false,
}: AnthropometricTrackerProps) {
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(
    value.entries.length > 0
      ? String(value.entries[value.entries.length - 1].height)
      : ""
  );
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [notes, setNotes] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Auto-calculate BMI
  const liveBMI = useMemo(() => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (w > 0 && h > 0) return calculateBMI(w, h);
    return 0;
  }, [weight, height]);

  const bmiCategory = liveBMI > 0 ? getBMICategory(liveBMI) : null;

  // Chart data
  const chartData = useMemo(() => {
    return value.entries.map((e) => ({
      date: format(new Date(e.date), "dd/MM", { locale: es }),
      fullDate: format(new Date(e.date), "dd/MM/yyyy", { locale: es }),
      Peso: e.weight,
      IMC: e.bmi,
      Cintura: e.waist ?? null,
    }));
  }, [value.entries]);

  // Stats
  const latestEntry = value.entries.length > 0 ? value.entries[value.entries.length - 1] : null;
  const previousEntry = value.entries.length > 1 ? value.entries[value.entries.length - 2] : null;
  const weightDiff = latestEntry && previousEntry ? latestEntry.weight - previousEntry.weight : null;

  function handleAdd() {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    if (!w || !h || w <= 0 || h <= 0) return;

    const entry: AnthropometricEntry = {
      date: new Date().toISOString(),
      weight: w,
      height: h,
      bmi: calculateBMI(w, h),
      waist: waist ? parseFloat(waist) : undefined,
      hip: hip ? parseFloat(hip) : undefined,
      bodyFat: bodyFat ? parseFloat(bodyFat) : undefined,
      notes: notes || undefined,
    };

    const newData: AnthropometricData = {
      ...value,
      entries: [...value.entries, entry],
      lastUpdated: new Date().toISOString(),
    };

    onChange(newData);
    // Reset form but keep height (usually constant)
    setWeight("");
    setWaist("");
    setHip("");
    setBodyFat("");
    setNotes("");
    setShowForm(false);
  }

  function handleRemoveEntry(index: number) {
    const newEntries = value.entries.filter((_, i) => i !== index);
    onChange({ ...value, entries: newEntries, lastUpdated: new Date().toISOString() });
  }

  return (
    <div className="space-y-4">
      {/* Current stats summary */}
      {latestEntry && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{latestEntry.weight}</p>
            <p className="text-xs text-muted-foreground">Peso (kg)</p>
            {weightDiff !== null && weightDiff !== 0 && (
              <div className={`flex items-center justify-center gap-1 text-xs mt-1 ${weightDiff < 0 ? "text-emerald-500" : "text-amber-500"}`}>
                {weightDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                {weightDiff > 0 ? "+" : ""}{weightDiff.toFixed(1)} kg
              </div>
            )}
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: getBMICategory(latestEntry.bmi).color }}>
              {latestEntry.bmi}
            </p>
            <p className="text-xs text-muted-foreground">IMC</p>
            <Badge variant="outline" className="mt-1 text-[10px]" style={{ borderColor: getBMICategory(latestEntry.bmi).color, color: getBMICategory(latestEntry.bmi).color }}>
              {getBMICategory(latestEntry.bmi).label}
            </Badge>
          </div>
          {latestEntry.waist && (
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{latestEntry.waist}</p>
              <p className="text-xs text-muted-foreground">Cintura (cm)</p>
              {latestEntry.hip && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  ICC: {calculateWaistHipRatio(latestEntry.waist, latestEntry.hip)}
                </p>
              )}
            </div>
          )}
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{latestEntry.height}</p>
            <p className="text-xs text-muted-foreground">Talla (cm)</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {value.entries.length} registro(s)
            </p>
          </div>
        </div>
      )}

      {/* Evolution chart */}
      {chartData.length >= 2 && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium mb-3">Evolucion del peso e IMC</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="peso" fontSize={10} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
              <YAxis yAxisId="imc" orientation="right" fontSize={10} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate ?? ""}
              />
              <Legend fontSize={11} />
              <Line
                yAxisId="peso"
                type="monotone"
                dataKey="Peso"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                unit=" kg"
              />
              <Line
                yAxisId="imc"
                type="monotone"
                dataKey="IMC"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              {chartData.some((d) => d.Cintura) && (
                <Line
                  yAxisId="peso"
                  type="monotone"
                  dataKey="Cintura"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={{ r: 3 }}
                  unit=" cm"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add new entry */}
      {!readOnly && (
        <>
          {!showForm ? (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo registro antropometrico
            </Button>
          ) : (
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Nuevo registro
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Peso (kg) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="75.5"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Talla (cm) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="170"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cintura (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                    placeholder="85"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cadera (cm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={hip}
                    onChange={(e) => setHip(e.target.value)}
                    placeholder="100"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Live BMI */}
              {liveBMI > 0 && bmiCategory && (
                <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-sm">
                    IMC: <span className="font-bold" style={{ color: bmiCategory.color }}>{liveBMI}</span>
                  </p>
                  <Badge variant="outline" className="text-[10px]" style={{ borderColor: bmiCategory.color, color: bmiCategory.color }}>
                    {bmiCategory.label}
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">% Grasa corporal</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="60"
                    value={bodyFat}
                    onChange={(e) => setBodyFat(e.target.value)}
                    placeholder="25"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observaciones..."
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={!weight || !height}>
                  <Plus className="mr-1 h-3 w-3" />
                  Registrar
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* History table */}
      {value.entries.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">Historial de registros</p>
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Peso</TableHead>
                    <TableHead className="text-xs text-right">IMC</TableHead>
                    <TableHead className="text-xs text-right">Cintura</TableHead>
                    <TableHead className="text-xs text-right">Cadera</TableHead>
                    <TableHead className="text-xs text-right">ICC</TableHead>
                    <TableHead className="text-xs">Notas</TableHead>
                    {!readOnly && <TableHead className="w-8" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...value.entries].reverse().map((entry, idx) => {
                    const realIdx = value.entries.length - 1 - idx;
                    const prevEntry = realIdx > 0 ? value.entries[realIdx - 1] : null;
                    const diff = prevEntry ? entry.weight - prevEntry.weight : null;
                    const bmiCat = getBMICategory(entry.bmi);

                    return (
                      <TableRow key={entry.date + idx}>
                        <TableCell className="text-xs">
                          {format(new Date(entry.date), "dd/MM/yy", { locale: es })}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          {entry.weight} kg
                          {diff !== null && diff !== 0 && (
                            <span className={`ml-1 text-[10px] ${diff < 0 ? "text-emerald-500" : "text-amber-500"}`}>
                              ({diff > 0 ? "+" : ""}{diff.toFixed(1)})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <span style={{ color: bmiCat.color }}>{entry.bmi}</span>
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {entry.waist ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {entry.hip ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {entry.waist && entry.hip
                            ? calculateWaistHipRatio(entry.waist, entry.hip)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {entry.notes ?? "-"}
                        </TableCell>
                        {!readOnly && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveEntry(realIdx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {value.entries.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay registros antropometricos. Agrega el primero para comenzar el seguimiento.
        </p>
      )}
    </div>
  );
}

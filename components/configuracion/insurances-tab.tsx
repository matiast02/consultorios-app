"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ShieldCheck, Search, Plus, Loader2 } from "lucide-react";
import type { HealthInsurance } from "@/types";

type AcceptedRow = {
  insuranceId: string;
  copago: number;
  healthInsurance?: HealthInsurance;
};

// Heuristic: common codes that ship in the seed are not "regional"
const COMMON_CODES = new Set(["400", "401", "402", "403", "500", "600", "000"]);

function isRegional(ins: HealthInsurance): boolean {
  return !ins.code || !COMMON_CODES.has(ins.code);
}

export function InsurancesTab() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allInsurances, setAllInsurances] = useState<HealthInsurance[]>([]);
  const [accepted, setAccepted] = useState<Map<string, number>>(new Map());
  const [originalAccepted, setOriginalAccepted] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!userId) return;
    Promise.all([fetch("/api/health-insurance"), fetch(`/api/users/${userId}/insurances`)])
      .then(async ([allRes, userRes]) => {
        if (allRes.ok) {
          const allJson = await allRes.json();
          setAllInsurances(allJson.data ?? []);
        }
        if (userRes.ok) {
          const userJson = await userRes.json();
          const rows: AcceptedRow[] = userJson.accepted ?? [];
          const map = new Map<string, number>();
          for (const r of rows) map.set(r.insuranceId, r.copago);
          setAccepted(map);
          setOriginalAccepted(new Map(map));
        }
      })
      .catch(() => toast.error("Error al cargar obras sociales"))
      .finally(() => setLoading(false));
  }, [userId]);

  // Sorted: common first, then regional. Within each group, alphabetical.
  const sortedInsurances = useMemo(() => {
    const common = allInsurances.filter((i) => !isRegional(i));
    const regional = allInsurances.filter((i) => isRegional(i));
    common.sort((a, b) => a.name.localeCompare(b.name, "es"));
    regional.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return [...common, ...regional];
  }, [allInsurances]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedInsurances;
    return sortedInsurances.filter(
      (ins) =>
        ins.name.toLowerCase().includes(q) ||
        (ins.code ?? "").toLowerCase().includes(q)
    );
  }, [sortedInsurances, query]);

  const dirty = useMemo(() => {
    if (accepted.size !== originalAccepted.size) return true;
    for (const [k, v] of accepted) {
      if (originalAccepted.get(k) !== v) return true;
    }
    return false;
  }, [accepted, originalAccepted]);

  function toggle(insuranceId: string) {
    setAccepted((prev) => {
      const next = new Map(prev);
      if (next.has(insuranceId)) next.delete(insuranceId);
      else next.set(insuranceId, 0);
      return next;
    });
  }

  function setCopago(insuranceId: string, copago: number) {
    setAccepted((prev) => {
      const next = new Map(prev);
      next.set(insuranceId, Math.max(0, copago));
      return next;
    });
  }

  function selectAll() {
    setAccepted((prev) => {
      const next = new Map(prev);
      for (const ins of allInsurances) {
        if (!next.has(ins.id)) next.set(ins.id, 0);
      }
      return next;
    });
  }

  function clearAll() {
    setAccepted(new Map());
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    try {
      const payload = {
        insurances: Array.from(accepted.entries()).map(([insuranceId, copago]) => ({
          insuranceId,
          copago,
        })),
      };
      const res = await fetch(`/api/users/${userId}/insurances`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setOriginalAccepted(new Map(accepted));
      toast.success("Obras sociales guardadas");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function createInsurance() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/health-insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), code: newCode.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear");
      }
      const { data } = await res.json();
      setAllInsurances((prev) => [...prev, data]);
      setAccepted((prev) => new Map(prev).set(data.id, 0));
      setShowAdd(false);
      setNewName("");
      setNewCode("");
      toast.success("Obra social agregada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const acceptedCount = accepted.size;
  const totalCount = allInsurances.length;
  const notAcceptedCount = totalCount - acceptedCount;
  const copagosWithValue = Array.from(accepted.values()).filter((v) => v > 0);
  const avgCopago = copagosWithValue.length
    ? Math.round(copagosWithValue.reduce((a, b) => a + b, 0) / copagosWithValue.length)
    : 0;
  const fmtMoney = (v: number) => `$ ${v.toLocaleString("es-AR")}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Obras sociales aceptadas
            </CardTitle>
            <CardDescription>
              Marcá las obras sociales que aceptás y definí el copago por consulta. Esto aparece al reservar turnos.
            </CardDescription>
          </div>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Agregar otra
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar obra social</DialogTitle>
                <DialogDescription>
                  Si la obra social que acepta el paciente no aparece, agregala acá.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="OSDEPYM"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Código (opcional)</Label>
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="405"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowAdd(false)}>
                  Cancelar
                </Button>
                <Button onClick={createInsurance} disabled={!newName.trim() || creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Agregar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Summary + actions */}
        <div className="flex flex-col gap-3 rounded-md border bg-muted/30 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="font-semibold text-foreground">{acceptedCount}</span>{" "}
              <span className="text-muted-foreground">aceptadas</span>
            </span>
            <span>
              <span className="font-semibold text-foreground">{notAcceptedCount}</span>{" "}
              <span className="text-muted-foreground">no aceptadas</span>
            </span>
            <span className="text-muted-foreground">
              Copago promedio:{" "}
              <span className="font-semibold text-foreground">
                {avgCopago > 0 ? fmtMoney(avgCopago) : "—"}
              </span>
            </span>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="font-medium text-primary hover:underline"
            >
              Seleccionar todas
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Grid of insurances */}
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {allInsurances.length === 0
              ? "No hay obras sociales registradas."
              : "No hay coincidencias para tu búsqueda."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filtered.map((ins) => {
              const isAccepted = accepted.has(ins.id);
              const copago = accepted.get(ins.id) ?? 0;
              const regional = isRegional(ins);
              return (
                <label
                  key={ins.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    isAccepted
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <Checkbox
                    checked={isAccepted}
                    onCheckedChange={() => toggle(ins.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{ins.name}</span>
                      {regional && (
                        <Badge
                          variant="secondary"
                          className="h-4 shrink-0 rounded-full bg-muted px-1.5 py-0 text-[9px] font-medium text-muted-foreground"
                        >
                          regional
                        </Badge>
                      )}
                    </div>
                    {ins.code && (
                      <p className="text-xs text-muted-foreground">cód. {ins.code}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={isAccepted ? copago || "" : ""}
                      disabled={!isAccepted}
                      onChange={(e) => setCopago(ins.id, Number(e.target.value) || 0)}
                      onClick={(e) => e.preventDefault()}
                      className="h-8 w-20 text-right text-sm"
                    />
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Aceptás <span className="font-semibold text-foreground">{acceptedCount}</span> de{" "}
            <span className="font-semibold text-foreground">{totalCount}</span> obras sociales disponibles.
          </p>
          {dirty && (
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

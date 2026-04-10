"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Loader2, BookX } from "lucide-react";

interface ProfessionConfigItem {
  id: string;
  code: string;
  name: string;
  professionalLabel: string;
  patientLabel: string;
  prescriptionLabel: string;
  evolutionLabel: string;
  clinicalRecordLabel: string;
  enabledModules: string;
  clinicalFields: string;
  _count?: { specializations: number };
}

export default function ProfesionesPage() {
  const [items, setItems] = useState<ProfessionConfigItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profession-configs");
      if (!res.ok) throw new Error("Error al cargar configuraciones");
      const json = await res.json();
      const list = json.data ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      toast.error("No se pudieron cargar las configuraciones de profesion");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function parseModules(json: string): string[] {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  const MODULE_LABELS: Record<string, string> = {
    prescriptions: "Recetas",
    study_orders: "Estudios",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profesiones</h1>
        <p className="text-muted-foreground">
          Configuraciones de profesion del sistema
        </p>
      </div>

      {/* Table card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">
              Listado de Profesiones
              {!loading && items.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({items.length}{" "}
                  {items.length === 1 ? "profesion" : "profesiones"})
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BookX className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 font-medium text-foreground">
                Sin configuraciones de profesion registradas
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Las profesiones se configuran desde el seed del sistema.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Nombre</TableHead>
                    <TableHead className="font-semibold">Prefijo</TableHead>
                    <TableHead className="font-semibold">Receta</TableHead>
                    <TableHead className="font-semibold">Evolucion</TableHead>
                    <TableHead className="font-semibold">HC</TableHead>
                    <TableHead className="font-semibold">Modulos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const modules = parseModules(item.enabledModules);
                    return (
                      <TableRow
                        key={item.id}
                        className="transition-colors duration-150 hover:bg-primary/5"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p>{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.code}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.professionalLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.prescriptionLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.evolutionLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.clinicalRecordLabel}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {modules.length === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              modules.map((mod) => (
                                <Badge
                                  key={mod}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {MODULE_LABELS[mod] ?? mod}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

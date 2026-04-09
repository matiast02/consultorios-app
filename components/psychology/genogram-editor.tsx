"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Users, FileText, Network } from "lucide-react";
import type { GenogramData, GenogramMember, GenogramRelation } from "./genogram-types";
import {
  RELATIONSHIP_OPTIONS,
  RELATION_TYPE_LABELS,
  RELATION_TYPE_COLORS,
  GENDER_LABELS,
  generateFamilySummary,
} from "./genogram-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return "member-" + Math.random().toString(36).slice(2, 9);
}

function GenderSymbol({ gender }: { gender: GenogramMember["gender"] }) {
  if (gender === "male") {
    return (
      <span
        title="Masculino"
        className="inline-flex h-5 w-5 items-center justify-center rounded-none border-2 border-blue-400 text-[10px] font-bold text-blue-400"
        aria-label="Masculino"
      >
        M
      </span>
    );
  }
  if (gender === "female") {
    return (
      <span
        title="Femenino"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-pink-400 text-[10px] font-bold text-pink-400"
        aria-label="Femenino"
      >
        F
      </span>
    );
  }
  return (
    <span
      title="Otro"
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border-2 border-zinc-400 text-[10px] font-bold text-zinc-400 rotate-45"
      aria-label="Otro"
    >
      X
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GenogramEditorProps {
  value: GenogramData;
  onChange: (data: GenogramData) => void;
  readOnly?: boolean;
}

// ─── New member form defaults ─────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  age: "",
  gender: "other" as GenogramMember["gender"],
  relationship: "",
  notes: "",
  conditions: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function GenogramEditor({
  value,
  onChange,
  readOnly = false,
}: GenogramEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const summary = useMemo(() => generateFamilySummary(value), [value]);

  // ─── Member helpers ────────────────────────────────────────────────────────

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEditForm(member: GenogramMember) {
    setEditingId(member.id);
    setForm({
      name: member.name,
      age: member.age != null ? String(member.age) : "",
      gender: member.gender,
      relationship: member.relationship,
      notes: member.notes ?? "",
      conditions: member.conditions ?? "",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function submitForm() {
    if (!form.name.trim() || !form.relationship) return;

    const age = form.age ? parseInt(form.age, 10) : undefined;

    if (editingId) {
      // Update existing
      onChange({
        ...value,
        members: value.members.map((m) =>
          m.id === editingId
            ? {
                ...m,
                name: form.name.trim(),
                age: Number.isNaN(age ?? NaN) ? undefined : age,
                gender: form.gender,
                relationship: form.relationship,
                notes: form.notes.trim() || undefined,
                conditions: form.conditions.trim() || undefined,
              }
            : m
        ),
      });
    } else {
      // Add new
      const newMember: GenogramMember = {
        id: generateId(),
        name: form.name.trim(),
        age: Number.isNaN(age ?? NaN) ? undefined : age,
        gender: form.gender,
        relationship: form.relationship,
        notes: form.notes.trim() || undefined,
        conditions: form.conditions.trim() || undefined,
      };
      onChange({ ...value, members: [...value.members, newMember] });
    }

    cancelForm();
  }

  function removeMember(id: string) {
    onChange({
      ...value,
      members: value.members.filter((m) => m.id !== id),
      // Also remove relations that reference this member
      relations: value.relations.filter(
        (r) => r.from !== id && r.to !== id
      ),
    });
  }

  // ─── Relation helpers ──────────────────────────────────────────────────────

  function getRelationType(fromId: string, toId: string): GenogramRelation["type"] | "" {
    const rel = value.relations.find(
      (r) =>
        (r.from === fromId && r.to === toId) ||
        (r.from === toId && r.to === fromId)
    );
    return rel?.type ?? "";
  }

  function setRelationType(
    fromId: string,
    toId: string,
    type: GenogramRelation["type"] | ""
  ) {
    const filtered = value.relations.filter(
      (r) =>
        !(
          (r.from === fromId && r.to === toId) ||
          (r.from === toId && r.to === fromId)
        )
    );

    if (type === "") {
      onChange({ ...value, relations: filtered });
    } else {
      onChange({
        ...value,
        relations: [...filtered, { from: fromId, to: toId, type }],
      });
    }
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const nonPatientMembers = value.members.filter((m) => !m.isPatient);
  const patient = value.members.find((m) => m.isPatient);

  // Pairs for relation matrix: patient vs each other member + pairs among non-patients
  const relationPairs: Array<{ a: GenogramMember; b: GenogramMember }> = [];
  if (patient) {
    for (const m of nonPatientMembers) {
      relationPairs.push({ a: patient, b: m });
    }
  }
  // Also add sibling/partner relations between non-patient members
  for (let i = 0; i < nonPatientMembers.length; i++) {
    for (let j = i + 1; j < nonPatientMembers.length; j++) {
      relationPairs.push({ a: nonPatientMembers[i], b: nonPatientMembers[j] });
    }
  }

  // Limit matrix to manageable size (max 15 pairs)
  const visiblePairs = relationPairs.slice(0, 15);

  const membersWithConditions = value.members.filter(
    (m) => m.conditions?.trim()
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Members section ─────────────────────────────────────────────────── */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Users className="h-4 w-4 text-violet-400" />
              Integrantes del sistema familiar
            </CardTitle>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={openAddForm}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Agregar familiar
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Member list */}
          {value.members.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-4">
              No hay integrantes cargados.
            </p>
          ) : (
            <div className="space-y-2">
              {value.members.map((member) => (
                <div
                  key={member.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    member.isPatient
                      ? "border-violet-600 bg-violet-950/40"
                      : "border-zinc-700 bg-zinc-800/50"
                  }`}
                >
                  {/* Gender symbol */}
                  <div className="mt-0.5 shrink-0">
                    <GenderSymbol gender={member.gender} />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-100">
                        {member.name}
                      </span>
                      {member.age != null && (
                        <span className="text-xs text-zinc-400">
                          {member.age} años
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${
                          member.isPatient
                            ? "border-violet-500 text-violet-300"
                            : "border-zinc-600 text-zinc-400"
                        }`}
                      >
                        {member.relationship}
                      </Badge>
                      {member.isPatient && (
                        <Badge className="bg-violet-700 text-[10px] text-white">
                          Paciente
                        </Badge>
                      )}
                    </div>

                    {member.conditions && (
                      <div className="flex flex-wrap gap-1">
                        {member.conditions.split(",").map((cond, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="bg-amber-900/40 text-[10px] text-amber-300 border-amber-800"
                          >
                            {cond.trim()}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {member.notes && (
                      <p className="text-xs text-zinc-400">{member.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  {!readOnly && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
                        onClick={() => openEditForm(member)}
                        aria-label="Editar"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {!member.isPatient && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-zinc-400 hover:text-red-400"
                          onClick={() => removeMember(member.id)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form */}
          {!readOnly && showForm && (
            <>
              <Separator className="bg-zinc-700" />
              <div className="rounded-lg border border-zinc-600 bg-zinc-800 p-4 space-y-4">
                <p className="text-sm font-medium text-zinc-200">
                  {editingId ? "Editar integrante" : "Nuevo integrante"}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Nombre *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="Nombre del familiar"
                      className="border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                    />
                  </div>

                  {/* Age */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Edad</Label>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      value={form.age}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, age: e.target.value }))
                      }
                      placeholder="Edad (opcional)"
                      className="border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                    />
                  </div>

                  {/* Gender */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Genero *</Label>
                    <Select
                      value={form.gender}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          gender: v as GenogramMember["gender"],
                        }))
                      }
                    >
                      <SelectTrigger className="border-zinc-600 bg-zinc-900 text-zinc-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-700 bg-zinc-900">
                        {Object.entries(GENDER_LABELS).map(([val, label]) => (
                          <SelectItem
                            key={val}
                            value={val}
                            className="text-zinc-100 focus:bg-zinc-800"
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Relationship */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-400">Vinculo con el paciente *</Label>
                    <Select
                      value={form.relationship}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, relationship: v }))
                      }
                    >
                      <SelectTrigger className="border-zinc-600 bg-zinc-900 text-zinc-100">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-700 bg-zinc-900">
                        {RELATIONSHIP_OPTIONS.filter(
                          (r) => r !== "Paciente"
                        ).map((rel) => (
                          <SelectItem
                            key={rel}
                            value={rel}
                            className="text-zinc-100 focus:bg-zinc-800"
                          >
                            {rel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conditions */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-zinc-400">
                      Condiciones / antecedentes relevantes
                      <span className="ml-1 text-zinc-500">
                        (separar con coma)
                      </span>
                    </Label>
                    <Input
                      value={form.conditions}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, conditions: e.target.value }))
                      }
                      placeholder="Depresion, Alcoholismo, Diabetes..."
                      className="border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-zinc-400">Notas adicionales</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      placeholder="Observaciones sobre este familiar..."
                      rows={2}
                      className="border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-zinc-400 hover:text-zinc-100"
                    onClick={cancelForm}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-violet-700 hover:bg-violet-600 text-white"
                    onClick={submitForm}
                    disabled={!form.name.trim() || !form.relationship}
                  >
                    {editingId ? "Guardar cambios" : "Agregar"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Relationship quality matrix ──────────────────────────────────────── */}
      {value.members.length > 1 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Network className="h-4 w-4 text-violet-400" />
              Calidad de los vinculos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visiblePairs.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Agregue mas integrantes para definir vinculos.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs">
                      Entre
                    </TableHead>
                    <TableHead className="text-zinc-400 text-xs">
                      Y
                    </TableHead>
                    <TableHead className="text-zinc-400 text-xs">
                      Tipo de vinculo
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePairs.map(({ a, b }) => {
                    const currentType = getRelationType(a.id, b.id);
                    return (
                      <TableRow
                        key={`${a.id}-${b.id}`}
                        className="border-zinc-800 hover:bg-zinc-800/50"
                      >
                        <TableCell className="text-xs text-zinc-300 py-2">
                          <span
                            className={
                              a.isPatient ? "font-semibold text-violet-300" : ""
                            }
                          >
                            {a.name}
                          </span>
                          <span className="ml-1 text-zinc-500">
                            ({a.relationship})
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-300 py-2">
                          <span
                            className={
                              b.isPatient ? "font-semibold text-violet-300" : ""
                            }
                          >
                            {b.name}
                          </span>
                          <span className="ml-1 text-zinc-500">
                            ({b.relationship})
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          {readOnly ? (
                            currentType ? (
                              <Badge
                                variant="outline"
                                style={{
                                  borderColor:
                                    RELATION_TYPE_COLORS[currentType],
                                  color: RELATION_TYPE_COLORS[currentType],
                                }}
                                className="text-[11px]"
                              >
                                {RELATION_TYPE_LABELS[currentType]}
                              </Badge>
                            ) : (
                              <span className="text-xs text-zinc-500">
                                Sin definir
                              </span>
                            )
                          ) : (
                            <Select
                              value={currentType}
                              onValueChange={(v) =>
                                setRelationType(
                                  a.id,
                                  b.id,
                                  v as GenogramRelation["type"] | ""
                                )
                              }
                            >
                              <SelectTrigger className="h-7 w-[160px] border-zinc-700 bg-zinc-900 text-xs text-zinc-200">
                                <SelectValue placeholder="Sin definir" />
                              </SelectTrigger>
                              <SelectContent className="border-zinc-700 bg-zinc-900">
                                <SelectItem
                                  value=""
                                  className="text-zinc-400 focus:bg-zinc-800 text-xs"
                                >
                                  Sin definir
                                </SelectItem>
                                {Object.entries(RELATION_TYPE_LABELS).map(
                                  ([val, label]) => (
                                    <SelectItem
                                      key={val}
                                      value={val}
                                      className="text-zinc-100 focus:bg-zinc-800 text-xs"
                                    >
                                      <span className="flex items-center gap-2">
                                        <span
                                          className="h-2 w-2 rounded-full shrink-0"
                                          style={{
                                            backgroundColor:
                                              RELATION_TYPE_COLORS[
                                                val as GenogramRelation["type"]
                                              ],
                                          }}
                                        />
                                        {label}
                                      </span>
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-3">
              {Object.entries(RELATION_TYPE_LABELS).map(([val, label]) => (
                <div key={val} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        RELATION_TYPE_COLORS[val as GenogramRelation["type"]],
                    }}
                  />
                  <span className="text-[11px] text-zinc-400">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Conditions summary ──────────────────────────────────────────────── */}
      {membersWithConditions.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-zinc-100">
              Antecedentes familiares relevantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {membersWithConditions.map((m) => (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="text-xs font-medium text-zinc-300 min-w-[120px]">
                    {m.name}
                    <span className="ml-1 text-zinc-500">({m.relationship})</span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(m.conditions ?? "").split(",").map((cond, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="bg-amber-900/40 text-[10px] text-amber-300 border-amber-800"
                      >
                        {cond.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Auto-generated summary ──────────────────────────────────────────── */}
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-100">
            Resumen automatico del genograma
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-400 leading-relaxed">{summary}</p>
          <Separator className="bg-zinc-700" />
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">
              Notas del profesional sobre el genograma
            </Label>
            <Textarea
              value={value.notes ?? ""}
              onChange={(e) =>
                onChange({ ...value, notes: e.target.value })
              }
              readOnly={readOnly}
              placeholder="Observaciones clinicas sobre la dinamica familiar..."
              rows={3}
              className="border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 resize-none"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

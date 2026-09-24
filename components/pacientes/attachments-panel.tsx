"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  ChevronDown,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  RotateCw,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AttachmentEntityType, ClinicalAttachment } from "@/types";
import { fmtDateAR, fmtTime, relTime } from "./shared";
import { cn } from "@/lib/utils";

// ─── Reglas de subida (espejo del backend; el servidor valida por magic bytes) ─

const MAX_MB = 15;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MAX_DESCRIPTION = 300;
const MAX_FILES_PER_BATCH = 10;
const MIN_ANNUL_REASON = 3;
const MAX_ANNUL_REASON = 300;

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ACCEPT_ATTR = ALLOWED_MIME.join(",");

const PRIVACY_NOTE =
  "Los archivos se guardan cifrados y solo los ve el profesional que los subió, el administrador o quien tenga una concesión de acceso.";

/** El contrato (attachments.yaml) usa el enum en minúscula en query y multipart. */
const WIRE_ENTITY_TYPE: Record<AttachmentEntityType, string> = {
  EVOLUTION: "evolution",
  STUDY_ORDER: "study_order",
  CLINICAL_RECORD: "clinical_record",
};

const UPLOAD_ERROR_BY_STATUS: Record<number, string> = {
  400: "El archivo no se pudo procesar: falta, tiene un tipo no permitido o un nombre inválido",
  401: "Tu sesión expiró. Volvé a iniciar sesión",
  403: "No tenés permiso para adjuntar archivos acá (solo el profesional autor)",
  413: `Supera el máximo de ${MAX_MB} MB`,
  422: "El archivo no es un PDF o imagen válido",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sizeFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFmt.format(Math.round(bytes / 1024))} KB`;
  return `${sizeFmt.format(bytes / (1024 * 1024))} MB`;
}

function fileExt(name: string): string {
  return name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
}

function isPdf(mime: string) {
  return mime === "application/pdf";
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

/** Validación previa en el cliente (UX); la definitiva la hace el servidor. */
function validateFile(file: File): string | null {
  const typeOk = file.type
    ? ALLOWED_MIME.includes(file.type)
    : ALLOWED_EXT.includes(fileExt(file.name));
  if (!typeOk) return "Tipo no permitido: solo PDF, JPG, PNG o WebP";
  if (file.size === 0) return "El archivo está vacío";
  if (file.size > MAX_BYTES) {
    return `Supera el máximo de ${MAX_MB} MB (pesa ${formatBytes(file.size)})`;
  }
  return null;
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function when(iso: string): { label: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: "—", full: "" };
  const rel = relTime(d);
  return {
    label: rel === "hoy" || rel === "ayer" ? `${rel} ${fmtTime(d)}` : rel,
    full: `${fmtDateAR(d)} ${fmtTime(d)}`,
  };
}

function thumbnailUrl(id: string) {
  return `/api/attachments/${id}/thumbnail`;
}

/** URL local (blob:) para previsualizar un archivo antes de subirlo; se libera al cambiar. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

interface UploadResult {
  status: number;
  body: { success?: boolean; error?: string; data?: ClinicalAttachment } | null;
}

/** XHR (no fetch) para tener progreso de subida. Status 0 = red, -1 = cancelado. */
function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress: (pct: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let body: UploadResult["body"] = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.onabort = () => resolve({ status: -1, body: null });
    xhr.send(form);
  });
}

function uploadErrorMessage(res: UploadResult): string {
  if (res.status === 0) return "Error de red al subir el archivo. Revisá tu conexión";
  if (res.status >= 500) return "Error del servidor al subir el archivo. Probá de nuevo en unos minutos";
  return UPLOAD_ERROR_BY_STATUS[res.status] ?? res.body?.error ?? "No se pudo subir el archivo";
}

// ─── Tipos internos ──────────────────────────────────────────────────────────

type StagedStatus = "ready" | "uploading" | "error";

interface StagedFile {
  key: string;
  file: File;
  description: string;
  status: StagedStatus;
  progress: number;
  error?: string;
}

type LoadState = "loading" | "ready" | "forbidden" | "error";

export interface AttachmentsPanelProps {
  patientId: string;
  entityType: AttachmentEntityType;
  /** Evolución / orden asociada; sin valor para los documentos generales de la ficha. */
  entityId?: string | null;
  /** Solo el médico autor (y nunca un beneficiario de concesión). El backend igual lo valida. */
  canUpload: boolean;
  /** Variante densa para incrustar dentro de una evolución u orden. */
  compact?: boolean;
  /** Informa la cantidad de adjuntos vigentes (no anulados) al terminar de cargar. */
  onCountChange?: (count: number) => void;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function AttachmentsPanel({
  patientId,
  entityType,
  entityId = null,
  canUpload,
  compact = false,
  onCountChange,
}: AttachmentsPanelProps) {
  const [items, setItems] = useState<ClinicalAttachment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ClinicalAttachment | null>(null);
  const [annulTarget, setAnnulTarget] = useState<ClinicalAttachment | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  const listUrl = (() => {
    const qs = new URLSearchParams({ entityType: WIRE_ENTITY_TYPE[entityType] });
    if (entityId) qs.set("entityId", entityId);
    return `/api/patients/${patientId}/attachments?${qs.toString()}`;
  })();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoadState((s) => (s === "ready" ? s : "loading"));
      try {
        const res = await fetch(listUrl, { signal, cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          setItems([]);
          setLoadState("forbidden");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const data: ClinicalAttachment[] = Array.isArray(json?.data) ? json.data : [];
        setItems(data);
        setLoadState("ready");
        onCountChangeRef.current?.(data.filter((a) => !a.annulledAt).length);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLoadState("error");
      }
    },
    [listUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // ─── Selección de archivos ────────────────────────────────────────────────

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;

    const accepted: StagedFile[] = [];
    const existing = new Set(staged.map((s) => s.key));
    for (const file of files) {
      const problem = validateFile(file);
      if (problem) {
        toast.error(`No se puede adjuntar "${file.name}"`, { description: problem });
        continue;
      }
      const key = fileKey(file);
      if (existing.has(key)) continue;
      existing.add(key);
      accepted.push({ key, file, description: "", status: "ready", progress: 0 });
    }

    const room = MAX_FILES_PER_BATCH - staged.length;
    if (accepted.length > room) {
      toast.error(`Podés subir hasta ${MAX_FILES_PER_BATCH} archivos por vez`);
    }
    const next = accepted.slice(0, Math.max(0, room));
    if (next.length > 0) setStaged((s) => [...s, ...next]);
  }

  function patchStaged(key: string, patch: Partial<StagedFile>) {
    setStaged((s) => s.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function removeStaged(key: string) {
    xhrs.current.get(key)?.abort();
    setStaged((s) => s.filter((f) => f.key !== key));
  }

  // ─── Drag & drop ──────────────────────────────────────────────────────────

  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e) || uploading) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e) || uploading) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (uploading) return;
    addFiles(e.dataTransfer.files);
  }

  // ─── Subida ───────────────────────────────────────────────────────────────

  async function uploadAll() {
    const queue = staged.filter((f) => f.status !== "uploading");
    if (queue.length === 0) return;
    setUploading(true);
    let ok = 0;

    // Secuencial: progreso legible y sin saturar el cifrado del servidor.
    for (const item of queue) {
      patchStaged(item.key, { status: "uploading", progress: 0, error: undefined });

      const form = new FormData();
      form.append("file", item.file, item.file.name);
      form.append("entityType", WIRE_ENTITY_TYPE[entityType]);
      if (entityId) form.append("entityId", entityId);
      const description = item.description.trim().slice(0, MAX_DESCRIPTION);
      if (description) form.append("description", description);

      const res = await uploadWithProgress(
        `/api/patients/${patientId}/attachments`,
        form,
        (pct) => patchStaged(item.key, { progress: pct }),
        (xhr) => xhrs.current.set(item.key, xhr),
      );
      xhrs.current.delete(item.key);

      if (res.status === -1) continue; // cancelado por el usuario (ya se quitó de la lista)

      if (res.status === 201 || res.status === 200) {
        ok += 1;
        setStaged((s) => s.filter((f) => f.key !== item.key));
        continue;
      }

      const message = uploadErrorMessage(res);
      patchStaged(item.key, { status: "error", error: message, progress: 0 });
      const serverDetail = res.body?.error;
      toast.error(`No se pudo subir "${item.file.name}"`, {
        description:
          serverDetail && serverDetail !== message ? `${message}. ${serverDetail}` : message,
      });
    }

    setUploading(false);
    if (ok > 0) {
      toast.success(ok === 1 ? "Archivo adjuntado" : `${ok} archivos adjuntados`);
      load();
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const pendingCount = staged.filter((f) => f.status !== "uploading").length;

  return (
    <div className={cn("flex flex-col", compact ? "gap-2.5" : "gap-3.5")}>
      {canUpload && (
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition-colors",
            compact ? "px-3 py-3 sm:flex-row sm:justify-between sm:text-left" : "px-4 py-6",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/40",
          )}
        >
          <div className={cn("flex items-center gap-2.5", !compact && "flex-col")}>
            <Upload
              className={cn(
                "shrink-0",
                compact ? "h-4 w-4" : "h-6 w-6",
                dragActive ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden
            />
            <div>
              <p className={cn("font-medium", compact ? "text-[12.5px]" : "text-sm")}>
                {dragActive ? "Soltá los archivos para agregarlos" : "Arrastrá archivos acá"}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                PDF, JPG, PNG o WebP · máximo {MAX_MB} MB por archivo
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Adjuntar archivo
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = ""; // permite volver a elegir el mismo archivo
            }}
          />
        </div>
      )}

      {canUpload && staged.length > 0 && (
        <div className="rounded-lg border bg-card">
          <ul className="divide-y">
            {staged.map((f) => (
              <StagedRow
                key={f.key}
                item={f}
                disabled={uploading}
                onDescription={(v) => patchStaged(f.key, { description: v })}
                onRemove={() => removeStaged(f.key)}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={uploading}
              onClick={() => setStaged([])}
            >
              Descartar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={uploading || pendingCount === 0}
              onClick={uploadAll}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading
                ? "Subiendo…"
                : pendingCount === 1
                  ? "Subir archivo"
                  : `Subir ${pendingCount} archivos`}
            </Button>
          </div>
        </div>
      )}

      {/* Listado */}
      {loadState === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando adjuntos…
        </div>
      ) : loadState === "forbidden" ? (
        <p className="rounded-md bg-muted/40 px-3 py-2.5 text-center text-[12.5px] text-muted-foreground">
          No tenés acceso a los adjuntos de esta sección.
        </p>
      ) : loadState === "error" ? (
        <div className="flex flex-wrap items-center justify-center gap-2 py-3 text-[12.5px] text-muted-foreground">
          <CircleAlert className="h-4 w-4 text-destructive" />
          No se pudieron cargar los adjuntos.
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => load()}>
            <RotateCw className="h-3.5 w-3.5" />
            Reintentar
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className={cn("text-center text-muted-foreground", compact ? "py-2 text-[12.5px]" : "py-4 text-sm")}>
          Sin adjuntos
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Adjuntos">
          {items.map((a) => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              compact={compact}
              onPreview={() => setPreview(a)}
              onAnnul={() => setAnnulTarget(a)}
            />
          ))}
        </ul>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <Lock className="mt-px h-3 w-3 shrink-0" aria-hidden />
        {PRIVACY_NOTE}
      </p>

      <PreviewDialog attachment={preview} onClose={() => setPreview(null)} />

      <AnnulAttachmentDialog
        attachment={annulTarget}
        onClose={() => setAnnulTarget(null)}
        onAnnulled={() => {
          setAnnulTarget(null);
          load();
        }}
      />
    </div>
  );
}

// ─── Fila de archivo en cola ─────────────────────────────────────────────────

function StagedRow({
  item,
  disabled,
  onDescription,
  onRemove,
}: {
  item: StagedFile;
  disabled: boolean;
  onDescription: (v: string) => void;
  onRemove: () => void;
}) {
  const descId = useId();
  const isUploading = item.status === "uploading";
  const processing = isUploading && item.progress >= 100;
  const mime = item.file.type || (fileExt(item.file.name) === ".pdf" ? "application/pdf" : "image/*");
  const localPreview = useObjectUrl(isImage(mime) ? item.file : null);
  const [previewFailed, setPreviewFailed] = useState(false);

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {localPreview && !previewFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob local, todavía no subido
          <img
            src={localPreview}
            alt=""
            className="h-8 w-8 shrink-0 rounded-md border object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <MimeIcon mime={mime} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium" title={item.file.name}>
            {item.file.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatBytes(item.file.size)}
            {isUploading && (processing ? " · procesando y cifrando…" : ` · ${item.progress}%`)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={disabled && !isUploading}
          aria-label={isUploading ? `Cancelar la subida de ${item.file.name}` : `Quitar ${item.file.name}`}
          title={isUploading ? "Cancelar subida" : "Quitar"}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isUploading ? (
        <div
          role="progressbar"
          aria-label={`Subiendo ${item.file.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progress}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full bg-primary transition-[width] duration-200", processing && "animate-pulse")}
            style={{ width: `${item.progress}%` }}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={descId} className="sr-only">
            Descripción de {item.file.name} (opcional)
          </Label>
          <Input
            id={descId}
            value={item.description}
            maxLength={MAX_DESCRIPTION}
            disabled={disabled}
            onChange={(e) => onDescription(e.target.value)}
            placeholder="Descripción (opcional), ej.: Hemograma 12/09"
            className="h-8 text-[12.5px]"
          />
          {item.description.length > MAX_DESCRIPTION - 50 && (
            <p className="text-right text-[10.5px] tabular-nums text-muted-foreground">
              {item.description.length}/{MAX_DESCRIPTION}
            </p>
          )}
        </div>
      )}

      {item.status === "error" && item.error && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-destructive" role="alert">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          {item.error}. Podés reintentar con “Subir”.
        </p>
      )}
    </li>
  );
}

// ─── Fila de adjunto ─────────────────────────────────────────────────────────

function MimeIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon = isPdf(mime) ? FileText : isImage(mime) ? FileImage : FileIcon;
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
        isPdf(mime)
          ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
          : isImage(mime)
            ? "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300"
            : "bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

/**
 * Miniatura de un adjunto de imagen. Viene del endpoint autenticado que la
 * descifra; si falla (sin acceso, archivo faltante) se vuelve al ícono.
 * Clic = vista previa; anulado = solo se muestra, apagada.
 */
function Thumbnail({
  attachment: a,
  compact,
  annulled,
  onClick,
}: {
  attachment: ClinicalAttachment;
  compact: boolean;
  annulled: boolean;
  onClick: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  if (state === "error") return <MimeIcon mime={a.mimeType} className={cn(annulled && "opacity-50")} />;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado, sin optimizador
    <img
      src={thumbnailUrl(a.id)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("h-full w-full object-cover", state === "loading" && "opacity-0")}
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
    />
  );
  const frame = cn(
    "relative shrink-0 overflow-hidden rounded-md border bg-muted",
    compact ? "h-11 w-11" : "h-14 w-14",
    state === "loading" && "animate-pulse",
  );

  if (annulled) {
    return (
      <span className={cn(frame, "opacity-50 grayscale")} aria-hidden>
        {img}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver ${a.fileName}`}
      title="Ver imagen"
      className={cn(
        frame,
        "group/thumb cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {img}
      <span
        className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100"
        aria-hidden
      >
        <Eye className="h-4 w-4 drop-shadow" />
      </span>
    </button>
  );
}

function AttachmentRow({
  attachment: a,
  compact,
  onPreview,
  onAnnul,
}: {
  attachment: ClinicalAttachment;
  compact: boolean;
  onPreview: () => void;
  onAnnul: () => void;
}) {
  const annulled = !!a.annulledAt;
  const created = when(a.createdAt);
  const downloadUrl = `/api/attachments/${a.id}`;

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-lg border bg-card",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
        annulled && "bg-muted/30",
      )}
    >
      {a.hasThumbnail ? (
        <Thumbnail attachment={a} compact={compact} annulled={annulled} onClick={onPreview} />
      ) : (
        <MimeIcon mime={a.mimeType} className={cn(annulled && "opacity-50")} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "min-w-0 truncate text-[13px] font-semibold",
              annulled && "text-muted-foreground line-through",
            )}
            title={a.fileName}
          >
            {a.fileName}
          </p>
          {annulled && (
            <>
              <Badge
                variant="secondary"
                className="cursor-help bg-destructive/10 text-destructive"
                title={a.annulReason ? `Motivo: ${a.annulReason}` : "Anulado"}
              >
                Anulado
              </Badge>
              {a.annulReason && <span className="sr-only">Motivo de la anulación: {a.annulReason}</span>}
            </>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          {formatBytes(a.sizeBytes)}
          {a.width && a.height ? ` · ${a.width} × ${a.height} px` : ""} ·{" "}
          {a.uploadedBy?.shortName ?? "Profesional"} ·{" "}
          <time dateTime={a.createdAt} title={created.full}>
            {created.label}
          </time>
        </p>
        {a.description && (
          <p
            className={cn(
              "mt-1 whitespace-pre-wrap text-[12.5px] text-foreground/80",
              annulled && "line-through opacity-70",
            )}
          >
            {a.description}
          </p>
        )}
      </div>

      {!annulled && (
        <div className="flex shrink-0 items-center gap-1">
          {a.inlinePreviewable && isPdf(a.mimeType) ? (
            // PDF: pestaña nueva (Chrome no renderiza PDFs en documentos
            // sandboxed y los headers globales impiden embeberlo en un iframe).
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[12px]">
              <a
                href={`/api/attachments/${a.id}?inline=1`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver ${a.fileName} (se abre en una pestaña nueva)`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver
              </a>
            </Button>
          ) : a.inlinePreviewable && isImage(a.mimeType) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={onPreview}
              aria-label={`Ver ${a.fileName}`}
            >
              <Eye className="h-3.5 w-3.5" />
              Ver
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[12px]">
            <a href={downloadUrl} download={a.fileName} aria-label={`Descargar ${a.fileName}`}>
              <Download className="h-3.5 w-3.5" />
              Descargar
            </a>
          </Button>
          {a.canAnnul && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px] text-muted-foreground hover:text-destructive"
              onClick={onAnnul}
              aria-label={`Anular ${a.fileName}`}
            >
              <Ban className="h-3.5 w-3.5" />
              Anular
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Previsualización ────────────────────────────────────────────────────────

function PreviewDialog({
  attachment,
  onClose,
}: {
  attachment: ClinicalAttachment | null;
  onClose: () => void;
}) {
  const [imgState, setImgState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setImgState("loading");
  }, [attachment?.id]);

  const a = attachment;
  const inlineUrl = a ? `/api/attachments/${a.id}?inline=1` : "";
  const created = a ? when(a.createdAt) : null;

  return (
    <Dialog open={!!a} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-[96vw]">
        {a && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="truncate text-base" title={a.fileName}>
                {a.fileName}
              </DialogTitle>
              <DialogDescription className="text-[12px]">
                {formatBytes(a.sizeBytes)}
                {a.width && a.height ? ` · ${a.width} × ${a.height} px` : ""} ·{" "}
                {a.uploadedBy?.shortName ?? "Profesional"}
                {created && ` · ${created.full}`}
                {a.description ? ` · ${a.description}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/40">
              {/* Mientras carga la imagen completa, la miniatura desenfocada de fondo. */}
              {a.hasThumbnail && imgState === "loading" && (
                // eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado, sin optimizador
                <img
                  src={thumbnailUrl(a.id)}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-105 object-contain opacity-60 blur-md"
                />
              )}
              {/* Solo imágenes: los PDF se abren en una pestaña nueva. */}
              <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
                {imgState === "loading" && (
                  <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />
                )}
                {imgState === "error" ? (
                  <p className="text-sm text-muted-foreground">
                    No se pudo cargar la vista previa. Probá descargando el archivo.
                  </p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- endpoint autenticado, sin optimizador
                  <img
                    src={inlineUrl}
                    alt={a.description || a.fileName}
                    className={cn(
                      "max-h-full max-w-full object-contain",
                      imgState === "loading" && "opacity-0",
                    )}
                    onLoad={() => setImgState("ready")}
                    onError={() => setImgState("error")}
                  />
                )}
              </div>
            </div>

            <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
              <p className="text-[11px] text-muted-foreground">Vista previa de la imagen.</p>
              <Button asChild variant="outline" size="sm" className="h-8">
                <a href={`/api/attachments/${a.id}`} download={a.fileName}>
                  <Download className="h-3.5 w-3.5" />
                  Descargar
                </a>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Anulación ───────────────────────────────────────────────────────────────

function AnnulAttachmentDialog({
  attachment,
  onClose,
  onAnnulled,
}: {
  attachment: ClinicalAttachment | null;
  onClose: () => void;
  onAnnulled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const reasonId = useId();

  useEffect(() => {
    if (attachment) setReason("");
  }, [attachment]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_ANNUL_REASON && trimmed.length <= MAX_ANNUL_REASON;

  async function confirm() {
    if (!attachment || !valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/attachments/${attachment.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const fallback =
          res.status === 403
            ? "Solo quien subió el archivo puede anularlo"
            : res.status === 404
              ? "El adjunto no existe o ya fue anulado"
              : "No se pudo anular el adjunto";
        throw new Error(err?.error ?? fallback);
      }
      toast.success("Adjunto anulado", {
        description: "Se conserva en la historia clínica como anulado.",
      });
      onAnnulled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular el adjunto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!attachment} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Anular adjunto</DialogTitle>
          <DialogDescription>
            El archivo no se borra: queda marcado como anulado y se conserva con la historia
            clínica. Indicá el motivo.
          </DialogDescription>
        </DialogHeader>
        {attachment && (
          <p className="truncate rounded-md bg-muted/50 px-3 py-2 text-[12.5px] font-medium" title={attachment.fileName}>
            {attachment.fileName}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>Motivo de la anulación</Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={MAX_ANNUL_REASON}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: subido en el paciente equivocado"
            rows={3}
            aria-invalid={reason.length > 0 && !valid}
            aria-describedby={`${reasonId}-hint`}
          />
          <p id={`${reasonId}-hint`} className="flex justify-between text-[11px] text-muted-foreground">
            <span>Mínimo {MIN_ANNUL_REASON} caracteres.</span>
            <span className="tabular-nums">
              {trimmed.length}/{MAX_ANNUL_REASON}
            </span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={saving || !valid}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Anular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bloque colapsable (evoluciones / órdenes) ───────────────────────────────

export interface AttachmentsDisclosureProps
  extends Omit<AttachmentsPanelProps, "compact" | "onCountChange"> {
  /** Texto del encabezado, p. ej. "Adjuntos" o "Resultados / adjuntos". */
  label?: string;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Encabezado "Adjuntos (n)" que carga el panel recién al expandirlo (así no se
 * dispara una consulta + auditoría por cada asiento listado). Una vez abierto
 * queda montado aunque se colapse, para no cortar subidas en curso.
 * Frena la propagación de clicks: se usa dentro de tarjetas clickeables.
 */
export function AttachmentsDisclosure({
  label = "Adjuntos",
  defaultOpen = false,
  className,
  ...panelProps
}: AttachmentsDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const [count, setCount] = useState<number | null>(null);
  const regionId = useId();

  return (
    <div
      className={cn("cursor-auto rounded-lg border bg-muted/20", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => {
          setOpen((o) => !o);
          setMounted(true);
        }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] font-semibold text-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {label}
        {count !== null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        <ChevronDown
          className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {mounted && (
        <div id={regionId} hidden={!open} className="border-t px-3 py-3">
          <AttachmentsPanel {...panelProps} compact onCountChange={setCount} />
        </div>
      )}
    </div>
  );
}

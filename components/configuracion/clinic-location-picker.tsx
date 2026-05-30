"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { MapPin, Search, Move, Check, Crosshair, Loader2 } from "lucide-react";
import {
  searchAddress,
  reverseGeocode,
  shortDisplayName,
  type NominatimPlace,
} from "@/lib/geocoding";

// ── Tipos públicos ────────────────────────────────────────────────────────
export interface LocationValue {
  lat: number;
  lng: number;
  zoom: number;
  label: string | null;
}

interface Props {
  value: LocationValue | null;
  onChange: (v: LocationValue | null) => void;
}

// CABA por defecto.
const DEFAULT_CENTER: [number, number] = [-34.6037, -58.3816];
const DEFAULT_ZOOM = 13;

// ── Mapa cargado dinámicamente (Leaflet no es SSR-friendly) ───────────────
const MapInner = dynamic(() => import("./clinic-location-picker-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando mapa…
    </div>
  ),
});

export function ClinicLocationPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      try {
        const r = await searchAddress(q, { signal: ctrl.signal, countryCodes: "ar" });
        setSuggestions(r);
        setDropdownOpen(true);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          // Falla silenciosa; el usuario ve la lista vacía.
        }
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  function applyPlace(place: NominatimPlace, opts: { setQuery?: boolean } = {}) {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    const zoom = place.type === "house" || place.type === "building" ? 17 : 16;
    const label = shortDisplayName(place);
    onChange({ lat, lng, zoom, label });
    setDropdownOpen(false);
    if (opts.setQuery !== false) setQuery(label);
  }

  async function applyPin(lat: number, lng: number, zoom: number) {
    onChange({ lat, lng, zoom, label: value?.label ?? null });
    setReverseLoading(true);
    try {
      const place = await reverseGeocode(lat, lng);
      if (place) {
        onChange({ lat, lng, zoom, label: shortDisplayName(place) });
      } else {
        onChange({ lat, lng, zoom, label: "Ubicación personalizada" });
      }
    } finally {
      setReverseLoading(false);
    }
  }

  const center: [number, number] = useMemo(
    () => (value ? [value.lat, value.lng] : DEFAULT_CENTER),
    [value]
  );
  const zoom = value?.zoom ?? DEFAULT_ZOOM;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Label htmlFor="loc-search" className="mb-1.5 block text-sm font-medium">
          Buscar dirección
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="loc-search"
            type="text"
            placeholder="Ej: Av. Corrientes 1234, CABA"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
            onBlur={() => window.setTimeout(() => setDropdownOpen(false), 150)}
            className="w-full rounded-md border bg-background py-2.5 pl-9 pr-9 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Empezá a escribir y elegí una opción, o arrastrá el pin directamente sobre el mapa.
        </p>

        {dropdownOpen && suggestions.length > 0 && (
          // z-[1100]: Leaflet usa hasta z-700 para popups y z-1000 para controles;
          // el dropdown DEBE quedar por encima del mapa que se renderiza más abajo.
          <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-[1100] max-h-72 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
            {suggestions.map((s) => (
              <li key={s.place_id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyPlace(s)}
                  className="flex w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="line-clamp-2">{s.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MapInner center={center} zoom={zoom} value={value} onPinChange={applyPin} />

      {value && (
        <div className="flex items-start gap-2.5 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-emerald-900 dark:text-emerald-200">
              {value.label ?? "Ubicación personalizada"}
              {reverseLoading && (
                <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-emerald-700" />
              )}
            </p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70">
              lat {value.lat.toFixed(4)} · lon {value.lng.toFixed(4)} · zoom {value.zoom}
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Las coordenadas se calculan solas a partir del pin.
      </p>
    </div>
  );
}

// Label inline so we avoid importing the shadcn Label (less coupling).
function Label({
  htmlFor,
  className,
  children,
}: {
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  );
}

// Re-exports usados por el wrapper map (avoid bundling lucide twice).
export const PickerIcons = { MapPin, Search, Move, Check, Crosshair };

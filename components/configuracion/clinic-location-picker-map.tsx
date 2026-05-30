"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { Move, Crosshair } from "lucide-react";
import type { LocationValue } from "./clinic-location-picker";

// Workaround conocido: los íconos default de Leaflet rompen con bundlers porque
// resuelven las URLs internamente como _leaflet_id strings. Usamos un divIcon
// con SVG inline para evitarlo del todo.
const PIN_ICON = L.divIcon({
  className: "custom-leaflet-pin",
  html: `
    <div style="
      position:relative;
      width:32px;height:42px;
      transform:translate(-50%,-100%);
      filter: drop-shadow(0 4px 8px rgba(7,32,46,0.35));
    ">
      <svg viewBox="0 0 32 42" width="32" height="42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 11 16 26 16 26s16-15 16-26C32 7.16 24.84 0 16 0z"
              fill="#0a8a9e" />
        <circle cx="16" cy="16" r="6" fill="#ffffff" />
      </svg>
    </div>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

interface Props {
  center: [number, number];
  zoom: number;
  value: LocationValue | null;
  onPinChange: (lat: number, lng: number, zoom: number) => void;
}

// Helper: re-centra el mapa cuando cambia `center` desde props (p. ej. tras elegir una sugerencia).
function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const lastKey = useRef<string>("");
  useEffect(() => {
    const key = `${center[0]},${center[1]},${zoom}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

// Captura el zoom actual del mapa después de cualquier zoomend.
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({
    zoomend(e) {
      onZoom(e.target.getZoom());
    },
  });
  return null;
}

export default function ClinicLocationPickerMap({ center, zoom, value, onPinChange }: Props) {
  const markerRef = useRef<L.Marker | null>(null);

  const markerPos: [number, number] = useMemo(
    () => (value ? [value.lat, value.lng] : center),
    [value, center]
  );

  return (
    <div className="relative">
      <MapContainer
        center={markerPos}
        zoom={zoom}
        style={{ height: 360, width: "100%", borderRadius: 12 }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={markerPos}
          icon={PIN_ICON}
          draggable
          eventHandlers={{
            dragend(e) {
              const m = e.target as L.Marker;
              const ll = m.getLatLng();
              // _map es protected en tipos de Leaflet; usamos el cast a unknown para no leakear la API interna.
              const map = (m as unknown as { _map?: L.Map })._map;
              const currentZoom = map?.getZoom() ?? zoom;
              onPinChange(ll.lat, ll.lng, currentZoom);
            },
          }}
          ref={(r) => {
            markerRef.current = r;
          }}
        />
        <FlyTo center={markerPos} zoom={zoom} />
        <ZoomTracker
          onZoom={(z) => {
            // Persistimos zoom incluso si no se movió el pin.
            const ll = markerRef.current?.getLatLng();
            if (ll) onPinChange(ll.lat, ll.lng, z);
          }}
        />
        <RecenterButton target={markerPos} />
      </MapContainer>

      {/* Overlay de hint top-left */}
      <div className="pointer-events-none absolute left-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-[12px] font-medium text-foreground shadow-sm">
        <Move className="h-3.5 w-3.5 text-primary" />
        Arrastrá el pin para ajustar
      </div>
    </div>
  );
}

// Botón Centrar (esquina inf. derecha)
function RecenterButton({ target }: { target: [number, number] }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        map.setView(target, map.getZoom(), { animate: true });
      }}
      className="absolute bottom-3 right-3 z-[400] inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted"
      style={{ borderColor: "var(--border)" }}
    >
      <Crosshair className="h-3.5 w-3.5 text-primary" />
      Centrar
    </button>
  );
}

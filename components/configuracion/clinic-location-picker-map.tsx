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
  /** Posición inicial del mapa al montar (no es source-of-truth en runtime). */
  initialCenter: [number, number];
  /** Zoom inicial del mapa al montar. */
  initialZoom: number;
  /** Posición y zoom actuales del pin — controla SÓLO el pin, no la vista. */
  value: LocationValue | null;
  /** Centro al que volar cuando el padre lo dispare (search/sugerencia/centrar). */
  flyTo: { center: [number, number]; zoom: number; token: number } | null;
  /** Drag del pin o dblclick en el mapa. Cambia coords (+ reverseGeocode en el padre). */
  onPinChange: (lat: number, lng: number, zoom: number) => void;
  /** Zoom cambió pero el pin no se movió. Sólo persiste el zoom; no toca coords ni reverseGeocode. */
  onZoomChange: (zoom: number) => void;
}

// Recentra el mapa cuando cambia `flyTo.token` (no en cada cambio de coords).
// De esta forma, mover el pin o cambiar el zoom NO arrastra la vista — eso permite
// que el usuario explore otras zonas sin que el mapa "vuelva al pin" todo el tiempo.
function FlyToOnToken({ flyTo }: { flyTo: Props["flyTo"] }) {
  const map = useMap();
  const lastToken = useRef<number | null>(null);
  useEffect(() => {
    if (!flyTo) return;
    if (lastToken.current === flyTo.token) return;
    lastToken.current = flyTo.token;
    map.setView(flyTo.center, flyTo.zoom, { animate: true });
  }, [flyTo, map]);
  return null;
}

// Captura el zoom actual del mapa después de cualquier zoomend.
function ZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  useMapEvents({
    zoomend(e) {
      onZoomChange(e.target.getZoom());
    },
  });
  return null;
}

// Doble-click sobre el mapa → mueve el pin a esa posición (sin recentrar).
function DoubleClickPinPlacer({
  onPinChange,
}: {
  onPinChange: (lat: number, lng: number, zoom: number) => void;
}) {
  const map = useMap();
  useMapEvents({
    dblclick(e) {
      onPinChange(e.latlng.lat, e.latlng.lng, map.getZoom());
    },
  });
  return null;
}

export default function ClinicLocationPickerMap({
  initialCenter,
  initialZoom,
  value,
  flyTo,
  onPinChange,
  onZoomChange,
}: Props) {
  const markerRef = useRef<L.Marker | null>(null);

  // El marker se posiciona sobre el value (o el centro inicial si aún no hay pin).
  const markerPos: [number, number] = useMemo(
    () => (value ? [value.lat, value.lng] : initialCenter),
    [value, initialCenter]
  );

  return (
    <div className="relative">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ height: 360, width: "100%", borderRadius: 12 }}
        scrollWheelZoom
        // Desactivamos el zoom-in nativo al doble-click; lo usamos para colocar el pin.
        doubleClickZoom={false}
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
              // _map es protected en tipos de Leaflet; cast a unknown para no leakear la API interna.
              const map = (m as unknown as { _map?: L.Map })._map;
              const currentZoom = map?.getZoom() ?? initialZoom;
              onPinChange(ll.lat, ll.lng, currentZoom);
            },
          }}
          ref={(r) => {
            markerRef.current = r;
          }}
        />
        <FlyToOnToken flyTo={flyTo} />
        <ZoomTracker onZoomChange={onZoomChange} />
        <DoubleClickPinPlacer onPinChange={onPinChange} />
        <RecenterButton target={markerPos} />
      </MapContainer>

      {/* Overlay de hint top-left */}
      <div className="pointer-events-none absolute left-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-[12px] font-medium text-foreground shadow-sm">
        <Move className="h-3.5 w-3.5 text-primary" />
        Doble-click o arrastrá el pin para ajustar
      </div>
    </div>
  );
}

// Botón Centrar (esquina inf. derecha) — recentra el mapa sobre el pin actual.
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

interface Props {
  lat: number;
  lng: number;
  zoom: number | null;
}

// Embed de OpenStreetMap por iframe. δ controla el bbox alrededor del marcador;
// con zoom ~16 un δ de 0.003 ≈ 600m de lado, ideal para una dirección puntual.
function deltaForZoom(zoom: number): number {
  // Aproximación log: zoom 16 → 0.003, zoom 14 → 0.012, zoom 18 → 0.0008
  return 0.003 * Math.pow(2, 16 - zoom);
}

export function LandingMap({ lat, lng, zoom }: Props) {
  const z = zoom ?? 16;
  const δ = deltaForZoom(z);
  const bbox = `${lng - δ},${lat - δ},${lng + δ},${lat + δ}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const externalLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${z}/${lat}/${lng}`;

  return (
    <div
      className="overflow-hidden rounded-[18px] border shadow-[0_4px_14px_rgba(10,34,48,0.06)]"
      style={{ borderColor: "var(--border)", aspectRatio: "16 / 9" }}
    >
      <iframe
        title="Ubicación del consultorio"
        src={src}
        className="h-full w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <a
        href={externalLink}
        target="_blank"
        rel="noopener noreferrer"
        className="sr-only"
      >
        Ver mapa más grande en OpenStreetMap
      </a>
    </div>
  );
}

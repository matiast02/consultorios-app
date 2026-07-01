// Cliente de Nominatim (OpenStreetMap) para forward + reverse geocoding.
// Respeta la usage policy: máx 1 req/seg, User-Agent identificable, cache in-memory.
// https://operations.osmfoundation.org/policies/nominatim/

const ENDPOINT = "https://nominatim.openstreetmap.org";
const USER_AGENT = "ConsultorioApp/1.0 (admin contact form picker)";

export interface NominatimAddress {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
}

export interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  importance?: number;
  boundingbox?: [string, string, string, string];
  address?: NominatimAddress;
}

// ─── Throttle: garantiza al menos 1 req cada 1100 ms ────────────────────────
let lastRequestAt = 0;
async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  const minGap = 1100;
  if (elapsed < minGap) {
    await new Promise((r) => setTimeout(r, minGap - elapsed));
  }
  lastRequestAt = Date.now();
}

// ─── Cache LRU simple ───────────────────────────────────────────────────────
const searchCache = new Map<string, NominatimPlace[]>();
const reverseCache = new Map<string, NominatimPlace | null>();
const MAX_CACHE = 100;

function lruSet<K, V>(map: Map<K, V>, key: K, value: V) {
  if (map.size >= MAX_CACHE) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
}

// ─── Forward: "Av. Corrientes 1234" → place[] ───────────────────────────────
export async function searchAddress(
  query: string,
  opts: { signal?: AbortSignal; countryCodes?: string } = {}
): Promise<NominatimPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const cacheKey = `${q.toLowerCase()}|${opts.countryCodes ?? "ar"}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  await throttle();
  const url = new URL(`${ENDPOINT}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  if (opts.countryCodes) url.searchParams.set("countrycodes", opts.countryCodes);

  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "es", "User-Agent": USER_AGENT },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
  const data = (await res.json()) as NominatimPlace[];
  lruSet(searchCache, cacheKey, data);
  return data;
}

// ─── Reverse: (lat,lng) → place | null ──────────────────────────────────────
export async function reverseGeocode(
  lat: number,
  lng: number,
  opts: { signal?: AbortSignal } = {}
): Promise<NominatimPlace | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  await throttle();
  const url = new URL(`${ENDPOINT}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "es", "User-Agent": USER_AGENT },
      signal: opts.signal,
    });
    if (!res.ok) {
      lruSet(reverseCache, key, null);
      return null;
    }
    const data = (await res.json()) as NominatimPlace | { error?: string };
    if ("error" in data) {
      lruSet(reverseCache, key, null);
      return null;
    }
    lruSet(reverseCache, key, data as NominatimPlace);
    return data as NominatimPlace;
  } catch {
    return null;
  }
}

// ─── Helpers de formato ─────────────────────────────────────────────────────
export function shortDisplayName(place: NominatimPlace): string {
  const a = place.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const cityish = a.city || a.town || a.village || a.suburb || a.neighbourhood;
  return [street, cityish].filter(Boolean).join(", ") || place.display_name;
}

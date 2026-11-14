import { fetchPublicText, FetchError, type FetchOptions } from "./safe-fetch";

// Address search for points of interest (Release 0.8) through the public Nominatim instance of the
// OpenStreetMap Foundation, always from the server (docs/karte.md). Usage policy, in short:
// at most 1 request per second for the whole server, an identifying User-Agent, results cached on our side,
// no autocomplete (search on submit only), attribution next to the results.

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
/** Generic, no personal data, no contact address. */
export const GEOCODE_USER_AGENT = "Plan4JU";
export const GEOCODE_LIMITS = {
  minLength: 3,
  maxLength: 120,
  results: 5,
  intervalMs: 1000, // server-wide spacing of requests
  maxWaitMs: 4000, // longer queue: "busy" instead of waiting
  cacheSize: 500,
  cacheTtlMs: 24 * 60 * 60 * 1000,
} as const;

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export class GeocodeBusyError extends Error {
  constructor() {
    super("Geocoder busy");
    this.name = "GeocodeBusyError";
  }
}

interface State {
  cache: Map<string, { at: number; results: GeocodeResult[] }>;
  /** Earliest time the next request may leave (ms since epoch). */
  nextSlot: number;
}

// One state per server process, also across hot reloads in development.
const KEY = Symbol.for("plan4ju.geocode");
function state(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>;
  return (g[KEY] ??= { cache: new Map(), nextSlot: 0 });
}

/** For tests: forget cache and throttle. */
export function resetGeocode(): void {
  const s = state();
  s.cache.clear();
  s.nextSlot = 0;
}

/** Normalised search text: trimmed, single spaces; null when too short or too long. */
export function normaliseQuery(raw: string): string | null {
  const q = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (q.length < GEOCODE_LIMITS.minLength || q.length > GEOCODE_LIMITS.maxLength) return null;
  return q;
}

/** Reads Nominatim's jsonv2 answer defensively: only finite coordinates in range, label trimmed. */
export function parseNominatim(body: string): GeocodeResult[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new FetchError("inhalt");
  }
  if (!Array.isArray(data)) throw new FetchError("inhalt");
  const out: GeocodeResult[] = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const lat = Number(o.lat);
    const lng = Number(o.lon);
    const label = typeof o.display_name === "string" ? o.display_name.slice(0, 300) : "";
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ label, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 });
    if (out.length >= GEOCODE_LIMITS.results) break;
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Searches an address. Cached answers (also empty ones) come back without a request. Requests are spaced at
 * least intervalMs apart for the whole process; a longer queue than maxWaitMs gives GeocodeBusyError.
 * Throws FetchError for network or answer problems. The search text is never logged.
 */
export async function searchAddress(
  raw: string,
  opts: Pick<FetchOptions, "resolve" | "transport"> & { now?: () => number } = {},
): Promise<GeocodeResult[]> {
  const q = normaliseQuery(raw);
  if (!q) return [];
  const now = opts.now ?? Date.now;
  const s = state();
  const key = q.toLocaleLowerCase("de");
  const hit = s.cache.get(key);
  if (hit && now() - hit.at < GEOCODE_LIMITS.cacheTtlMs) return hit.results;

  const t = now();
  const slot = Math.max(t, s.nextSlot);
  if (slot - t > GEOCODE_LIMITS.maxWaitMs) throw new GeocodeBusyError();
  s.nextSlot = slot + GEOCODE_LIMITS.intervalMs;
  if (slot > t) await sleep(slot - t);

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(GEOCODE_LIMITS.results));
  url.searchParams.set("accept-language", "de");
  url.searchParams.set("q", q);
  const body = await fetchPublicText(url.href, {
    resolve: opts.resolve,
    transport: opts.transport,
    accept: "application/json",
    userAgent: GEOCODE_USER_AGENT,
    timeoutMs: 8000,
    maxBytes: 512 * 1024,
  });
  const results = parseNominatim(body);
  if (s.cache.size >= GEOCODE_LIMITS.cacheSize) {
    const oldest = s.cache.keys().next().value;
    if (oldest !== undefined) s.cache.delete(oldest);
  }
  s.cache.set(key, { at: now(), results });
  return results;
}

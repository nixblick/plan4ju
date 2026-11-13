// Map module helpers shared by server and client (docs/karte.md).
// Icons are a fixed, built-in set of SVG path data. Users only ever choose a key; no markup from input is rendered.

export const MAP_ICONS = {
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  baum: "M12 2l6 9h-3l4 6H5l4-6H6zM12 17v5",
  zelt: "M3 20L12 4l9 16zM12 4v16M9 20l3-5 3 5",
  besteck: "M5 3v7a2 2 0 0 0 2 2v9M7 3v9M9 3v7a2 2 0 0 1-2 2M17 21V3c-2 1-3 4-3 8h3",
  tasse: "M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3",
  rutsche: "M5 21V5M5 5h4l9 12M18 17v4M5 13h6",
  ticket: "M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 0 0-4V4H3zM10 4v12",
  fahne: "M5 21V4M5 4h11l-2 4 2 4H5",
  etikett: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  stern: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z",
  herz: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z",
  welle: "M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  berg: "M2 20l7-12 4 6 3-4 6 10z",
  rad: "M5.5 17.5a3.5 3.5 0 1 0 0-.01M18.5 17.5a3.5 3.5 0 1 0 0-.01M5.5 17.5L9 9h6l3.5 8.5M12 17.5L9 9M14 5h2l-1 4",
  laden: "M4 9l2-5h12l2 5M4 9h16v11H4zM9 20v-6h6v6",
} as const;
export type MapIcon = keyof typeof MAP_ICONS;
export const MAP_ICON_KEYS = Object.keys(MAP_ICONS) as [MapIcon, ...MapIcon[]];

export const MAP_ICON_LABELS: Record<MapIcon, string> = {
  pin: "Stecknadel", baum: "Baum", zelt: "Zelt", besteck: "Besteck", tasse: "Tasse", rutsche: "Rutsche",
  ticket: "Ticket", fahne: "Fahne", etikett: "Etikett", stern: "Stern", herz: "Herz", welle: "Wasser",
  berg: "Berg", rad: "Fahrrad", laden: "Laden",
};

/** Starter categories (masterprompt section 15), created per family on first use. */
export const DEFAULT_CATEGORIES: { name: string; icon: MapIcon; color: string }[] = [
  { name: "Ausflugsziel", icon: "baum", color: "#15803d" },
  { name: "Campingplatz", icon: "zelt", color: "#4d7c0f" },
  { name: "Restaurant", icon: "besteck", color: "#b45309" },
  { name: "Café", icon: "tasse", color: "#92400e" },
  { name: "Spielplatz", icon: "rutsche", color: "#0369a1" },
  { name: "Veranstaltung", icon: "ticket", color: "#7c3aed" },
  { name: "Fest", icon: "fahne", color: "#be123c" },
  { name: "Flohmarkt", icon: "etikett", color: "#c2410c" },
];

export const MAP_LIMITS = { name: 120, text: 2000, note: 1000, address: 300, url: 2000, categoryName: 60 } as const;

export const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** Default tile server: OpenStreetMap standard tiles (tile usage policy applies, see docs/karte.md). */
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende';

/**
 * Origin of a tile URL template for the CSP img-src, or null if the template is unusable.
 * A "{s}" subdomain placeholder becomes a "*." wildcard.
 */
export function tileOrigin(template: string): string | null {
  const t = template.trim();
  const m = /^https:\/\/([a-z0-9.{}-]+)(?::(\d{1,5}))?\//i.exec(t);
  if (!m) return null;
  let host = m[1]!.toLowerCase();
  if (host.startsWith("{s}.")) host = `*.${host.slice(4)}`;
  if (/[{}]/.test(host)) return null;
  return `https://${host}${m[2] ? `:${m[2]}` : ""}`;
}

/** Parses a coordinate from user input ("50,11" or "50.11"); NaN if invalid or out of range. */
export function parseCoord(raw: string, kind: "lat" | "lng"): number {
  const v = raw.trim().replace(",", ".");
  if (!/^-?\d{1,3}(\.\d{1,8})?$/.test(v)) return NaN;
  const n = Number(v);
  const max = kind === "lat" ? 90 : 180;
  return Math.abs(n) <= max ? n : NaN;
}

/** A temporary point is expired once its last day lies before today (both local days, YYYY-MM-DD). */
export function isExpired(endDate: string | null, today: string): boolean {
  return endDate !== null && endDate < today;
}

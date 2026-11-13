// Pure helpers for the shopping list: matching and merging entries. No I/O.

export const SHOPPING_LIMITS = { name: 200, unit: 30, note: 500, shops: 20, shopName: 40, items: 1000, sources: 20 } as const;

/** Default shops of a family, created on first use (§13 "Geschäftskategorien"). */
export const DEFAULT_SHOPS = ["Supermarkt", "Drogerie", "Baumarkt", "IKEA"] as const;

/** Name key for matching: case, surrounding and repeated spaces do not matter. */
export function nameKey(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("de");
}

const UNIT_ALIASES: Record<string, string> = {
  gramm: "g", kilogramm: "kg", milliliter: "ml", liter: "l", "stk.": "stk", stück: "stk", esslöffel: "el", teelöffel: "tl",
  "pck.": "pck", päckchen: "pck", dosen: "dose", zehen: "zehe", scheiben: "scheibe", tassen: "tasse", prisen: "prise",
};

/** Unit key for matching ("Gramm" = "g", "Stück" = "Stk."); null and "" mean no unit. */
export function unitKey(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLocaleLowerCase("de");
  return UNIT_ALIASES[u] ?? u;
}

// Convertible pairs: value in the base unit.
const FACTORS: Record<string, { base: string; factor: number }> = {
  g: { base: "g", factor: 1 }, kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 }, l: { base: "ml", factor: 1000 }, cl: { base: "ml", factor: 10 }, dl: { base: "ml", factor: 100 },
};

export interface Amount {
  quantity: number | null;
  unit: string | null;
}

const round = (q: number) => Math.round(q * 1000) / 1000;

/**
 * Adds `add` to `into` if both describe the same thing in compatible units and returns the new
 * amount in the unit of `into`; null when they cannot be merged (e.g. "1 Bund" and "100 g").
 * A missing quantity on one side keeps the other one ("Salz" + "1 TL Salz" = "1 TL Salz").
 */
export function mergeAmounts(into: Amount, add: Amount): Amount | null {
  const a = unitKey(into.unit);
  const b = unitKey(add.unit);
  if (into.quantity == null && !a) return { quantity: add.quantity, unit: add.unit };
  if (add.quantity == null && !b) return { quantity: into.quantity, unit: into.unit };
  if (a === b) {
    if (into.quantity == null || add.quantity == null) return { quantity: into.quantity ?? add.quantity, unit: into.unit ?? add.unit };
    return { quantity: round(into.quantity + add.quantity), unit: into.unit };
  }
  const fa = FACTORS[a];
  const fb = FACTORS[b];
  if (!fa || !fb || fa.base !== fb.base || into.quantity == null || add.quantity == null) return null;
  return { quantity: round(into.quantity + (add.quantity * fb.factor) / fa.factor), unit: into.unit };
}

/** Adds a source title once, keeping the order and the limit. */
export function addSource(sources: string[], title: string | null): string[] {
  if (!title || sources.includes(title)) return sources;
  return [...sources, title].slice(0, SHOPPING_LIMITS.sources);
}

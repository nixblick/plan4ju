// Pure helpers for recipes: ingredient lines, portion scaling, durations. No I/O.

export const RECIPE_LIMITS = {
  title: 200,
  description: 5000,
  ingredients: 100,
  ingredientName: 200,
  unit: 30,
  steps: 60,
  step: 2000,
  tags: 20,
  tag: 40,
  allergens: 500,
  url: 2000,
} as const;

export interface IngredientLine {
  quantity: number | null;
  unit: string | null;
  name: string;
}

const FRACTIONS: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅛": 0.125 };

// Units as written in German (and common English) recipes; matched case-insensitively, stored as listed here.
const UNITS = [
  "g", "kg", "mg", "ml", "cl", "dl", "l", "EL", "TL", "Prise", "Prisen", "Msp.", "Msp", "Stk.", "Stk", "Stück", "Bund", "Pck.", "Pck",
  "Päckchen", "Dose", "Dosen", "Becher", "Tasse", "Tassen", "Zehe", "Zehen", "Scheibe", "Scheiben", "Handvoll", "Glas", "Gläser",
  "Liter", "Gramm", "Kilogramm", "Milliliter", "Esslöffel", "Teelöffel", "tbsp", "tsp", "cup", "cups", "oz", "lb",
];
const UNIT_BY_LOWER = new Map(UNITS.map((u) => [u.toLowerCase(), u]));

/** Reads a single number token: "2", "1,5", "1.5", "1/2", "½", "1½", "1 1/2" is handled by the caller. */
function readNumber(tok: string): number | null {
  const t = tok.trim();
  if (t in FRACTIONS) return FRACTIONS[t]!;
  const mixed = /^(\d+)([½⅓⅔¼¾⅕⅛])$/.exec(t);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]!]!;
  const frac = /^(\d{1,4})\/(\d{1,4})$/.exec(t);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  if (/^\d{1,6}(?:[.,]\d{1,3})?$/.test(t)) return Number(t.replace(",", "."));
  return null;
}

/**
 * Splits a free ingredient line ("200 g Mehl", "1/2 TL Salz", "2-3 Äpfel", "Salz") into
 * quantity, unit and name. A range takes its upper value. Anything not understood stays in the name.
 */
export function parseIngredientLine(raw: string): IngredientLine {
  const line = raw.replace(/\s+/g, " ").trim().slice(0, 300);
  const words = line.split(" ");
  let i = 0;
  let quantity: number | null = null;
  const first = words[0] ?? "";
  const range = /^(\d+(?:[.,]\d+)?)\s?[-–]\s?(\d+(?:[.,]\d+)?)$/.exec(first);
  if (range) {
    quantity = Number(range[2]!.replace(",", "."));
    i = 1;
  } else {
    // "1 1/2", "1 ½"
    const a = readNumber(first);
    if (a !== null) {
      quantity = a;
      i = 1;
      const b = words[1] !== undefined ? readNumber(words[1]) : null;
      if (b !== null && b < 1 && Number.isInteger(a)) {
        quantity = a + b;
        i = 2;
      } else if (words[1] === "-" || words[1] === "–") {
        const c = words[2] !== undefined ? readNumber(words[2]) : null;
        if (c !== null) {
          quantity = c;
          i = 3;
        }
      }
    } else {
      // number glued to the unit: "200g", "1,5l"
      const glued = /^(\d+(?:[.,]\d+)?)([A-Za-zÄÖÜäöü.]+)$/.exec(first);
      if (glued && UNIT_BY_LOWER.has(glued[2]!.toLowerCase())) {
        const name = words.slice(1).join(" ").trim();
        if (name) return { quantity: Number(glued[1]!.replace(",", ".")), unit: UNIT_BY_LOWER.get(glued[2]!.toLowerCase())!, name };
      }
    }
  }
  let unit: string | null = null;
  if (quantity !== null && words[i] !== undefined && UNIT_BY_LOWER.has(words[i]!.toLowerCase()) && words.length > i + 1) {
    unit = UNIT_BY_LOWER.get(words[i]!.toLowerCase())!;
    i += 1;
  }
  const name = words.slice(i).join(" ").trim();
  if (!name) return { quantity: null, unit: null, name: line };
  return { quantity, unit, name };
}

/** Scales a quantity from `from` to `to` servings. Missing quantity or servings stay as they are. */
export function scaleQuantity(quantity: number | null, from: number | null, to: number | null): number | null {
  if (quantity === null) return null;
  if (!from || !to || from <= 0 || to <= 0) return quantity;
  return quantity * (to / from);
}

/** German display of a quantity: at most two decimals, common fractions as ½ ¼ ¾ ⅓ ⅔. */
export function formatQuantity(q: number | null): string {
  if (q === null || !Number.isFinite(q)) return "";
  const whole = Math.floor(q);
  const rest = q - whole;
  const nice: [number, string][] = [[0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"]];
  if (q < 20 && rest > 0.01) {
    for (const [v, s] of nice) if (Math.abs(rest - v) < 0.01) return whole ? `${whole}${s}` : s;
  }
  if (Math.abs(rest) < 0.005 || Math.abs(rest - 1) < 0.005) return String(Math.round(q));
  const digits = q >= 100 ? 0 : q >= 10 ? 1 : 2;
  return String(Number(q.toFixed(digits))).replace(".", ",");
}

/** ISO 8601 duration ("PT1H30M", "P0DT45M") to minutes. null if not understood or not positive. */
export function isoDurationMinutes(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^P(?:(\d{1,3})D)?(?:T(?:(\d{1,4})H)?(?:(\d{1,5})M)?(?:(\d{1,6})S)?)?$/i.exec(raw.trim());
  if (!m) return null;
  const mins = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60);
  return mins > 0 && mins <= 100_000 ? mins : null;
}

/** First integer in a yield like "4 Portionen", 4, ["4", "4 servings"]. */
export function parseServings(raw: unknown): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === "number") return Number.isInteger(v) && v > 0 && v <= 1000 ? v : null;
  if (typeof v !== "string") return null;
  const m = /(\d{1,4})/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 1000 ? n : null;
}

/** Only https links are kept (no javascript:, data:, http:). */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > RECIPE_LIMITS.url) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

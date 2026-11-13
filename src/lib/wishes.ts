import { nextBirthday, parseIso, toIso } from "./week";

export const WISH_LIMITS = { lists: 100, wishes: 200, title: 200, listTitle: 100, text: 1000, note: 500, url: 2000, maxCents: 10_000_000 } as const;

export const OCCASIONS = ["ANY", "BIRTHDAY", "CHRISTMAS", "EASTER", "OTHER"] as const;
export type Occasion = (typeof OCCASIONS)[number];
export const occasionLabels: Record<Occasion, string> = {
  ANY: "Ohne Anlass",
  BIRTHDAY: "Geburtstag",
  CHRISTMAS: "Weihnachten",
  EASTER: "Ostern",
  OTHER: "Sonstiges",
};

export const wishPriorityLabels: Record<number, string> = { 1: "Herzenswunsch", 2: "Würde mich freuen", 3: "Kleinigkeit" };

/** Accepts only absolute https links without user info; everything else is null. */
export function httpsUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "12,99", "12.99", "12 €", "1.299,00" → cents; empty → null; nonsense → NaN. */
export function parsePrice(raw: string | null | undefined): number | null {
  let v = (raw ?? "").replace(/€|eur/gi, "").replace(/\s/g, "");
  if (!v) return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return Number.NaN;
  return Math.round(Number(v) * 100);
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return "";
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Easter Sunday (Gregorian, anonymous algorithm) as ISO date. */
export function easterSunday(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso({ y, m: month, d: day });
}

/** Next date of an occasion on or after today; null when the occasion has no date (or no birthday is linked). */
export function nextOccasion(occasion: Occasion, todayIso: string, birthday?: { month: number; day: number } | null): string | null {
  const y = parseIso(todayIso).y;
  switch (occasion) {
    case "BIRTHDAY":
      return birthday ? nextBirthday(birthday.month, birthday.day, todayIso) : null;
    case "CHRISTMAS": {
      const d = toIso({ y, m: 12, d: 24 });
      return d >= todayIso ? d : toIso({ y: y + 1, m: 12, d: 24 });
    }
    case "EASTER": {
      const d = easterSunday(y);
      return d >= todayIso ? d : easterSunday(y + 1);
    }
    default:
      return null;
  }
}

/** The nearest dated occasion of a list: its linked birthday, Christmas or Easter of its wishes. */
export function nextListOccasion(
  occasions: Occasion[],
  todayIso: string,
  birthday?: { month: number; day: number } | null,
): { occasion: Occasion; date: string } | null {
  const set = new Set<Occasion>(occasions);
  if (birthday) set.add("BIRTHDAY");
  let best: { occasion: Occasion; date: string } | null = null;
  for (const o of set) {
    const date = nextOccasion(o, todayIso, birthday);
    if (date && (!best || date < best.date)) best = { occasion: o, date };
  }
  return best;
}

export const inDaysText = (n: number) => (n === 0 ? "heute" : n === 1 ? "morgen" : `in ${n} Tagen`);

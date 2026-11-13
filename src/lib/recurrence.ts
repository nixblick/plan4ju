// Recurrence rules for routines. Pure date arithmetic on local calendar days ("YYYY-MM-DD"):
// a routine happens on a family-local day, so no time zone (and no DST shift) can move an occurrence.
// The time zone only enters when "today" is computed (todayIn in week.ts).

import { addDays, daysBetween, parseIso, toIso, weekdayIndex } from "./week";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY";

export interface RecurrenceRule {
  freq: Freq;
  /** Every n-th day / week / month, 1..52. */
  interval: number;
  /** WEEKLY: weekdays 0 = Monday .. 6 = Sunday. Empty = weekday of the start date. */
  weekdays: number[];
  /** MONTHLY: day of month 1..31. null = day of the start date. Short months use their last day. */
  monthDay: number | null;
  startDate: string;
  endDate: string | null;
}

/** Longest range a single call may expand, a guard against runaway loops. */
export const MAX_SPAN_DAYS = 800;

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** All occurrence days of the rule within [from, to] (inclusive), ascending, never before start or after end. */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const lo = from > rule.startDate ? from : rule.startDate;
  const hi = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (lo > hi) return [];
  if (daysBetween(lo, hi) > MAX_SPAN_DAYS) throw new RangeError("Range too long");
  const interval = Math.max(1, Math.floor(rule.interval));
  const out: string[] = [];

  if (rule.freq === "DAILY") {
    const gap = daysBetween(rule.startDate, lo);
    let d = addDays(lo, (interval - (gap % interval)) % interval);
    for (; d <= hi; d = addDays(d, interval)) out.push(d);
    return out;
  }

  if (rule.freq === "WEEKLY") {
    const days = rule.weekdays.length ? [...new Set(rule.weekdays)] : [weekdayIndex(rule.startDate)];
    const startMonday = addDays(rule.startDate, -weekdayIndex(rule.startDate));
    for (let d = lo; d <= hi; d = addDays(d, 1)) {
      if (!days.includes(weekdayIndex(d))) continue;
      const weeks = Math.floor(daysBetween(startMonday, addDays(d, -weekdayIndex(d))) / 7);
      if (weeks % interval === 0) out.push(d);
    }
    return out;
  }

  // MONTHLY
  const start = parseIso(rule.startDate);
  const wanted = rule.monthDay ?? start.d;
  const first = parseIso(lo);
  const last = parseIso(hi);
  for (let y = first.y, m = first.m; y < last.y || (y === last.y && m <= last.m); m === 12 ? (y++, (m = 1)) : m++) {
    const months = (y - start.y) * 12 + (m - start.m);
    if (months < 0 || months % interval !== 0) continue;
    const iso = toIso({ y, m, d: Math.min(wanted, daysInMonth(y, m)) });
    if (iso >= lo && iso <= hi) out.push(iso);
  }
  return out;
}

const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** German one-line description of a rule, e.g. "Mo, Di, Fr jede Woche". */
export function describeRule(rule: RecurrenceRule): string {
  const n = Math.max(1, rule.interval);
  if (rule.freq === "DAILY") return n === 1 ? "täglich" : `alle ${n} Tage`;
  if (rule.freq === "WEEKLY") {
    const days = rule.weekdays.length ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [weekdayIndex(rule.startDate)];
    const label = days.length === 7 ? "täglich" : days.join() === "0,1,2,3,4" ? "Mo–Fr" : days.map((d) => WD[d]).join(", ");
    return n === 1 ? `${label} (jede Woche)` : `${label} (alle ${n} Wochen)`;
  }
  const day = rule.monthDay ?? parseIso(rule.startDate).d;
  return n === 1 ? `monatlich am ${day}.` : `alle ${n} Monate am ${day}.`;
}

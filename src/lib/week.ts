// Calendar-date helpers without time zones: a day is an ISO string "YYYY-MM-DD".
// The "today" of a family is computed once in its time zone (todayIn), everything else is date arithmetic.

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = ({ y, m, d }: Ymd): string => `${y}-${pad(m)}-${pad(d)}`;

export function parseIso(iso: string): Ymd {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** The calendar date of `now` in the given IANA time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseIso(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIsoStr: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIsoStr);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(iso: string): number {
  const { y, m, d } = parseIso(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The seven days Monday to Sunday of the week containing `iso`. */
export function weekOf(iso: string): string[] {
  const monday = addDays(iso, -weekdayIndex(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Date of the birthday in year `y`; 29 February falls on 28 February in non-leap years. */
export function birthdayIn(y: number, month: number, day: number): string {
  const d = month === 2 && day === 29 && !isLeap(y) ? 28 : day;
  return toIso({ y, m: month, d });
}

/** Next occurrence of a birthday on or after `todayIso`. */
export function nextBirthday(month: number, day: number, todayIso: string): string {
  const y = parseIso(todayIso).y;
  const this_ = birthdayIn(y, month, day);
  return this_ >= todayIso ? this_ : birthdayIn(y + 1, month, day);
}

// Pure logic for "Als Nächstes" and "Heute zu Hause": turns today's calendar items and routine
// occurrences into timed entries, finds the next ones and builds the 6-22 h time strip per person.
// All times are local wall clock minutes of the family's time zone.

import type { CalendarItem } from "./calendar-items";
import { localParts } from "./tz";

export const STRIP_FROM = 6; // hours
export const STRIP_TO = 22;
/** A routine has no end time: it is drawn as a short bar. */
export const ROUTINE_MINUTES = 30;
/** A timed event without an end time. */
export const DEFAULT_EVENT_MINUTES = 60;

export interface AgendaOccurrence {
  id: string;
  title: string;
  date: string;
  time: string | null;
  status: "OPEN" | "DONE" | "SKIPPED";
  assigneeIds: string[];
}

export interface AgendaEntry {
  key: string;
  kind: "event" | "routine";
  title: string;
  /** Minutes since local midnight. */
  start: number;
  end: number;
  startTime: string;
  endTime: string | null;
  location: string | null;
  personIds: string[];
  /** Routine already ticked off. */
  done: boolean;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Timed entries of `today` (events that start earlier or are all-day are not part of the agenda). */
export function agendaOf(today: string, events: CalendarItem[], occurrences: AgendaOccurrence[]): AgendaEntry[] {
  const out: AgendaEntry[] = [];
  for (const e of events) {
    if (e.allDay || !e.startTime || e.startDate > today || e.endDate < today) continue;
    // multi-day events: the strip shows the part that falls on today
    const start = e.startDate < today ? 0 : minutes(e.startTime);
    let end = e.endDate > today ? 24 * 60 : e.endTime ? minutes(e.endTime) : start + DEFAULT_EVENT_MINUTES;
    if (end <= start) end = start + DEFAULT_EVENT_MINUTES;
    out.push({
      key: e.key, kind: "event", title: e.title, start, end: Math.min(end, 24 * 60),
      startTime: hhmm(start), endTime: e.endDate > today || !e.endTime ? null : e.endTime,
      location: e.location, personIds: e.participantIds, done: false,
    });
  }
  for (const o of occurrences) {
    if (o.date !== today || !o.time || o.status === "SKIPPED") continue;
    const start = minutes(o.time);
    out.push({
      key: `routine:${o.id}`, kind: "routine", title: o.title, start, end: Math.min(start + ROUTINE_MINUTES, 24 * 60),
      startTime: o.time, endTime: null, location: null, personIds: o.assigneeIds, done: o.status === "DONE",
    });
  }
  return out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, "de") || a.key.localeCompare(b.key));
}

/** Local minutes since midnight of `now` in the zone. */
export function nowMinutes(now: Date, tz: string): number {
  return minutes(localParts(now, tz).time);
}

export interface NextUp {
  next: AgendaEntry | null;
  /** Minutes until `next` starts (0 = running right now is not counted here, see `running`). */
  inMinutes: number | null;
  after: AgendaEntry[];
}

/** The next open entry that starts at or after now, and up to `limit` that follow it. */
export function nextUp(agenda: AgendaEntry[], nowMin: number, limit = 3): NextUp {
  const upcoming = agenda.filter((a) => !a.done && a.start >= nowMin);
  const next = upcoming[0] ?? null;
  return { next, inMinutes: next ? next.start - nowMin : null, after: upcoming.slice(1, 1 + limit) };
}

/** "in 33 Minuten", "in 1 Stunde 5 Minuten", "jetzt". */
export function inLabel(min: number): string {
  if (min <= 0) return "jetzt";
  if (min === 1) return "in 1 Minute";
  if (min < 60) return `in ${min} Minuten`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = h === 1 ? "1 Stunde" : `${h} Stunden`;
  return m === 0 ? `in ${hours}` : `in ${hours} ${m} Min.`;
}

export interface Bar {
  key: string;
  title: string;
  kind: "event" | "routine";
  done: boolean;
  startTime: string;
  /** Percent of the strip width, clamped to 6-22 h. */
  left: number;
  width: number;
}
export interface StripRow {
  /** Profile id; null = entries nobody is assigned to. */
  profileId: string | null;
  bars: Bar[];
}

const SPAN = (STRIP_TO - STRIP_FROM) * 60;

/** Position of a bar on the 6-22 h strip; null when it lies entirely outside. */
export function barPosition(start: number, end: number): { left: number; width: number } | null {
  const from = Math.max(start, STRIP_FROM * 60);
  const to = Math.min(end, STRIP_TO * 60);
  if (to <= from) return null;
  return { left: ((from - STRIP_FROM * 60) / SPAN) * 100, width: ((to - from) / SPAN) * 100 };
}

/** Position of the "now" line in percent, null outside 6-22 h. */
export function nowLine(nowMin: number): number | null {
  return nowMin < STRIP_FROM * 60 || nowMin > STRIP_TO * 60 ? null : ((nowMin - STRIP_FROM * 60) / SPAN) * 100;
}

/**
 * One row per profile (in the order given) with the entries of that person; an entry with several
 * persons appears in each row. Entries nobody is assigned to go into one extra row (profileId null),
 * which exists only when there are such entries.
 */
export function buildStrip(agenda: AgendaEntry[], profileIds: string[]): StripRow[] {
  const toBar = (a: AgendaEntry): Bar | null => {
    const pos = barPosition(a.start, a.end);
    return pos ? { key: a.key, title: a.title, kind: a.kind, done: a.done, startTime: a.startTime, ...pos } : null;
  };
  const rows: StripRow[] = profileIds.map((id) => ({
    profileId: id,
    bars: agenda.filter((a) => a.personIds.includes(id)).map(toBar).filter((b): b is Bar => b !== null),
  }));
  const known = new Set(profileIds);
  const shared = agenda.filter((a) => !a.personIds.some((p) => known.has(p))).map(toBar).filter((b): b is Bar => b !== null);
  if (shared.length) rows.push({ profileId: null, bars: shared });
  return rows;
}

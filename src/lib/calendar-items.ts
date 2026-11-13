// Pure calendar logic: turns stored events into display items on local calendar days of the family.
// Internal events repeat like routines (local days); the wall clock time of a repeated timed event
// stays the same across daylight saving changes.

import { occurrencesBetween, type Freq } from "./recurrence";
import { addDays, daysBetween } from "./week";
import { localParts } from "./tz";

export interface CalendarItem {
  /** Unique per displayed instance. */
  key: string;
  source: "event" | "external";
  /** Internal event id, or external event id. */
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  /** Local calendar days, last day inclusive. */
  startDate: string;
  endDate: string;
  /** Local "HH:MM"; null for all-day events (endTime also when it would be midnight). */
  startTime: string | null;
  endTime: string | null;
  participantIds: string[];
  repeats: boolean;
  calendarId: string | null;
  calendarName: string | null;
  colorIndex: number | null;
}

export interface RawEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  freq: Freq | null;
  interval: number;
  weekdays: number[];
  monthDay: number | null;
  repeatUntil: string | null;
  participantIds: string[];
}

export interface Span {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
}

/** The local days and times of one event (first instance) in the family zone. */
export function spanOf(e: Pick<RawEvent, "allDay" | "startsAt" | "endsAt" | "startDate" | "endDate">, tz: string): Span {
  if (e.allDay) return { startDate: e.startDate!, endDate: e.endDate ?? e.startDate!, startTime: null, endTime: null };
  const s = localParts(e.startsAt!, tz);
  const endsAt = e.endsAt!;
  // An event that ends exactly at midnight does not touch the next day.
  const last = localParts(endsAt > e.startsAt! ? new Date(endsAt.getTime() - 1) : endsAt, tz);
  const end = localParts(endsAt, tz);
  return { startDate: s.date, endDate: last.date, startTime: s.time, endTime: end.date === last.date ? end.time : null };
}

function item(base: Omit<CalendarItem, "key" | "startDate" | "endDate" | "startTime" | "endTime">, span: Span, key: string): CalendarItem {
  return { ...base, ...span, key };
}

/** All instances of an internal event that touch [from, to]. */
export function expandEvent(e: RawEvent, tz: string, from: string, to: string): CalendarItem[] {
  const span = spanOf(e, tz);
  const base = {
    source: "event" as const,
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    allDay: e.allDay,
    participantIds: e.participantIds,
    repeats: e.freq !== null,
    calendarId: null,
    calendarName: null,
    colorIndex: null,
  };
  if (!e.freq) {
    return span.endDate >= from && span.startDate <= to ? [item(base, span, e.id)] : [];
  }
  const length = daysBetween(span.startDate, span.endDate);
  const lo = addDays(from, -length);
  const rule = { freq: e.freq, interval: e.interval, weekdays: e.weekdays, monthDay: e.monthDay, startDate: span.startDate, endDate: e.repeatUntil };
  const cappedTo = daysBetween(lo, to) > 790 ? addDays(lo, 790) : to;
  return occurrencesBetween(rule, lo, cappedTo)
    .map((d) => item(base, { ...span, startDate: d, endDate: addDays(d, length) }, `${e.id}:${d}`))
    .filter((i) => i.endDate >= from && i.startDate <= to);
}

export interface RawExternal {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  calendarId: string;
  calendarName: string;
  colorIndex: number;
}

export function externalItem(e: RawExternal, tz: string): CalendarItem {
  return item(
    {
      source: "external",
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      allDay: e.allDay,
      participantIds: [],
      repeats: false,
      calendarId: e.calendarId,
      calendarName: e.calendarName,
      colorIndex: e.colorIndex,
    },
    spanOf(e, tz),
    e.id,
  );
}

export const touches = (i: Pick<CalendarItem, "startDate" | "endDate">, day: string) => i.startDate <= day && day <= i.endDate;

/** Stable order: all-day first, then by start time, then title. */
export function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      Number(b.allDay) - Number(a.allDay) ||
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.title.localeCompare(b.title, "de") ||
      a.key.localeCompare(b.key),
  );
}

/** Items shown on one day (multi-day items on every day they touch): all-day and continuing ones first, then by time. */
export function itemsOnDay(items: CalendarItem[], day: string): CalendarItem[] {
  const rank = (i: CalendarItem) => (i.allDay || i.startDate < day ? 0 : 1);
  return items
    .filter((i) => touches(i, day))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.title.localeCompare(b.title, "de") ||
        a.key.localeCompare(b.key),
    );
}

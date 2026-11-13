import ICAL from "ical.js";
import { addDays } from "../lib/week";
import { isValidTimeZone, localParts, zonedToUtc } from "../lib/tz";

// iCalendar (RFC 5545) to plain events. ical.js does the parsing, RRULE / EXDATE / RECURRENCE-ID handling.
// Recurring events are expanded into a bounded window (see ImportWindow); the result is a list of single
// instances with a stable key (uid + start), which is what the database keeps.

export interface ParsedEvent {
  uid: string;
  /** Start of the instance, e.g. "2026-11-16T09:00:00Z" or "2026-11-16": part of the unique key with the uid. */
  instanceKey: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  /** Timed events: UTC instants. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** All-day events: first and last day (inclusive; DTEND in the file is exclusive). */
  startDate: string | null;
  endDate: string | null;
}

export interface ParseResult {
  events: ParsedEvent[];
  /** True when the cap was hit and further instances were dropped. */
  truncated: boolean;
  calendarName: string | null;
}

/**
 * Limits for one parseIcs call (a file or feed is untrusted input):
 *  - maxEvents: stored instances; reaching it stops ALL expansion
 *  - maxSteps: rule steps shared by ALL recurring events of the file (a series that began years ago
 *    needs many steps before it reaches the window, so this is a budget, not a per-event allowance)
 *  - maxVevents: VEVENT components read from the file; the rest is ignored
 *  - maxMs: wall clock deadline for the expansion
 * Rules with FREQ=SECONDLY, MINUTELY or HOURLY are not expanded (only their first instance is kept).
 */
export const ICS_LIMITS = { maxEvents: 5000, maxSteps: 100_000, maxVevents: 10_000, maxMs: 3000 } as const;

const FAST_FREQ = new Set(["SECONDLY", "MINUTELY", "HOURLY"]);

function hasFastRule(comp: Comp): boolean {
  return comp.getAllProperties("rrule").some((p) => {
    const v = p.getFirstValue() as { freq?: string } | null;
    return typeof v?.freq === "string" && FAST_FREQ.has(v.freq.toUpperCase());
  });
}

export class IcsError extends Error {
  constructor() {
    super("datei");
    this.name = "IcsError";
  }
}

export interface ImportWindow {
  from: Date;
  to: Date;
}

/** Window used for imports: 31 days back to 366 days ahead of `now`. */
export function defaultWindow(now: Date = new Date()): ImportWindow {
  return { from: new Date(now.getTime() - 31 * 86_400_000), to: new Date(now.getTime() + 366 * 86_400_000) };
}

type Time = InstanceType<typeof ICAL.Time>;
type Comp = InstanceType<typeof ICAL.Component>;

const clip = (s: string | null | undefined, n: number): string | null => {
  const t = (s ?? "").replace(/\r\n?/g, "\n").trim();
  return t === "" ? null : t.slice(0, n);
};

function wallDate(t: Time): string {
  return `${String(t.year).padStart(4, "0")}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

/** UTC instant of an ical.js time. Floating times and unknown TZIDs read as wall clock in `tzid` (or the family zone). */
function toInstant(t: Time, tzid: string | null, familyTz: string): Date {
  const zone = t.zone as { tzid?: string } | undefined;
  const id = zone?.tzid;
  if (id === "UTC" || id === "Z") return new Date(t.toUnixTime() * 1000);
  if (id && id !== "floating" && isRegistered(id)) return new Date(t.toUnixTime() * 1000);
  const tz = tzid && isValidTimeZone(tzid) ? tzid : familyTz;
  return zonedToUtc(wallDate(t), `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`, tz);
}

const registered = new Set<string>();
function isRegistered(id: string): boolean {
  return registered.has(id);
}

function tzidOf(comp: Comp): string | null {
  const p = comp.getFirstProperty("dtstart");
  const v = p?.getParameter("tzid");
  return typeof v === "string" ? v : null;
}

/**
 * Parses and expands the text. Throws IcsError when it is not an iCalendar document.
 * `familyTz` is only used for floating times and TZIDs the file does not define and Intl does not know.
 */
export function parseIcs(text: string, familyTz: string, window: ImportWindow = defaultWindow(), limits: Partial<Record<keyof typeof ICS_LIMITS, number>> = {}): ParseResult {
  const lim = { ...ICS_LIMITS, ...limits };
  const deadline = Date.now() + lim.maxMs;
  let root: Comp;
  try {
    const stripped = text.replace(/^﻿/, "").trim();
    if (!/^BEGIN:VCALENDAR/i.test(stripped)) throw new IcsError();
    root = new ICAL.Component(ICAL.parse(stripped));
  } catch {
    throw new IcsError();
  }
  if (root.name !== "vcalendar") throw new IcsError();

  // Time zones defined inside the file win over Intl names.
  ICAL.TimezoneService.reset();
  registered.clear();
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    try {
      const tz = new ICAL.Timezone(vtz);
      ICAL.TimezoneService.register(tz);
      registered.add(tz.tzid);
    } catch {
      /* ignore broken zone definitions */
    }
  }

  const out = new Map<string, ParsedEvent>();
  let truncated = false;
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>();
  const exceptions: InstanceType<typeof ICAL.Event>[] = [];
  const singles: InstanceType<typeof ICAL.Event>[] = [];
  const vevents = root.getAllSubcomponents("vevent");
  if (vevents.length > lim.maxVevents) truncated = true;
  for (const v of vevents.slice(0, lim.maxVevents)) {
    let ev;
    try {
      ev = new ICAL.Event(v);
    } catch {
      continue;
    }
    if (!ev.uid) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else if (hasFastRule(v)) {
      truncated = true; // sub-daily rules are not expanded, the first instance stays
      v.removeAllProperties("rrule");
      v.removeAllProperties("rdate");
      singles.push(ev);
    } else if (v.hasProperty("rrule") || v.hasProperty("rdate")) masters.set(ev.uid, ev);
    else singles.push(ev);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);
  // An override whose master is missing is shown as a single event.
  for (const ex of exceptions) if (!masters.has(ex.uid)) singles.push(ex);

  const winFrom = window.from.getTime();
  const winTo = window.to.getTime();

  const add = (ev: InstanceType<typeof ICAL.Event>, start: Time, end: Time | null, tzid: string | null, key: string) => {
    if (out.size >= lim.maxEvents) {
      truncated = true;
      return;
    }
    const title = clip(ev.summary, 200) ?? "(ohne Titel)";
    const base = { uid: String(ev.uid).slice(0, 500), title, description: clip(ev.description, 4000), location: clip(ev.location, 300) };
    if (start.isDate) {
      let last = wallDate(start);
      if (end && end.isDate) {
        const e = addDays(wallDate(end), -1); // DTEND is exclusive
        if (e > last) last = e;
      }
      const startMs = Date.parse(`${wallDate(start)}T00:00:00Z`);
      const endMs = Date.parse(`${last}T23:59:59Z`);
      if (endMs < winFrom - 86_400_000 || startMs > winTo + 86_400_000) return;
      out.set(`${base.uid}|${key}`, { ...base, instanceKey: key, allDay: true, startsAt: null, endsAt: null, startDate: wallDate(start), endDate: last });
      return;
    }
    const s = toInstant(start, tzid, familyTz);
    let e = end ? toInstant(end, tzid, familyTz) : s;
    if (e < s) e = s;
    if (e.getTime() < winFrom || s.getTime() > winTo) return;
    out.set(`${base.uid}|${key}`, { ...base, instanceKey: key, allDay: false, startsAt: s, endsAt: e, startDate: null, endDate: null });
  };

  for (const ev of singles) {
    if (out.size >= lim.maxEvents) {
      truncated = true;
      break;
    }
    const start = ev.startDate;
    if (!start) continue;
    const tz = tzidOf(ev.component);
    add(ev, start, ev.endDate ?? null, tz, start.isDate ? wallDate(start) : toInstant(start, tz, familyTz).toISOString());
  }

  let steps = 0; // shared by all masters
  const exhausted = () => out.size >= lim.maxEvents || steps >= lim.maxSteps || ((steps & 255) === 0 && Date.now() > deadline);
  for (const ev of masters.values()) {
    if (exhausted()) {
      truncated = true;
      break;
    }
    const tz = tzidOf(ev.component);
    let it;
    try {
      it = ev.iterator();
    } catch {
      continue;
    }
    let stop = false;
    for (;;) {
      if (exhausted()) {
        truncated = true; // budget, deadline or event cap reached before the window ended
        stop = true;
        break;
      }
      steps++;
      const next = it.next();
      if (!next) break;
      const startMs = next.isDate
        ? Date.parse(`${wallDate(next)}T00:00:00Z`)
        : toInstant(next, tz, familyTz).getTime();
      if (startMs > winTo) break;
      // cheap skip of instances long before the window (no exceptions or details needed for them)
      if (startMs < winFrom - 90 * 86_400_000) continue;
      let d;
      try {
        d = ev.getOccurrenceDetails(next);
      } catch {
        continue;
      }
      const item = d.item;
      const itemTz = tzidOf(item.component) ?? tz;
      add(item, d.startDate, d.endDate ?? null, itemTz, next.isDate ? wallDate(next) : toInstant(next, tz, familyTz).toISOString());
    }
    if (stop) break;
  }

  const name = root.getFirstPropertyValue("x-wr-calname");
  return { events: [...out.values()], truncated, calendarName: typeof name === "string" ? clip(name, 100) : null };
}

/** Wall clock parts of an event start in the family zone (used when rendering). */
export function startLocal(e: { startsAt: Date }, tz: string) {
  return localParts(e.startsAt, tz);
}

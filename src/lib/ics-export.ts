// Pure ICS (RFC 5545) writer for the private calendar feed. Instances are written expanded (no RRULE),
// timed ones in UTC, all-day ones as DATE values with an exclusive end.

import type { CalendarItem } from "./calendar-items";
import { addDays } from "./week";
import { zonedToUtc } from "./tz";

export interface FeedBirthday {
  id: string;
  name: string;
  date: string;
}

/** Escapes TEXT values (backslash, semicolon, comma, newlines). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n").replace(/[\u0000-\u001f\u007f]/g, "");
}

/** Folds a content line to at most 75 octets per line (UTF-8 safe). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const max = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (len + n > max) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateVal = (iso: string) => iso.replace(/-/g, "");

export function buildIcs(opts: { name: string; tz: string; items: CalendarItem[]; birthdays: FeedBirthday[]; host: string; now?: Date }): string {
  const stamp = utc(opts.now ?? new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plan4JU//Familienkalender//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(opts.name)}`];
  for (const i of opts.items) {
    lines.push("BEGIN:VEVENT", `UID:${escapeText(`${i.key}@${opts.host}`)}`, `DTSTAMP:${stamp}`);
    if (i.allDay || !i.startTime) {
      lines.push(`DTSTART;VALUE=DATE:${dateVal(i.startDate)}`, `DTEND;VALUE=DATE:${dateVal(addDays(i.endDate, 1))}`);
    } else {
      const start = zonedToUtc(i.startDate, i.startTime, opts.tz);
      // endTime null means the end is midnight after endDate.
      const end = i.endTime ? zonedToUtc(i.endDate, i.endTime, opts.tz) : zonedToUtc(addDays(i.endDate, 1), "00:00", opts.tz);
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end > start ? end : start)}`);
    }
    lines.push(`SUMMARY:${escapeText(i.title)}`);
    if (i.location) lines.push(`LOCATION:${escapeText(i.location)}`);
    if (i.description) lines.push(`DESCRIPTION:${escapeText(i.description)}`);
    lines.push("END:VEVENT");
  }
  for (const b of opts.birthdays) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(`birthday-${b.id}-${b.date}@${opts.host}`)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateVal(b.date)}`,
      `DTEND;VALUE=DATE:${dateVal(addDays(b.date, 1))}`,
      `SUMMARY:${escapeText(`Geburtstag: ${b.name}`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Time zone helpers built on Intl only (no dependency). An "instant" is a Date (UTC); a local time is
// a calendar day "YYYY-MM-DD" plus "HH:MM" in an IANA zone.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

/** Wall clock of an instant in the zone. */
export function localParts(at: Date, tz: string): LocalParts {
  const p = formatter(tz).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Offset (zone minus UTC) in ms at the instant. */
function offsetAt(at: Date, tz: string): number {
  const p = formatter(tz).formatToParts(at);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant of a wall clock time in the zone. A time that does not exist (spring forward gap)
 * moves forward by the gap (02:30 becomes 03:30); an ambiguous time (autumn, twice) takes the first one.
 */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const DAY = 86_400_000;
  const before = offsetAt(new Date(guess - DAY), tz);
  const after = offsetAt(new Date(guess + DAY), tz);
  const candidates = [...new Set([before, after])]
    .map((off) => new Date(guess - off))
    .filter((c) => {
      const l = localParts(c, tz);
      return l.date === date && l.time === `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (candidates.length) return candidates[0]!;
  return new Date(guess - before); // gap: use the offset in force before the change
}

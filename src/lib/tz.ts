// Time zone helpers built on Intl only (no dependency). An "instant" is a Date (UTC); a local time is
// a calendar day "YYYY-MM-DD" plus "HH:MM" in an IANA zone.

// Two bounded caches. Zone names come from user input (family setting, TZID in imported files), so
// neither may grow without limit: `byZone` is keyed by the canonical name Intl reports
// (resolvedOptions().timeZone), `byName` maps a spelling to it. Invalid names throw and are never cached.
export const TZ_CACHE_MAX = 500;
const byZone = new Map<string, Intl.DateTimeFormat>();
const byName = new Map<string, Intl.DateTimeFormat>();

function remember<V>(m: Map<string, V>, k: string, v: V) {
  if (m.size >= TZ_CACHE_MAX) m.delete(m.keys().next().value!); // drop the oldest entry
  m.set(k, v);
}

function formatter(tz: string): Intl.DateTimeFormat {
  const hit = byName.get(tz);
  if (hit) return hit;
  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, // throws RangeError for an unknown zone: nothing is cached then
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const zone = created.resolvedOptions().timeZone;
  let f = byZone.get(zone);
  if (!f) {
    f = created;
    remember(byZone, zone, f);
  }
  remember(byName, tz, f);
  return f;
}

/** Sizes of the formatter caches (for tests). */
export function tzCacheSize(): { zones: number; names: number } {
  return { zones: byZone.size, names: byName.size };
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

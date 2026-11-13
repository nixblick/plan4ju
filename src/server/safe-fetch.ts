import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { createGunzip, createInflate } from "node:zlib";

// Server-side retrieval of a calendar subscription URL (SSRF protection).
//  - https only, port 443 only, no user info; webcal:// is read as https://
//  - the host name is resolved here, EVERY address must be public (a name with one private address
//    is refused); the connection then goes to exactly that validated address (no second DNS lookup,
//    so DNS rebinding cannot swap it)
//  - redirects are followed by hand (max 3) and every hop passes the same checks
//  - total deadline and size limit (also for the decompressed body)
// Errors carry a fixed code, never the URL or the library message (both can contain the secret).

export type FetchErrorCode = "protokoll" | "blockiert" | "aufloesung" | "zeit" | "gross" | "status" | "umleitung" | "inhalt" | "netz";

export class FetchError extends Error {
  constructor(public code: FetchErrorCode, public status?: number) {
    super(code); // only the code, never the URL
    this.name = "FetchError";
  }
  /** Stable text stored in the database, e.g. "status-404". */
  get stored(): string {
    return this.status ? `${this.code}-${this.status}` : this.code;
  }
}

// ---- address check ----------------------------------------------------------------------

function parseV4(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return ((o[0]! << 24) | (o[1]! << 16) | (o[2]! << 8) | o[3]!) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link local, includes the cloud metadata address
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Blocked(n: number): boolean {
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((parseV4(base)! & mask) >>> 0);
  });
}

/** IPv6 text to 8 groups of 16 bit; handles "::" and an embedded dotted IPv4 tail. null if invalid. */
function parseV6(s: string): number[] | null {
  let str = s.split("%")[0]!.toLowerCase();
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(str);
  if (tail) {
    const v4 = parseV4(tail[1]!);
    if (v4 === null) return null;
    str = str.slice(0, -tail[1]!.length) + ((v4 >>> 16) & 0xffff).toString(16) + ":" + (v4 & 0xffff).toString(16);
  }
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const toGroups = (p: string) => (p === "" ? [] : p.split(":"));
  const head = toGroups(halves[0]!);
  const rest = halves.length === 2 ? toGroups(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

/** True if the address must never be contacted (private, loopback, link local, metadata, reserved ...). Unparseable counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = parseV4(ip);
    return n === null || v4Blocked(n);
  }
  if (kind !== 6) return true;
  const g = parseV6(ip);
  if (!g) return true;
  const embeddedV4 = (hi: number, lo: number) => v4Blocked((((hi << 16) | lo) >>> 0));
  const allZeroTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (allZeroTo(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (allZeroTo(5) && g[5] === 0xffff) return embeddedV4(g[6]!, g[7]!); // ::ffff:a.b.c.d
  if (allZeroTo(6)) return true; // ::a.b.c.d (deprecated IPv4 compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embeddedV4(g[6]!, g[7]!); // NAT64
  if (g[0] === 0x2001 && g[1] === 0x0000) return true; // 2001::/32 Teredo (embeds an obfuscated IPv4 address)
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0x0001) return true; // 64:ff9b:1::/48 local-use NAT64
  if (g[0] === 0x2002) return embeddedV4(g[1]!, g[2]!); // 6to4
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard prefix
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local (includes fd00:ec2::254)
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g[0]! & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (deprecated)
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

// ---- URL check --------------------------------------------------------------------------

/** Validates and normalizes a user supplied calendar address. Throws FetchError("protokoll"/"blockiert"). */
export function parseCalendarUrl(raw: string): URL {
  const text = raw.trim().replace(/^webcal:\/\//i, "https://");
  if (text.length > 2000) throw new FetchError("protokoll");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new FetchError("protokoll");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new FetchError("protokoll");
  if (url.port !== "" && url.port !== "443") throw new FetchError("protokoll");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchError("blockiert");
  }
  if (isIP(host) && isBlockedAddress(host)) throw new FetchError("blockiert");
  return url;
}

// ---- retrieval --------------------------------------------------------------------------

export interface Resolved {
  address: string;
  family: 4 | 6;
}
export type Resolver = (host: string) => Promise<Resolved[]>;
export interface TransportRequest {
  url: URL;
  to: Resolved;
  signal: AbortSignal;
  maxBytes: number;
}
export interface TransportResponse {
  status: number;
  location?: string;
  body: Buffer;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

const defaultResolver: Resolver = async (host) => {
  const list = await dnsLookup(host, { all: true, verbatim: true });
  return list.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

/** Connects to the already validated address (custom lookup), keeps the host name for SNI and certificate check. */
const defaultTransport: Transport = ({ url, to, signal, maxBytes }) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: 443,
        path: url.pathname + url.search,
        method: "GET",
        agent: false,
        signal,
        headers: { Accept: "text/calendar, text/plain;q=0.5, */*;q=0.1", "Accept-Encoding": "gzip, deflate", "User-Agent": "Plan4JU-calendar-sync" },
        lookup: (_h, opts, cb) => {
          const wantAll = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
          if (wantAll) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: to.address, family: to.family }]);
          else cb(null, to.address, to.family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const loc = res.headers.location;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: typeof loc === "string" ? loc : undefined, body: Buffer.alloc(0) });
          return;
        }
        if (status !== 200) {
          res.resume();
          resolve({ status, body: Buffer.alloc(0) });
          return;
        }
        const enc = String(res.headers["content-encoding"] ?? "identity").toLowerCase();
        const decoder = enc === "gzip" ? createGunzip() : enc === "deflate" ? createInflate() : null;
        if (enc !== "identity" && !decoder) {
          res.resume();
          reject(new FetchError("inhalt"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const out = decoder ? res.pipe(decoder) : res;
        out.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new FetchError("gross"));
            return;
          }
          chunks.push(c);
        });
        out.on("end", () => resolve({ status, body: Buffer.concat(chunks) }));
        out.on("error", () => reject(new FetchError("netz")));
        res.on("error", () => reject(new FetchError("netz")));
      },
    );
    req.on("error", () => reject(signal.aborted ? new FetchError("zeit") : new FetchError("netz")));
    req.end();
  });

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolve?: Resolver;
  transport?: Transport;
}

export const FETCH_LIMITS = { timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3 } as const;

/** Fetches the calendar text. Throws FetchError only. */
export async function fetchCalendarText(raw: string, opts: FetchOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? FETCH_LIMITS.timeoutMs;
  const maxBytes = opts.maxBytes ?? FETCH_LIMITS.maxBytes;
  const maxRedirects = opts.maxRedirects ?? FETCH_LIMITS.maxRedirects;
  const resolve = opts.resolve ?? defaultResolver;
  const transport = opts.transport ?? defaultTransport;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const deadline = new Promise<never>((_, rej) => ctl.signal.addEventListener("abort", () => rej(new FetchError("zeit"))));
  deadline.catch(() => undefined);
  try {
    const work = (async () => {
      let url = parseCalendarUrl(raw);
      for (let hop = 0; ; hop++) {
        const host = url.hostname.replace(/^\[|\]$/g, "");
        let addresses: Resolved[];
        if (isIP(host)) addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
        else {
          try {
            addresses = await resolve(host);
          } catch {
            throw new FetchError("aufloesung");
          }
        }
        if (addresses.length === 0) throw new FetchError("aufloesung");
        if (addresses.some((a) => isBlockedAddress(a.address))) throw new FetchError("blockiert");
        let res: TransportResponse;
        try {
          res = await transport({ url, to: addresses[0]!, signal: ctl.signal, maxBytes });
        } catch (e) {
          throw e instanceof FetchError ? e : new FetchError(ctl.signal.aborted ? "zeit" : "netz");
        }
        if (res.status >= 300 && res.status < 400) {
          if (!res.location || hop >= maxRedirects) throw new FetchError("umleitung");
          let next: URL;
          try {
            next = parseCalendarUrl(new URL(res.location, url).href);
          } catch (e) {
            throw e instanceof FetchError && e.code === "blockiert" ? e : new FetchError("umleitung");
          }
          url = next;
          continue;
        }
        if (res.status !== 200) throw new FetchError("status", res.status);
        if (res.body.length > maxBytes) throw new FetchError("gross");
        return res.body.toString("utf8");
      }
    })();
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** German explanation for a stored error code (never contains the address). */
export function fetchErrorText(stored: string | null): string | null {
  if (!stored) return null;
  const [code, status] = stored.split("-");
  switch (code) {
    case "protokoll": return "Die Adresse ist nicht zulässig. Erlaubt ist nur https (oder webcal) ohne Benutzer und Passwort.";
    case "blockiert": return "Die Adresse zeigt auf ein internes oder gesperrtes Netz und wird nicht abgerufen.";
    case "aufloesung": return "Der Server der Adresse wurde nicht gefunden.";
    case "zeit": return "Der Abruf hat zu lange gedauert.";
    case "gross": return "Die Kalenderdatei ist zu groß.";
    case "status": return `Der Kalenderserver antwortet mit Fehler ${status ?? ""}. Ist die Adresse noch gültig?`.replace("  ", " ");
    case "umleitung": return "Die Adresse leitet unzulässig weiter.";
    case "inhalt": return "Die Antwort ist keine gültige Kalenderdatei.";
    case "datei": return "Die Datei ist keine gültige Kalenderdatei (iCalendar).";
    case "schluessel": return "Die gespeicherte Adresse kann nicht mehr gelesen werden (zum Beispiel nach einem Wechsel des Server-Schlüssels). Bitte lösche den Kalender und abonniere ihn neu.";
    case "netz": return "Der Kalenderserver ist nicht erreichbar.";
    default: return "Der Abruf hat nicht geklappt.";
  }
}

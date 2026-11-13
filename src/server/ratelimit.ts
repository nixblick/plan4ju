import { RateLimitError } from "./errors";

// Fixed-window limiter for server actions (login, password reset), which do not pass
// through Better Auth's HTTP rate limiter. In memory: it protects one instance; run
// more than one and put a limit in the reverse proxy as well.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): void {
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const h = hits.get(key);
  if (!h || h.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  h.count += 1;
  if (h.count > max) throw new RateLimitError();
}

export function resetRateLimits(): void {
  hits.clear();
}

/** Throws when `key` already has `max` hits in its window; does not count this call. */
export function assertBelowLimit(key: string, max: number, now = Date.now()): void {
  const h = hits.get(key);
  if (h && h.resetAt > now && h.count >= max) throw new RateLimitError();
}

/** Counts one hit (e.g. a failed login) without checking the limit. */
export function recordHit(key: string, windowMs: number, now = Date.now()): void {
  const h = hits.get(key);
  if (!h || h.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
  else h.count += 1;
}

export function clearLimit(key: string): void {
  hits.delete(key);
}

/** Lower-cased, trimmed e-mail; null if it is not a plausible address. */
export function normalizeLoginEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Failed logins per e-mail and client address: hard block. Only failures count. */
export const LOGIN_FAILURES = { max: 5, windowMs: 15 * 60 * 1000 } as const;
export const loginFailureKey = (email: string, ip: string) => `login:pair:${JSON.stringify([email, ip])}`;
/**
 * Failed logins per account across all addresses (rotating IPs). Above the threshold every
 * attempt is slowed down (1, 2, 4, 8, 10 s ...) instead of refused, so a stranger cannot lock
 * the owner out, but brute force over many addresses gets slow.
 */
export const ACCOUNT_FAILURES = { threshold: 20, windowMs: 15 * 60 * 1000, maxDelayMs: 10_000 } as const;
export const accountFailureKey = (email: string) => `login:acct:${JSON.stringify([email])}`;
/**
 * A known device (signed cookie from an earlier successful login, see device-cookie.ts) is exempt
 * from the account's delay, but every failure still counts on the account counter (issue 8): many
 * device cookies cannot spread failures to dodge the account brake. The device additionally has its
 * own counter, so a leaked device cookie is braked like a stranger once it fails on its own.
 */
export const deviceFailureKey = (email: string, deviceId: string) => `login:dev:${JSON.stringify([email, deviceId])}`;
/** The counter that delays this attempt: the device's own for a known device, else the account's. */
export const brakeKey = (email: string, deviceId?: string | null) => (deviceId ? deviceFailureKey(email, deviceId) : accountFailureKey(email));

/** At most this many known devices per account are exempt from the account delay at a time. */
export const MAX_KNOWN_DEVICES = 5;
const KNOWN_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const knownDevices = new Map<string, Map<string, number>>();

/**
 * Admits a verified device id for the account's exemption, or returns null (treated as a stranger)
 * when the account already has MAX_KNOWN_DEVICES other devices seen within the last 30 days.
 */
export function admitKnownDevice(email: string, deviceId: string | null | undefined, now = Date.now()): string | null {
  if (!deviceId) return null;
  let seen = knownDevices.get(email);
  if (!seen) {
    if (knownDevices.size > 10_000) knownDevices.clear();
    seen = new Map();
    knownDevices.set(email, seen);
  }
  for (const [id, t] of seen) if (t + KNOWN_DEVICE_TTL_MS <= now) seen.delete(id);
  if (!seen.has(deviceId) && seen.size >= MAX_KNOWN_DEVICES) return null;
  seen.set(deviceId, now);
  return deviceId;
}

/** Forgets the known devices of an account (tests, and after its security stamp changed). */
export function forgetKnownDevices(email?: string): void {
  if (email) knownDevices.delete(email);
  else knownDevices.clear();
}

function countOf(key: string, now: number): number {
  const h = hits.get(key);
  return h && h.resetAt > now ? h.count : 0;
}

/** Hard check before the password is verified (e-mail + address only). */
export function assertLoginAllowed(email: string, ip: string, now = Date.now()): void {
  assertBelowLimit(loginFailureKey(email, ip), LOGIN_FAILURES.max, now);
}

/** Delay before verifying the password: account failures for strangers, the device's own for a known device. */
export function loginDelayMs(email: string, now = Date.now(), deviceId?: string | null): number {
  const over = countOf(brakeKey(email, deviceId), now) - ACCOUNT_FAILURES.threshold;
  if (over < 0) return 0;
  return Math.min(1000 * 2 ** over, ACCOUNT_FAILURES.maxDelayMs);
}

/** Every failure counts on the address pair and the account; a known device's also on its own counter. */
export function recordLoginFailure(email: string, ip: string, now = Date.now(), deviceId?: string | null): void {
  recordHit(loginFailureKey(email, ip), LOGIN_FAILURES.windowMs, now);
  recordHit(accountFailureKey(email), ACCOUNT_FAILURES.windowMs, now);
  if (deviceId) recordHit(deviceFailureKey(email, deviceId), ACCOUNT_FAILURES.windowMs, now);
}

/**
 * Success clears the address pair and the counter that delayed this attempt. A known device only
 * clears its own counter: a stranger's flood on the account must not be reset by the owner logging in.
 */
export function recordLoginSuccess(email: string, ip: string, deviceId?: string | null): void {
  clearLimit(loginFailureKey(email, ip));
  clearLimit(brakeKey(email, deviceId));
}

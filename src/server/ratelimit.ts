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

/** Failed logins per e-mail and client address. Only failures count, a success resets it. */
export const LOGIN_FAILURES = { max: 5, windowMs: 15 * 60 * 1000 } as const;
export const loginFailureKey = (email: string, ip: string) => `login:fail:${email}:${ip}`;

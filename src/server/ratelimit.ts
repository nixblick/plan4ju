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
